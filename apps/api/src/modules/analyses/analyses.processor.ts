import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

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
        include: { uploads: true },
      });

      if (!analysis || analysis.uploads.length === 0) {
        throw new Error('No uploads found for analysis');
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      const imagePaths = analysis.uploads.map((u) => u.path);
      const result = await this.aiService.analyzeConversation(imagePaths, {
        communicationStyle: user?.communicationStyle,
        goals: user?.goals,
        language: user?.language,
      });

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

      await this.prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETED',
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
          modelVersion: 'gpt-4o',
          promptVersion: '1.0',
          completedAt: new Date(),
        },
      });

      // Save extracted messages
      if (result.extractedMessages?.length > 0) {
        const messageData = result.extractedMessages.map((m, idx) => {
          const msgAnalysis = result.messageAnalysis?.find((ma) => ma.orderIndex === m.orderIndex);
          return {
            analysisId,
            speaker: m.speaker === 'self' ? 'SELF' : m.speaker === 'other' ? 'OTHER' : 'UNKNOWN',
            text: m.text,
            orderIndex: idx,
            sentiment: msgAnalysis?.sentiment ?? 'neutral',
            score: msgAnalysis?.score ?? null,
            explanation: msgAnalysis?.note ?? null,
          };
        });

        await this.prisma.analysisMessage.createMany({ data: messageData as any });
      }

      // Generate replies
      const repliesResult = await this.aiService.generateReplies(result, result.extractedMessages);
      const validReplies = (repliesResult.replies ?? []).filter((r) => r.text?.trim());
      if (validReplies.length > 0) {
        await this.prisma.suggestedReply.createMany({
          data: validReplies.map((r) => ({
            analysisId,
            userId,
            text: r.text,
            tone: r.tone as any,
            riskLevel: r.riskLevel as any,
            explanation: r.explanation,
          })),
        });
      }

      // Update contact vibe score
      if (analysis.contactId) {
        await this.prisma.contact.update({
          where: { id: analysis.contactId },
          data: {
            currentVibeScore: result.scores.vibe,
            lastActivityAt: new Date(),
          },
        });
      }

      // Update user ELO
      const eloGain = Math.round((result.scores.overall - 50) / 10);
      await this.prisma.user.update({
        where: { id: userId },
        data: { eloScore: { increment: eloGain } },
      });

      this.logger.log(`Analysis ${analysisId} completed successfully`);
    } catch (err) {
      // Only mark FAILED once BullMQ has exhausted its retries — otherwise the
      // UI shows a failure for an attempt that is about to be retried.
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(
        `Analysis ${analysisId} attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} failed: ${err.message}`,
      );

      if (isFinalAttempt) {
        await this.prisma.analysis.update({
          where: { id: analysisId },
          data: { status: 'FAILED', failureCode: 'PROCESSING_ERROR' },
        }).catch(() => {});
      }
      throw err;
    }
  }
}
