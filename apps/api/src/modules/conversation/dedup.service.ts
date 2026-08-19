import { Injectable, Logger } from '@nestjs/common';

/** A message as it comes out of extraction, before it has an identity. */
export interface ExtractedMessage {
  speaker: 'SELF' | 'OTHER' | 'UNKNOWN';
  text: string;
  sentAtRaw?: string | null;
  /** Which image in the batch it was read from. Drives within-batch overlap. */
  screenshotIndex?: number;
}

/** A message already stored on the relationship timeline. */
export interface StoredMessage {
  id: string;
  speaker: string;
  text: string;
  orderIndex: number;
  fingerprint: string;
}

export interface DedupResult {
  /** Messages not already on the timeline, in order, with assigned indices. */
  newMessages: Array<ExtractedMessage & { fingerprint: string; orderIndex: number }>;
  /** How many extracted messages were already known. */
  duplicateCount: number;
  /** Where the new run overlapped the existing timeline, for logging. */
  overlapDetected: boolean;
}

/**
 * Collapses overlapping screenshots into one continuous conversation.
 *
 * Users screenshot a chat by scrolling, so consecutive images share a few
 * messages at the seam. Exact string matching is not enough: OCR varies on
 * punctuation, whitespace, and emoji, so the same message can come back
 * slightly different between runs.
 *
 * The approach is a normalised fingerprint for the common case, plus a
 * similarity pass for near-misses, plus an anchor search that finds where a new
 * batch rejoins the existing timeline so trailing messages are kept even when
 * their text repeats earlier in the conversation.
 */
@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  /** Near-duplicate threshold. Tuned to catch OCR drift without merging distinct short replies. */
  private static readonly SIMILARITY_THRESHOLD = 0.88;

  /**
   * Strips everything that OCR renders inconsistently, so the same message
   * produces the same key across screenshots.
   */
  normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      // Emoji and pictographs: frequently dropped or substituted between reads.
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
      // Punctuation, including the Hebrew maqaf and common quote variants.
      .replace(/[.,!?;:'"״׳`\-–—()[\]{}]/g, '')
      .trim();
  }

  fingerprint(speaker: string, text: string): string {
    return `${speaker}:${this.normalize(text)}`;
  }

  /**
   * Character-level Dice coefficient over bigrams. Chosen over edit distance
   * because it is order-tolerant and cheap, and because it behaves sensibly on
   * Hebrew, where a single dropped character should not tank the score.
   */
  similarity(a: string, b: string): number {
    const x = this.normalize(a);
    const y = this.normalize(b);

    if (!x.length || !y.length) return x === y ? 1 : 0;
    if (x === y) return 1;
    // Bigrams are meaningless below two characters; fall back to equality.
    if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;

    const bigrams = (s: string) => {
      const m = new Map<string, number>();
      for (let i = 0; i < s.length - 1; i++) {
        const g = s.slice(i, i + 2);
        m.set(g, (m.get(g) ?? 0) + 1);
      }
      return m;
    };

    const ba = bigrams(x);
    const bb = bigrams(y);
    let shared = 0;

    for (const [g, count] of ba) {
      const other = bb.get(g);
      if (other) shared += Math.min(count, other);
    }

    return (2 * shared) / (x.length - 1 + (y.length - 1));
  }

  /** Below this many characters, only an exact match is trusted. */
  private static readonly SHORT_MESSAGE = 15;
  /** Similarity required to call two longer messages the same. */
  private static readonly SEAM_SIMILARITY = 0.95;
  /** Fraction of a run that must agree for the seam to be accepted. */
  private static readonly RUN_AGREEMENT = 0.8;
  /** At or above this length, a run may carry a few mismatches. */
  private static readonly FORGIVING_RUN = 3;

  /**
   * Whether two messages are the same one read twice.
   *
   * Short messages demand an exact match, because "כן" and "לא" score highly on
   * any similarity measure without being remotely the same. Longer messages
   * allow a little slack, since the model does not transcribe an image
   * identically every time and a strict comparison there misses real seams.
   */
  private isSameMessage(a: { speaker: string; text: string }, b: ExtractedMessage): boolean {
    if (a.speaker !== b.speaker) return false;

    const x = this.normalize(a.text);
    const y = this.normalize(b.text);
    if (x === y) return true;

    const shortest = Math.min(x.length, y.length);
    if (shortest < DedupService.SHORT_MESSAGE) return false;

    return this.similarity(x, y) >= DedupService.SEAM_SIMILARITY;
  }

  /**
   * Finds where `incoming` rejoins `existing`, returning how many leading
   * incoming messages are a re-read of known history.
   *
   * Aligns the tail of the timeline with the head of the batch and takes the
   * longest run that agrees. Runs of three or more tolerate a minority of
   * mismatches: re-reading the same screenshot can split a message differently
   * or garble one line, and demanding a perfect run there means the seam is
   * missed and the entire screenshot lands again as new. Shorter runs must
   * agree completely, since there is not enough evidence to absorb an error.
   */
  private findOverlap(existing: StoredMessage[], incoming: ExtractedMessage[]): number {
    if (!existing.length || !incoming.length) return 0;

    const maxRun = Math.min(existing.length, incoming.length, 60);

    for (let run = maxRun; run >= 1; run--) {
      const tail = existing.slice(existing.length - run);

      let agreed = 0;
      for (let i = 0; i < run; i++) {
        if (this.isSameMessage(tail[i], incoming[i])) agreed++;
      }

      if (run >= DedupService.FORGIVING_RUN) {
        // The first message must line up regardless; without a fixed anchor a
        // partial score can drift the alignment by one and mangle the order.
        const anchored = this.isSameMessage(tail[0], incoming[0]);
        if (anchored && agreed / run >= DedupService.RUN_AGREEMENT) return run;
        continue;
      }

      if (agreed !== run) continue;

      // A one-message seam on a very short message is coincidence more often
      // than overlap, so require some substance before trusting it alone.
      if (run > 1 || incoming[0].text.trim().length >= 12) return run;
    }

    return 0;
  }

  /**
   * Collapses overlap *inside* one batch, before it ever meets the timeline.
   *
   * A single upload can be dozens of screenshots that overlap each other, and
   * they arrive as one flat list. Grouping by the screenshot each message came
   * from turns that back into a sequence, so the same seam logic can fold each
   * image into the running result.
   *
   * When the extractor gave no screenshotIndex there is nothing to group by, so
   * the batch is passed through untouched rather than guessed at.
   */
  private collapseWithinBatch(incoming: ExtractedMessage[]): ExtractedMessage[] {
    const tagged = incoming.filter((m) => typeof m.screenshotIndex === 'number');
    if (tagged.length !== incoming.length) return incoming;

    const indices = [...new Set(incoming.map((m) => m.screenshotIndex!))].sort((a, b) => a - b);
    if (indices.length < 2) return incoming;

    let merged: ExtractedMessage[] = [];

    for (const idx of indices) {
      const shot = incoming.filter((m) => m.screenshotIndex === idx);
      if (!merged.length) { merged = [...shot]; continue; }

      // Reuse the seam finder by presenting what we have as a timeline.
      const asTimeline: StoredMessage[] = merged.map((m, i) => ({
        id: `t${i}`,
        speaker: m.speaker,
        text: m.text,
        orderIndex: i,
        fingerprint: this.fingerprint(m.speaker, m.text),
      }));

      const overlap = this.findOverlap(asTimeline, shot);
      merged.push(...shot.slice(overlap));
    }

    return merged;
  }

  /**
   * Reconciles a freshly extracted batch against the stored timeline.
   *
   * Duplication only ever comes from screenshot overlap, which is contiguous by
   * construction: the user scrolls and captures, so repeats sit at the seam.
   * Once the seam is resolved, everything after it is new — including text that
   * appears earlier in the conversation. That matters because "חחח" or "כן"
   * recur constantly, and treating any repeat as a duplicate would quietly drop
   * real messages.
   */
  reconcile(existing: StoredMessage[], incoming: ExtractedMessage[]): DedupResult {
    const cleanedRaw = incoming
      .map((m) => ({ ...m, text: (m.text ?? '').trim() }))
      .filter((m) => m.text.length > 0);

    if (!cleanedRaw.length) {
      return { newMessages: [], duplicateCount: 0, overlapDetected: false };
    }

    // Fold the batch into itself first, then against stored history.
    const cleaned = this.collapseWithinBatch(cleanedRaw);
    const withinBatchDupes = cleanedRaw.length - cleaned.length;

    const overlap = this.findOverlap(existing, cleaned);

    let nextIndex = existing.length
      ? Math.max(...existing.map((m) => m.orderIndex)) + 1
      : 0;

    const newMessages = cleaned.slice(overlap).map((m) => ({
      ...m,
      fingerprint: this.fingerprint(m.speaker, m.text),
      orderIndex: nextIndex++,
    }));

    const totalDupes = overlap + withinBatchDupes;
    if (totalDupes > 0) {
      this.logger.debug(
        `Collapsed ${withinBatchDupes} within batch, ${overlap} against history`,
      );
    }

    return {
      newMessages,
      duplicateCount: totalDupes,
      overlapDetected: totalDupes > 0,
    };
  }
}
