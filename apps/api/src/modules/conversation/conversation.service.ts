import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DedupService, ExtractedMessage } from './dedup.service';

export interface IngestResult {
  contactId: string;
  found: number;
  added: number;
  duplicates: number;
  totalOnTimeline: number;
}

/**
 * Owns the relationship's message timeline: appending newly extracted messages,
 * collapsing overlap, and reading the thread back.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private prisma: PrismaService,
    private dedup: DedupService,
  ) {}

  /**
   * Appends a freshly extracted batch to the timeline, keeping only what is new.
   *
   * The whole timeline is loaded because the seam can sit anywhere when a user
   * re-uploads an older screenshot; conversations are small enough (hundreds of
   * rows) that this stays cheap.
   */
  async ingest(
    userId: string,
    contactId: string,
    messages: ExtractedMessage[],
    opts: { analysisId?: string; source?: 'SCREENSHOT' | 'MANUAL' | 'IMPORT' } = {},
  ): Promise<IngestResult> {
    const existing = await this.prisma.conversationMessage.findMany({
      where: { contactId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, speaker: true, text: true, orderIndex: true, fingerprint: true },
    });

    const { newMessages, duplicateCount } = this.dedup.reconcile(existing, messages);

    if (newMessages.length) {
      await this.prisma.conversationMessage.createMany({
        data: newMessages.map((m) => ({
          contactId,
          userId,
          speaker: m.speaker as any,
          text: m.text,
          orderIndex: m.orderIndex,
          sentAtRaw: m.sentAtRaw ?? null,
          fingerprint: m.fingerprint,
          source: (opts.source ?? 'SCREENSHOT') as any,
          sourceAnalysisId: opts.analysisId ?? null,
        })),
      });
    }

    // Counts only. These are private conversations and their content must not
    // be written to logs.
    this.logger.log(
      `Ingest for contact ${contactId}: ${messages.length} read, ${newMessages.length} new, ${duplicateCount} already known`,
    );

    return {
      contactId,
      found: messages.length,
      added: newMessages.length,
      duplicates: duplicateCount,
      totalOnTimeline: existing.length + newMessages.length,
    };
  }

  /** The full thread, oldest first. */
  async getTimeline(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException();
    if (contact.userId !== userId) throw new ForbiddenException();

    return this.prisma.conversationMessage.findMany({
      where: { contactId },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true, speaker: true, text: true, orderIndex: true,
        sentAtRaw: true, sentiment: true, score: true, explanation: true,
        sourceAnalysisId: true, createdAt: true,
      },
    });
  }

  /** Messages a specific scan contributed, for the per-analysis transcript. */
  async getMessagesForAnalysis(contactId: string, analysisId: string) {
    return this.prisma.conversationMessage.findMany({
      where: { contactId, sourceAnalysisId: analysisId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async countMessages(contactId: string): Promise<number> {
    return this.prisma.conversationMessage.count({ where: { contactId } });
  }

  /**
   * Removes the whole thread for a contact. Exposed so a user can clear a
   * conversation without deleting the relationship.
   */
  async clearTimeline(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException();
    if (contact.userId !== userId) throw new ForbiddenException();

    const { count } = await this.prisma.conversationMessage.deleteMany({ where: { contactId } });
    return { deleted: count };
  }
}
