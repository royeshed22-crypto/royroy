import { MemoryUpdaterService } from './memory-updater.service';
import { RelationshipMemory, EMPTY_MEMORY, MEMORY_LIMITS } from './memory.types';

describe('MemoryUpdaterService', () => {
  let svc: MemoryUpdaterService;

  beforeEach(() => {
    // The Gemini client is only used by computeUpdate, which these tests avoid.
    svc = new MemoryUpdaterService(null as any);
  });

  const base = (over: Partial<RelationshipMemory> = {}): RelationshipMemory => ({
    ...EMPTY_MEMORY,
    patterns: { them: [], me: [] },
    ...over,
  });

  describe('parse', () => {
    it('returns null for nothing recorded', () => {
      expect(svc.parse(null)).toBeNull();
      expect(svc.parse(undefined)).toBeNull();
      expect(svc.parse({})).toBeNull();
    });

    it('reads the current shape', () => {
      const m = svc.parse({
        summary: 'Talking three weeks',
        facts: [{ text: 'She studies psychology', confidence: 1 }],
        insideJokes: ['sushi'],
      });

      expect(m?.summary).toBe('Talking three weeks');
      expect(m?.facts[0].text).toBe('She studies psychology');
      expect(m?.insideJokes).toEqual(['sushi']);
    });

    it('upgrades the earlier flat shape', () => {
      // Relationships recorded before facts/inferences existed stored plain
      // strings under openThreads/avoid.
      const m = svc.parse({
        facts: ['She has a dog called Luna'],
        openThreads: ['deciding about the trip'],
        avoid: ['her ex'],
        interests: ['sushi'],
      });

      expect(m?.facts).toEqual([{ text: 'She has a dog called Luna', confidence: 1 }]);
      expect(m?.unresolvedTopics).toEqual(['deciding about the trip']);
      expect(m?.boundaries).toEqual(['her ex']);
    });

    it('survives malformed input rather than throwing', () => {
      const m = svc.parse({ facts: 'not an array', events: 42, patterns: null, summary: 'x' });
      expect(m?.facts).toEqual([]);
      expect(m?.events).toEqual([]);
      expect(m?.patterns).toEqual({ them: [], me: [] });
    });
  });

  describe('merge', () => {
    it('returns a usable memory when there was none', () => {
      const m = svc.merge(null, { newFacts: [{ text: 'Lives in Tel Aviv', confidence: 1 }] });
      expect(m.facts).toHaveLength(1);
      expect(m.patterns).toEqual({ them: [], me: [] });
    });

    it('leaves memory alone when nothing changed', () => {
      const existing = base({ summary: 'Going well', insideJokes: ['sushi'] });
      const m = svc.merge(existing, {});

      expect(m.summary).toBe('Going well');
      expect(m.insideJokes).toEqual(['sushi']);
    });

    it('keeps the old summary when the update omits one', () => {
      const m = svc.merge(base({ summary: 'Original' }), { newFacts: [] });
      expect(m.summary).toBe('Original');
    });

    it('does not add a fact it already holds', () => {
      const existing = base({ facts: [{ text: 'She studies psychology', confidence: 1 }] });
      const m = svc.merge(existing, {
        newFacts: [{ text: 'she studies psychology', confidence: 1 }],
      });

      expect(m.facts).toHaveLength(1);
    });

    it('drops a fact the new messages contradict', () => {
      const existing = base({
        facts: [
          { text: 'Her exam is on Sunday', confidence: 1 },
          { text: 'She lives in Haifa', confidence: 1 },
        ],
      });

      const m = svc.merge(existing, {
        supersededFacts: ['Her exam is on Sunday'],
        newFacts: [{ text: 'Her exam is on Monday', confidence: 1 }],
      });

      expect(m.facts.map((f) => f.text)).toEqual(['She lives in Haifa', 'Her exam is on Monday']);
    });

    it('clamps confidence into range', () => {
      const m = svc.merge(null, {
        newFacts: [{ text: 'a', confidence: 5 }, { text: 'b', confidence: -1 }],
      });

      expect(m.facts[0].confidence).toBe(1);
      expect(m.facts[1].confidence).toBe(0);
    });

    it('replaces a restated inference instead of stacking it', () => {
      const existing = base({
        inferences: [{ text: 'She may be less engaged', confidence: 0.4, evidence: ['old'] }],
      });

      const m = svc.merge(existing, {
        newInferences: [{ text: 'She may be less engaged', confidence: 0.75, evidence: ['new'] }],
      });

      expect(m.inferences).toHaveLength(1);
      expect(m.inferences[0].confidence).toBe(0.75);
      expect(m.inferences[0].evidence).toEqual(['new']);
    });

    it('keeps facts and inferences apart', () => {
      const m = svc.merge(null, {
        newFacts: [{ text: 'She has an exam Sunday', confidence: 1 }],
        newInferences: [{ text: 'She may be stressed', confidence: 0.5, evidence: ['mentioned exams twice'] }],
      });

      expect(m.facts).toHaveLength(1);
      expect(m.inferences).toHaveLength(1);
      expect(m.facts[0]).not.toHaveProperty('evidence');
    });

    it('clears a topic once it is resolved', () => {
      const existing = base({ unresolvedTopics: ['whether she is free Thursday', 'the trip'] });
      const m = svc.merge(existing, { resolvedTopics: ['whether she is free Thursday'] });

      expect(m.unresolvedTopics).toEqual(['the trip']);
    });

    it('does not record the same event twice', () => {
      const existing = base({ events: [{ event: 'First date' }] });
      const m = svc.merge(existing, { newEvents: [{ event: 'first date', result: 'went well' }] });

      expect(m.events).toHaveLength(1);
    });

    it('merges patterns per side', () => {
      const existing = base({ patterns: { them: ['short messages'], me: ['initiates more'] } });
      const m = svc.merge(existing, { newPatterns: { them: ['uses חחח a lot'] } });

      expect(m.patterns.them).toEqual(['short messages', 'uses חחח a lot']);
      expect(m.patterns.me).toEqual(['initiates more']);
    });

    it('caps each list so the prompt stays bounded', () => {
      const many = Array.from({ length: MEMORY_LIMITS.facts + 20 }, (_, i) => ({
        text: `fact ${i}`,
        confidence: 1,
      }));
      const m = svc.merge(null, { newFacts: many });

      expect(m.facts).toHaveLength(MEMORY_LIMITS.facts);
    });

    it('drops the oldest entries when trimming, keeping recent knowledge', () => {
      const existing = base({
        insideJokes: Array.from({ length: MEMORY_LIMITS.insideJokes }, (_, i) => `joke ${i}`),
      });
      const m = svc.merge(existing, { newInsideJokes: ['the newest joke'] });

      expect(m.insideJokes).toHaveLength(MEMORY_LIMITS.insideJokes);
      expect(m.insideJokes.at(-1)).toBe('the newest joke');
      expect(m.insideJokes).not.toContain('joke 0');
    });

    it('ignores blank entries', () => {
      const m = svc.merge(null, { newInterests: ['  ', '', 'sushi'] });
      expect(m.interests).toEqual(['sushi']);
    });

    it('stamps updatedAt', () => {
      const m = svc.merge(null, { newInterests: ['sushi'] });
      expect(m.updatedAt).toBeTruthy();
    });
  });
});
