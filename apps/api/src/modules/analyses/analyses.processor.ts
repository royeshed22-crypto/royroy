import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService, AnalysisResult } from '../ai/ai.service';
import { ExtractorService } from '../ai/extractor.service';
import { MemoryUpdaterService } from '../ai/memory-updater.service';
import { ConversationService } from '../conversation/conversation.service';
import { ContextBuilderService } from '../conversation/context-builder.service';
import { RelationshipMemory } from '../ai/memory.types';

/**
 * Runs one scan end to end.
 *
 * The pipeline is deliberately staged so screenshots are read exactly once and
 * never sent again:
 *
 *   1. extract   images -> messages
 *   2. resolve   figure out which relationship this is
 *   3. ingest    append to the timeline, collapsing screenshot overlap
 *   4. context   assemble memory + a recent window, not the whole history
 *   5. analyse   scores, flags, advice from text alone
 *   6. remember  fold what changed into long-term memory
 *   7. reply     nine suggestions, informed by all of the above
 *   8. persist   everything in one transaction
 */
@Processor('analyses')
export class AnalysesProcessor {
  private readonly logger = new Logger(AnalysesProcessor.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private extractor: ExtractorService,
    private memoryUpdater: MemoryUpdaterService,
    private conversation: ConversationService,
    private contextBuilder: ContextBuilderService,
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

      // 1. Read the screenshots. This is the only step that touches images.
      const extracted = await this.extractor.extractMany(
        analysis.uploads.map((u) => u.path),
      );

      // 2. Work out who this conversation is with.
      const contactId =
        analysis.contactId ??
        (extracted.contactName
          ? await this.resolveContact(userId, extracted.contactName)
          : await this.resolveContact(userId, 'Unknown'));

      if (!contactId) throw new Error('Could not resolve a contact for this analysis');

      if (contactId !== analysis.contactId) {
        this.logger.log(`Linked analysis ${analysisId} to contact ${contactId}`);
      }

      // 3. Merge into the timeline, dropping whatever overlapped.
      const ingest = await this.conversation.ingest(userId, contactId, extracted.messages, {
        analysisId,
        source: analysis.isImport ? 'IMPORT' : 'SCREENSHOT',
      });

      // An import only backfills history; it does not need scores or replies.
      if (analysis.isImport) {
        await this.finishImport(analysisId, contactId, userId, ingest, extracted.language);
        return;
      }

      // 4. Build a bounded context: memory plus a recent window, not everything.
      const context = await this.contextBuilder.build({
        contactId,
        userContext: analysis.userContext,
        userQuery: analysis.userContext,
      });

      // 5. Analyse from text. The images are already behind us.
      const result = await this.aiService.analyzeConversation(context.text, {
        communicationStyle: (await this.prisma.user.findUnique({ where: { id: userId } }))
          ?.communicationStyle,
        language: extracted.language,
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

      // 6. Update long-term memory from the messages that are actually new.
      const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
      const existingMemory = this.memoryUpdater.parse(contact?.aiMemory);
      const update = await this.memoryUpdater.computeUpdate(
        existingMemory,
        ingest.added > 0
          ? extracted.messages.slice(-ingest.added)
          : extracted.messages.slice(-20),
        { contactName: contact?.displayName, userContext: analysis.userContext },
      );
      const memory = this.memoryUpdater.merge(existingMemory, update);

      // 7. Replies see the updated memory, so a callback can reference
      //    something learned moments ago in this same batch.
      const withMemory = await this.contextBuilder.build({
        contactId,
        userContext: analysis.userContext,
      });
      const repliesResult = await this.aiService.generateReplies(result, withMemory.text);
      const replies = (repliesResult.replies ?? []).filter((r) => r.text?.trim());

      // 8. One transaction: a client polling for COMPLETED never sees a
      //    half-written analysis.
      await this.persistResult({
        analysisId, userId, contactId, result, replies, memory,
        stage: update?.stage, ingest, language: extracted.language,
      });

      this.logger.log(
        `Analysis ${analysisId} done: +${ingest.added} messages, ${replies.length} replies`,
      );
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

  /**
   * A bulk import just records history and builds initial memory. There is
   * nothing to reply to, so scoring is skipped.
   */
  private async finishImport(
    analysisId: string,
    contactId: string,
    userId: string,
    ingest: { found: number; added: number; duplicates: number; totalOnTimeline: number },
    language: string,
  ) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    const existing = this.memoryUpdater.parse(contact?.aiMemory);

    const recent = await this.prisma.conversationMessage.findMany({
      where: { contactId },
      orderBy: { orderIndex: 'desc' },
      take: 60,
      select: { speaker: true, text: true },
    });

    const update = await this.memoryUpdater.computeUpdate(existing, recent.reverse(), {
      contactName: contact?.displayName,
    });
    const memory = this.memoryUpdater.merge(existing, update);

    await this.prisma.$transaction(async (tx) => {
      await tx.contact.update({
        where: { id: contactId },
        data: {
          aiMemory: memory as any,
          summary: memory.summary || undefined,
          stage: (update?.stage?.toUpperCase() as any) ?? undefined,
          lastActivityAt: new Date(),
        },
      });

      await tx.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETED',
          contactId,
          language,
          summary: `Imported ${ingest.added} messages. The conversation history is now saved.`,
          messagesFound: ingest.found,
          messagesNew: ingest.added,
          completedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Import ${analysisId}: ${ingest.added} of ${ingest.found} messages added, ${ingest.totalOnTimeline} on timeline`,
    );
  }

  /** Finds an existing contact by name (case-insensitive) or creates one. */
  private async resolveContact(userId: string, rawName: string): Promise<string | null> {
    const name = rawName.trim().slice(0, 60);
    if (!name) return null;

    const existing = await this.prisma.contact.findFirst({
      where: { userId, displayName: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing.id;

    const created = await this.prisma.contact.create({ data: { userId, displayName: name } });
    return created.id;
  }

  private async persistResult(args: {
    analysisId: string;
    userId: string;
    contactId: string;
    result: AnalysisResult;
    replies: Array<{ tone: string; intensity?: number; text: string; riskLevel: string; explanation: string }>;
    memory: RelationshipMemory;
    stage?: string;
    ingest: { found: number; added: number };
    language: string;
  }) {
    const { analysisId, userId, contactId, result, replies, memory, stage, ingest, language } = args;

    await this.prisma.$transaction(async (tx) => {
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
          language,
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
          messagesFound: ingest.found,
          messagesNew: ingest.added,
          promptVersion: '3.0',
          completedAt: new Date(),
        },
      });

      await tx.contact.update({
        where: { id: contactId },
        data: {
          currentVibeScore: result.scores.vibe,
          lastActivityAt: new Date(),
          aiMemory: memory as any,
          summary: memory.summary || undefined,
          stage: (stage?.toUpperCase() as any) ?? undefined,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { eloScore: { increment: Math.round((result.scores.overall - 50) / 10) } },
      });
    });
  }
}
