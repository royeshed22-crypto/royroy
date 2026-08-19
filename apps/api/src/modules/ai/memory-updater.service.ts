import { Injectable, Logger } from '@nestjs/common';
import { GeminiClient } from './gemini.client';
import {
  RelationshipMemory, MemoryUpdate, EMPTY_MEMORY, MEMORY_LIMITS, Fact, Inference,
} from './memory.types';
import { MEMORY_UPDATE_PROMPT } from './prompts/memory.prompt';

/** One message as the updater sees it. */
export interface TimelineMessage {
  speaker: string;
  text: string;
}

/**
 * Owns relationship memory: reads the current state plus whatever is new, and
 * folds in only what actually changed.
 *
 * Kept apart from extraction and reply generation so each has one job. This one
 * never sees images and never writes user-facing copy.
 */
@Injectable()
export class MemoryUpdaterService {
  private readonly logger = new Logger(MemoryUpdaterService.name);

  constructor(private gemini: GeminiClient) {}

  /**
   * Reads memory out of a Prisma Json column.
   *
   * Tolerates the earlier flat shape (plain string arrays, no facts/inferences
   * split) so relationships recorded before this feature keep working, and
   * tolerates junk rather than throwing mid-analysis.
   */
  parse(raw: unknown): RelationshipMemory | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const src = raw as Record<string, any>;

    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

    const facts = (v: unknown): Fact[] => {
      if (!Array.isArray(v)) return [];
      return v
        .map((f): Fact | null => {
          // Older rows stored facts as bare strings, before confidence existed.
          if (typeof f === 'string') return { text: f, confidence: 1 };
          if (f && typeof f.text === 'string') {
            return {
              text: f.text,
              confidence: typeof f.confidence === 'number' ? f.confidence : 1,
              since: typeof f.since === 'string' ? f.since : undefined,
            };
          }
          return null;
        })
        .filter((f): f is Fact => f !== null);
    };

    const inferences = (v: unknown): Inference[] => {
      if (!Array.isArray(v)) return [];
      return v
        .map((f): Inference | null =>
          f && typeof f.text === 'string'
            ? {
                text: f.text,
                confidence: typeof f.confidence === 'number' ? f.confidence : 0.5,
                evidence: strings(f.evidence),
                updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : undefined,
              }
            : null,
        )
        .filter((f): f is Inference => f !== null);
    };

    const memory: RelationshipMemory = {
      summary: typeof src.summary === 'string' ? src.summary : '',
      facts: facts(src.facts),
      inferences: inferences(src.inferences),
      events: Array.isArray(src.events)
        ? src.events.filter((e: any) => e && typeof e.event === 'string')
        : [],
      patterns: {
        them: strings(src.patterns?.them),
        me: strings(src.patterns?.me),
      },
      insideJokes: strings(src.insideJokes),
      interests: strings(src.interests),
      plans: strings(src.plans),
      unresolvedTopics: strings(src.unresolvedTopics ?? src.openThreads),
      boundaries: strings(src.boundaries ?? src.avoid),
      currentDynamic: typeof src.currentDynamic === 'string' ? src.currentDynamic : '',
      updatedAt: src.updatedAt,
    };

    const empty =
      !memory.summary &&
      !memory.currentDynamic &&
      memory.facts.length === 0 &&
      memory.events.length === 0 &&
      memory.insideJokes.length === 0 &&
      memory.interests.length === 0;

    return empty ? null : memory;
  }

  /**
   * Applies an update to existing memory.
   *
   * Deliberately additive and bounded: lists dedupe case-insensitively and trim
   * from the front, so a long relationship keeps its most recent knowledge
   * instead of growing a prompt without limit. Prose fields are only replaced
   * when the model actually supplied something.
   */
  merge(existing: RelationshipMemory | null, update?: MemoryUpdate | null): RelationshipMemory {
    const base: RelationshipMemory = existing
      ? { ...EMPTY_MEMORY, ...existing, patterns: { ...EMPTY_MEMORY.patterns, ...existing.patterns } }
      : { ...EMPTY_MEMORY, patterns: { them: [], me: [] } };

    if (!update) return base;

    const addStrings = (current: string[], incoming: string[] | undefined, limit: number) => {
      const fresh = (incoming ?? []).map((s) => String(s).trim()).filter(Boolean);
      if (!fresh.length) return current;
      const seen = new Set(current.map((s) => s.toLowerCase()));
      return [...current, ...fresh.filter((s) => !seen.has(s.toLowerCase()))].slice(-limit);
    };

    const next: RelationshipMemory = {
      ...base,
      summary: update.summary?.trim() || base.summary,
      currentDynamic: update.currentDynamic?.trim() || base.currentDynamic,
      insideJokes: addStrings(base.insideJokes, update.newInsideJokes, MEMORY_LIMITS.insideJokes),
      interests: addStrings(base.interests, update.newInterests, MEMORY_LIMITS.interests),
      plans: addStrings(base.plans, update.newPlans, MEMORY_LIMITS.plans),
      boundaries: addStrings(base.boundaries, update.newBoundaries, MEMORY_LIMITS.boundaries),
      patterns: {
        them: addStrings(base.patterns.them, update.newPatterns?.them, MEMORY_LIMITS.patternsPerSide),
        me: addStrings(base.patterns.me, update.newPatterns?.me, MEMORY_LIMITS.patternsPerSide),
      },
      updatedAt: new Date().toISOString(),
    };

    // Facts a later message contradicts are dropped rather than kept alongside
    // the correction, which would leave the model holding both.
    const superseded = new Set((update.supersededFacts ?? []).map((s) => s.toLowerCase().trim()));
    const keptFacts = base.facts.filter((f) => !superseded.has(f.text.toLowerCase().trim()));
    const factSeen = new Set(keptFacts.map((f) => f.text.toLowerCase()));
    const newFacts = (update.newFacts ?? [])
      .filter((f) => f?.text && !factSeen.has(f.text.toLowerCase()))
      .map((f) => ({
        text: f.text.trim(),
        confidence: Math.max(0, Math.min(1, f.confidence ?? 1)),
        since: f.since ?? new Date().toISOString().slice(0, 10),
      }));
    next.facts = [...keptFacts, ...newFacts].slice(-MEMORY_LIMITS.facts);

    // A re-stated inference replaces the old one, so confidence tracks the
    // latest evidence instead of stacking duplicates at stale values.
    const incomingInf = (update.newInferences ?? []).filter((i) => i?.text);
    const incomingKeys = new Set(incomingInf.map((i) => i.text.toLowerCase()));
    next.inferences = [
      ...base.inferences.filter((i) => !incomingKeys.has(i.text.toLowerCase())),
      ...incomingInf.map((i) => ({
        text: i.text.trim(),
        confidence: Math.max(0, Math.min(1, i.confidence ?? 0.5)),
        evidence: (i.evidence ?? []).slice(0, 4),
        updatedAt: new Date().toISOString(),
      })),
    ].slice(-MEMORY_LIMITS.inferences);

    const resolved = new Set((update.resolvedTopics ?? []).map((s) => s.toLowerCase().trim()));
    next.unresolvedTopics = addStrings(
      base.unresolvedTopics.filter((t) => !resolved.has(t.toLowerCase().trim())),
      update.newUnresolvedTopics,
      MEMORY_LIMITS.unresolvedTopics,
    );

    const eventSeen = new Set(base.events.map((e) => e.event.toLowerCase()));
    next.events = [
      ...base.events,
      ...(update.newEvents ?? []).filter((e) => e?.event && !eventSeen.has(e.event.toLowerCase())),
    ].slice(-MEMORY_LIMITS.events);

    return next;
  }

  /**
   * Asks the model what changed. Returns null when nothing meaningful did, so
   * callers can skip a pointless write.
   */
  async computeUpdate(
    memory: RelationshipMemory | null,
    newMessages: TimelineMessage[],
    opts: { contactName?: string; userContext?: string | null } = {},
  ): Promise<MemoryUpdate | null> {
    if (!newMessages.length) return null;

    const transcript = newMessages
      .map((m) => `${m.speaker === 'SELF' ? 'Me' : 'Them'}: ${m.text}`)
      .join('\n');

    const current = memory
      ? JSON.stringify(
          {
            summary: memory.summary,
            currentDynamic: memory.currentDynamic,
            facts: memory.facts.map((f) => f.text),
            inferences: memory.inferences.map((i) => `${i.text} (${i.confidence})`),
            events: memory.events,
            insideJokes: memory.insideJokes,
            interests: memory.interests,
            plans: memory.plans,
            unresolvedTopics: memory.unresolvedTopics,
            boundaries: memory.boundaries,
            patterns: memory.patterns,
          },
          null,
          1,
        )
      : '(nothing recorded yet)';

    const prompt = `${MEMORY_UPDATE_PROMPT}

=== CURRENT MEMORY ===
${current}

=== NEW MESSAGES ===
${transcript}
${opts.userContext ? `\n=== WHAT THE USER ADDED ===\n${opts.userContext}` : ''}

Return the update as JSON.`;

    try {
      const raw = await this.gemini.generateJson('memoryUpdate', prompt);
      return JSON.parse(raw) as MemoryUpdate;
    } catch (err) {
      // Memory is an enhancement; a failure here must not sink the analysis.
      this.logger.warn(`Memory update skipped: ${err.message?.slice(0, 120)}`);
      return null;
    }
  }
}
