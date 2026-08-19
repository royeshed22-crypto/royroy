import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemoryUpdaterService } from '../ai/memory-updater.service';
import { RelationshipMemory } from '../ai/memory.types';

export interface BuiltContext {
  /** Ready to drop into a prompt. */
  text: string;
  /** The most recent messages, for callers that want them separately. */
  recentMessages: Array<{ speaker: string; text: string }>;
  messageCount: number;
  retrievedOlder: boolean;
}

export interface BuildOptions {
  contactId: string;
  /** The user's question, when there is one. Drives whether older history is pulled. */
  userQuery?: string | null;
  /** Notes typed for this specific scan. */
  userContext?: string | null;
  recentMessageLimit?: number;
}

/**
 * Assembles the context handed to the model for a relationship.
 *
 * The point is that screenshots and full history do not go back to the model on
 * every request. Memory plus a recent window covers almost every question, and
 * older messages are fetched only when the question is actually about change
 * over time.
 */
@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  private static readonly DEFAULT_RECENT = 40;
  private static readonly RETRIEVAL_WINDOW = 25;

  /**
   * Questions that cannot be answered from the recent window alone, because
   * they compare now against earlier.
   */
  private static readonly COMPARATIVE = [
    /before|earlier|used to|previously|at first|in the beginning/i,
    /change[ds]?|different|shift|cool(ed|ing)|warm(ed|ing)|less|more than/i,
    /קודם|בהתחלה|פעם|לפני|השתנ|אחרת|פחות|יותר מ/,
  ];

  constructor(
    private prisma: PrismaService,
    private memoryUpdater: MemoryUpdaterService,
  ) {}

  private needsOlderHistory(query?: string | null): boolean {
    if (!query?.trim()) return false;
    return ContextBuilderService.COMPARATIVE.some((re) => re.test(query));
  }

  private renderMemory(memory: RelationshipMemory | null, who: string): string {
    if (!memory) return '';
    const parts: string[] = [];

    if (memory.summary) parts.push(`SUMMARY\n${memory.summary}`);
    if (memory.currentDynamic) parts.push(`CURRENT DYNAMIC\n${memory.currentDynamic}`);

    if (memory.facts.length) {
      // Confidence is shown so the model can hedge on anything shaky.
      const lines = memory.facts.map((f) =>
        f.confidence >= 1 ? `  - ${f.text}` : `  - ${f.text} (confidence ${f.confidence})`,
      );
      parts.push(`KNOWN FACTS\n${lines.join('\n')}`);
    }

    if (memory.inferences.length) {
      const lines = memory.inferences.map((i) => `  - ${i.text} (confidence ${i.confidence})`);
      parts.push(
        `READINGS - these are interpretations, not established facts. Treat them as tentative.\n${lines.join('\n')}`,
      );
    }

    if (memory.events.length) {
      const lines = memory.events.map((e) => {
        const bits = [e.event, e.when && `(${e.when})`, e.result && `-> ${e.result}`]
          .filter(Boolean)
          .join(' ');
        return `  - ${bits}`;
      });
      parts.push(`WHAT HAS HAPPENED\n${lines.join('\n')}`);
    }

    const list = (label: string, items: string[]) =>
      items.length ? `${label}\n${items.map((i) => `  - ${i}`).join('\n')}` : '';

    for (const block of [
      list('INSIDE JOKES', memory.insideJokes),
      list('INTERESTS', memory.interests),
      list('PLANS', memory.plans),
      list('LEFT UNRESOLVED', memory.unresolvedTopics),
      list('AVOID', memory.boundaries),
      list('HOW THEY COMMUNICATE', memory.patterns.them),
      list('HOW THE USER COMMUNICATES', memory.patterns.me),
    ]) {
      if (block) parts.push(block);
    }

    return parts.length ? `=== WHAT YOU KNOW ABOUT ${who} ===\n\n${parts.join('\n\n')}` : '';
  }

  private renderMessages(
    label: string,
    messages: Array<{ speaker: string; text: string; sentAtRaw?: string | null }>,
  ): string {
    if (!messages.length) return '';
    const lines = messages.map((m) => {
      const who = m.speaker === 'SELF' ? 'Me' : m.speaker === 'OTHER' ? 'Them' : '?';
      const when = m.sentAtRaw ? `[${m.sentAtRaw}] ` : '';
      return `${when}${who}: ${m.text}`;
    });
    return `=== ${label} ===\n${lines.join('\n')}`;
  }

  async build(opts: BuildOptions): Promise<BuiltContext> {
    const {
      contactId,
      userQuery,
      userContext,
      recentMessageLimit = ContextBuilderService.DEFAULT_RECENT,
    } = opts;

    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    const who = contact?.displayName ?? 'THIS PERSON';
    const memory = this.memoryUpdater.parse(contact?.aiMemory);

    const total = await this.prisma.conversationMessage.count({ where: { contactId } });

    const recent = (
      await this.prisma.conversationMessage.findMany({
        where: { contactId },
        orderBy: { orderIndex: 'desc' },
        take: recentMessageLimit,
        select: { speaker: true, text: true, sentAtRaw: true, orderIndex: true },
      })
    ).reverse();

    // Only reach further back when the question is about change over time, and
    // only when there is history the recent window does not already cover.
    let older: typeof recent = [];
    const wantsOlder = this.needsOlderHistory(userQuery);
    if (wantsOlder && total > recent.length) {
      const oldestShown = recent[0]?.orderIndex ?? 0;
      older = await this.prisma.conversationMessage.findMany({
        where: { contactId, orderIndex: { lt: oldestShown } },
        orderBy: { orderIndex: 'asc' },
        take: ContextBuilderService.RETRIEVAL_WINDOW,
        select: { speaker: true, text: true, sentAtRaw: true, orderIndex: true },
      });
      this.logger.debug(`Pulled ${older.length} older message(s) for a comparative question`);
    }

    const sections = [
      userContext?.trim() &&
        `=== WHAT THE USER TOLD YOU ABOUT THIS MOMENT ===\n${userContext.trim()}`,
      contact?.notes?.trim() && `=== THE USER'S NOTES ON ${who} ===\n${contact.notes.trim()}`,
      this.renderMemory(memory, who),
      older.length && this.renderMessages('EARLIER IN THE CONVERSATION', older),
      this.renderMessages(
        total > recent.length ? `MOST RECENT MESSAGES (of ${total} total)` : 'THE CONVERSATION',
        recent,
      ),
    ].filter(Boolean) as string[];

    return {
      text: sections.join('\n\n'),
      recentMessages: recent.map((m) => ({ speaker: m.speaker, text: m.text })),
      messageCount: total,
      retrievedOlder: older.length > 0,
    };
  }
}
