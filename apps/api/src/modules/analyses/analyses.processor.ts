import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService, AnalysisResult, ConversationHistoryEntry } from '../ai/ai.service';

/** Past analyses to feed back into the model as context. */
const HISTORY_LIMIT = 5;

@Processor('analyses')
export class AnalysesProcessor {
  private readonly logger = new Logger(AnalysesProcessor.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  @Process('process')
  async processAnalysis(job: Job<{ analysisId: string; userId: string; goal?: string }>) {
    const { analysisId, userId } = job.data;
    this.logger.log(`Processing analysis ${analysisId}`);

    try {
      await this.prisma.analysis.update({
        where: { id: analysisId },
        data: { status: 'PROCESSING' },
      });

      const analysis = await this.prisma.analysis.findUnique({
        where: { id: analysisId },
        include: { uploads: true, contact: true },
      });

      if (!analysis || analysis.uploads.length === 0) {
        throw new Error('No uploads found for analysis');
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      // If the user already picked a contact, we can prime the model with their
      // history up front. Otherwise we discover who this is from the screenshot.
      let contactId = analysis.contactId;
      let history = contactId ? await this.loadHistory(contactId, analysisId) : [];

      const result = await this.aiService.analyzeConversation(
        analysis.uploads.map((u) => u.path),
        {
          communicationStyle: user?.communicationStyle,
          goals: user?.goals,
          language: user?.language,
        },
        history,
        analysis.contact?.displayName,
      );

      if (result.safetyDecision === 'block') {
        await this.prisma.analysis.update({
          where: { id: analysisId },
          data: {
            status: 'BLOCKED',
            failureCode: 'SAFETY_BLOCK',
            summary: result.safetyNote ?? 'Content blocked for safety reasons.',
          },
        });
        return;
      }

      // Link to a contact using the name read off the chat header, so repeat
      // scans of the same person accumulate into one thread automatically.
      if (!contactId && result.contactName) {
        contactId = await this.resolveContact(userId, result.contactName);
        if (contactId) {
          history = await this.loadHistory(contactId, analysisId);
          this.logger.log(`Linked analysis ${analysisId} to contact "${result.contactName}"`);
        }
      }

      // Replies are generated before anything is marked COMPLETED — the client
      // stops polling on that status, so writing it early surfaces an analysis
      // with no replies attached.
      const repliesResult = await this.aiService.generateReplies(
        result,
        result.extractedMessages ?? [],
        history,
      );
      const replies = (repliesResult.replies ?? []).filter((r) => r.text?.trim());

      await this.persistResult(analysisId, userId, contactId, result, replies);

      this.logger.log(`Analysis ${analysisId} completed with ${replies.length} replies`);
    } catch (err) {
      const attempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= attempts;
      this.logger.error(
        `Analysis ${analysisId} attempt ${job.attemptsMade + 1}/${attempts} failed: ${err.message}`,
      );

      if (isFinalAttempt) {
        await this.prisma.analysis
          .update({
            where: { id: analysisId },
            data: { status: 'FAILED', failureCode: 'PROCESSING_ERROR' },
          })
          .catch(() => {});
      }
      throw err;
    }
  }

  /** Finds an existing contact by name (case-insensitive) or creates one. */
  private async resolveContact(userId: string, rawName: string): Promise<string | null> {
    const name = rawName.trim();
    if (!name || name.length > 60) return null;

    const existing = await this.prisma.contact.findFirst({
      where: { userId, displayName: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing.id;

    const created = await this.prisma.contact.create({
      data: { userId, displayName: name },
    });
    return created.id;
  }

  private async loadHistory(
    contactId: string,
    excludeAnalysisId: string,
  ): Promise<ConversationHistoryEntry[]> {
    const past = await this.prisma.analysis.findMany({
      where: { contactId, status: 'COMPLETED', id: { not: excludeAnalysisId } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        createdAt: true,
        vibeScore: true,
        interestScore: true,
        conversationStage: true,
        summary: true,
      },
    });

    // Oldest first so the model reads the arc in order.
    return past.reverse().map((p) => ({
      date: p.createdAt,
      vibeScore: p.vibeScore ?? undefined,
      interestScore: p.interestScore ?? undefined,
      stage: p.conversationStage ?? undefined,
      summary: p.summary ?? undefined,
    }));
  }

  /**
   * Writes messages, replies, and the COMPLETED status in one transaction, so a
   * client polling for completion never sees a half-populated analysis.
   */
  private async persistResult(
    analysisId: string,
    userId: string,
    contactId: string | null,
    result: AnalysisResult,
    replies: AnalysisReplies,
  ) {
    const messages = (result.extractedMessages ?? []).map((m, idx) => ({
      analysisId,
      speaker: m.speaker === 'self' ? 'SELF' : m.speaker === 'other' ? 'OTHER' : 'UNKNOWN',
      text: m.text,
      orderIndex: idx,
      sentiment: result.messageAnalysis?.find((ma) => ma.orderIndex === m.orderIndex)?.sentiment ?? 'neutral',
      score: result.messageAnalysis?.find((ma) => ma.orderIndex === m.orderIndex)?.score ?? null,
      explanation: result.messageAnalysis?.find((ma) => ma.orderIndex === m.orderIndex)?.note ?? null,
    }));

    await this.prisma.$transaction(async (tx) => {
      if (messages.length > 0) {
        await tx.analysisMessage.createMany({ data: messages as any });
      }

      if (replies.length > 0) {
        await tx.suggestedReply.createMany({
          data: replies.map((r) => ({
            analysisId,
            userId,
            text: r.text,
            tone: r.tone as any,
            intensity: Math.min(3, Math.max(1, Math.round(r.intensity ?? 2))),
            riskLevel: r.riskLevel as any,
            explanation: r.explanation,
          })),
        });
      }

      await tx.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETED',
          contactId,
          language: result.language,
          overallScore: result.scores.overall,
          vibeScore: result.scores.vibe,
          interestScore: result.scores.interest,
          confidence: result.scores.confidence,
          summary: result.summary,
          conversationStage: result.conversationStage,
          recommendedAction: result.recommendedAction as any,
          communicationStyle: result.communicationStyle as any,
          greenFlags: result.greenFlags,
          redFlags: result.redFlags,
          disclaimer: result.disclaimer,
          promptVersion: '2.0',
          completedAt: new Date(),
        },
      });

      if (contactId) {
        await tx.contact.update({
          where: { id: contactId },
          data: { currentVibeScore: result.scores.vibe, lastActivityAt: new Date() },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { eloScore: { increment: Math.round((result.scores.overall - 50) / 10) } },
      });
    });
  }
}

type AnalysisReplies = Awaited<ReturnType<AiService['generateReplies']>>['replies'];
