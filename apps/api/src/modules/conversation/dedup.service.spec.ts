import { DedupService, ExtractedMessage, StoredMessage } from './dedup.service';

describe('DedupService', () => {
  let svc: DedupService;

  beforeEach(() => {
    svc = new DedupService();
  });

  /** Builds a stored timeline the way reconcile() expects to receive it. */
  const store = (msgs: Array<[string, string]>): StoredMessage[] =>
    msgs.map(([speaker, text], i) => ({
      id: `m${i}`,
      speaker,
      text,
      orderIndex: i,
      fingerprint: svc.fingerprint(speaker, text),
    }));

  const extract = (msgs: Array<[string, string]>): ExtractedMessage[] =>
    msgs.map(([speaker, text]) => ({ speaker: speaker as any, text }));

  describe('normalize', () => {
    it('ignores punctuation, case, and spacing', () => {
      expect(svc.normalize('Hey!  How are you?')).toBe('hey how are you');
    });

    it('ignores emoji, which OCR reads inconsistently', () => {
      expect(svc.normalize('yes 😂')).toBe(svc.normalize('yes'));
    });

    it('handles Hebrew punctuation', () => {
      expect(svc.normalize('מה קורה?')).toBe('מה קורה');
    });
  });

  describe('similarity', () => {
    it('scores identical text as 1', () => {
      expect(svc.similarity('בא לי סושי', 'בא לי סושי')).toBe(1);
    });

    it('stays high when OCR drops a character', () => {
      expect(svc.similarity('נתראה בחמישי', 'נתראה בחמיש')).toBeGreaterThan(0.85);
    });

    it('scores unrelated text low', () => {
      expect(svc.similarity('בא לי סושי', 'אני בעבודה')).toBeLessThan(0.4);
    });

    it('does not merge distinct short replies', () => {
      expect(svc.similarity('כן', 'לא')).toBeLessThan(0.88);
    });
  });

  describe('reconcile', () => {
    it('keeps everything when the timeline is empty', () => {
      const r = svc.reconcile([], extract([['SELF', 'hey'], ['OTHER', 'hi']]));

      expect(r.newMessages).toHaveLength(2);
      expect(r.duplicateCount).toBe(0);
      expect(r.newMessages.map((m) => m.orderIndex)).toEqual([0, 1]);
    });

    it('collapses the seam between overlapping screenshots', () => {
      // Screenshot 1 gave messages 1-4; screenshot 2 re-reads 3-4 then adds 5-6.
      const existing = store([
        ['SELF', 'hey'],
        ['OTHER', 'hi there'],
        ['SELF', 'what are you up to'],
        ['OTHER', 'just finished work'],
      ]);

      const r = svc.reconcile(
        existing,
        extract([
          ['SELF', 'what are you up to'],
          ['OTHER', 'just finished work'],
          ['SELF', 'nice, sushi thursday?'],
          ['OTHER', 'yes'],
        ]),
      );

      expect(r.overlapDetected).toBe(true);
      expect(r.duplicateCount).toBe(2);
      expect(r.newMessages.map((m) => m.text)).toEqual(['nice, sushi thursday?', 'yes']);
    });

    it('continues numbering from the end of the timeline', () => {
      const existing = store([['SELF', 'one'], ['OTHER', 'two']]);
      const r = svc.reconcile(existing, extract([['SELF', 'three']]));

      expect(r.newMessages[0].orderIndex).toBe(2);
    });

    it('treats OCR drift as a duplicate rather than a new message', () => {
      const existing = store([['OTHER', 'נתראה בחמישי בערב']]);
      const r = svc.reconcile(existing, extract([['OTHER', 'נתראה בחמישי בערב.']]));

      expect(r.newMessages).toHaveLength(0);
      expect(r.duplicateCount).toBe(1);
    });

    it('keeps a genuinely repeated message', () => {
      // Double-texting the same thing is real behaviour, not a duplicate.
      const r = svc.reconcile([], extract([
        ['SELF', 'hey'],
        ['SELF', 'hey'],
      ]));

      expect(r.newMessages).toHaveLength(2);
    });

    it('keeps a short reply that recurs later in the conversation', () => {
      // "חחח" already appears at the start; a later one is still a new message.
      const existing = store([
        ['OTHER', 'חחח'],
        ['SELF', 'רוצה לצאת בחמישי לסושי'],
      ]);

      const r = svc.reconcile(existing, extract([
        ['SELF', 'רוצה לצאת בחמישי לסושי'],
        ['OTHER', 'חחח'],
      ]));

      expect(r.newMessages.map((m) => m.text)).toEqual(['חחח']);
    });

    it('does not merge identical text from different speakers', () => {
      const existing = store([['SELF', 'good morning']]);
      const r = svc.reconcile(existing, extract([['OTHER', 'good morning']]));

      expect(r.newMessages).toHaveLength(1);
    });

    it('ignores blank messages', () => {
      const r = svc.reconcile([], extract([['SELF', '   '], ['SELF', 'real']]));

      expect(r.newMessages).toHaveLength(1);
      expect(r.newMessages[0].text).toBe('real');
    });

    it('adds nothing when a screenshot is uploaded twice', () => {
      const msgs: Array<[string, string]> = [
        ['SELF', 'hey'],
        ['OTHER', 'hi there'],
        ['SELF', 'sushi thursday?'],
      ];
      const r = svc.reconcile(store(msgs), extract(msgs));

      expect(r.newMessages).toHaveLength(0);
      expect(r.duplicateCount).toBe(3);
    });

    // The model does not transcribe an image identically every time, so a
    // re-scan of known content must still find its seam.
    describe('tolerating an inconsistent re-read', () => {
      it('matches a run where one message came back garbled', () => {
        const existing = store([
          ['SELF', 'hey what are you up to tonight'],
          ['OTHER', 'just got back from the gym actually'],
          ['SELF', 'nice, want to get sushi thursday'],
          ['OTHER', 'yes that sounds really good'],
        ]);

        // Third line re-read with a dropped word.
        const r = svc.reconcile(existing, extract([
          ['SELF', 'hey what are you up to tonight'],
          ['OTHER', 'just got back from the gym actually'],
          ['SELF', 'nice want to get sushi on thursday'],
          ['OTHER', 'yes that sounds really good'],
        ]));

        expect(r.newMessages).toHaveLength(0);
        expect(r.overlapDetected).toBe(true);
      });

      it('never fuzzy-matches a short reply', () => {
        // Slack is only extended to longer text. "כן" and "לא" are similar by
        // any character measure and must never be treated as the same message.
        const r = svc.reconcile(store([['OTHER', 'כן']]), extract([['OTHER', 'לא']]));
        expect(r.newMessages.map((m) => m.text)).toEqual(['לא']);
      });

      it('treats a contradicted last message as no seam at all', () => {
        // The stored tail says one thing and the screenshot says another, so
        // there is no trustworthy join. Keeping both beats silently dropping one.
        const existing = store([
          ['SELF', 'so are you coming or not'],
          ['OTHER', 'כן'],
        ]);

        const r = svc.reconcile(existing, extract([
          ['SELF', 'so are you coming or not'],
          ['OTHER', 'לא'],
        ]));

        expect(r.overlapDetected).toBe(false);
        expect(r.newMessages).toHaveLength(2);
      });

      it('does not accept a run whose first message disagrees', () => {
        const existing = store([
          ['SELF', 'completely unrelated opening line'],
          ['OTHER', 'second message that matches here'],
          ['SELF', 'third message that matches here'],
        ]);

        const r = svc.reconcile(existing, extract([
          ['SELF', 'something totally different entirely'],
          ['OTHER', 'second message that matches here'],
          ['SELF', 'third message that matches here'],
        ]));

        // Without an anchored first message the alignment cannot be trusted.
        expect(r.newMessages.length).toBeGreaterThan(0);
      });

      it('rejects a run where too much disagrees', () => {
        const existing = store([
          ['SELF', 'first message here for testing'],
          ['OTHER', 'second message here for testing'],
          ['SELF', 'third message here for testing'],
          ['OTHER', 'fourth message here for testing'],
        ]);

        const r = svc.reconcile(existing, extract([
          ['SELF', 'first message here for testing'],
          ['OTHER', 'completely different content now'],
          ['SELF', 'another unrelated thing entirely'],
          ['OTHER', 'nothing like the original here'],
        ]));

        expect(r.newMessages.length).toBeGreaterThanOrEqual(3);
      });
    });

    // A single upload is often many overlapping screenshots arriving as one
    // flat list, so the seam has to be found inside the batch as well.
    describe('overlap within a single batch', () => {
      /** Tags messages with the screenshot they were read from. */
      const shot = (index: number, msgs: Array<[string, string]>): ExtractedMessage[] =>
        msgs.map(([speaker, text]) => ({ speaker: speaker as any, text, screenshotIndex: index }));

      it('collapses the same screenshot uploaded twice', () => {
        const msgs: Array<[string, string]> = [
          ['SELF', 'hey what are you up to'],
          ['OTHER', 'just got back from the gym'],
          ['SELF', 'nice, sushi thursday?'],
        ];

        const r = svc.reconcile([], [...shot(0, msgs), ...shot(1, msgs)]);

        expect(r.newMessages).toHaveLength(3);
        expect(r.duplicateCount).toBe(3);
      });

      it('merges three overlapping screenshots in one upload', () => {
        const all = Array.from({ length: 18 }, (_, i): [string, string] => [
          i % 2 === 0 ? 'SELF' : 'OTHER',
          `message number ${i + 1}`,
        ]);

        const r = svc.reconcile([], [
          ...shot(0, all.slice(0, 8)),
          ...shot(1, all.slice(5, 13)),
          ...shot(2, all.slice(10, 18)),
        ]);

        expect(r.newMessages).toHaveLength(18);
        expect(r.newMessages.map((m) => m.text)).toEqual(all.map(([, t]) => t));
      });

      it('keeps non-overlapping screenshots whole', () => {
        const r = svc.reconcile([], [
          ...shot(0, [['SELF', 'first message here'], ['OTHER', 'second message here']]),
          ...shot(1, [['SELF', 'third message here'], ['OTHER', 'fourth message here']]),
        ]);

        expect(r.newMessages).toHaveLength(4);
      });

      it('passes the batch through when the extractor gave no tags', () => {
        const r = svc.reconcile([], extract([['SELF', 'a message'], ['OTHER', 'another']]));
        expect(r.newMessages).toHaveLength(2);
      });

      it('still collapses against stored history after folding the batch', () => {
        const existing = store([
          ['SELF', 'hey what are you up to'],
          ['OTHER', 'just got back from the gym'],
        ]);

        const batch = [
          ...shot(0, [['SELF', 'hey what are you up to'], ['OTHER', 'just got back from the gym']]),
          ...shot(1, [['OTHER', 'just got back from the gym'], ['SELF', 'nice, sushi thursday?']]),
        ];

        const r = svc.reconcile(existing, batch);

        expect(r.newMessages.map((m) => m.text)).toEqual(['nice, sushi thursday?']);
      });
    });

    it('reconstructs a full conversation from three overlapping screenshots', () => {
      const all = Array.from({ length: 18 }, (_, i): [string, string] => [
        i % 2 === 0 ? 'SELF' : 'OTHER',
        `message number ${i + 1}`,
      ]);

      let timeline: StoredMessage[] = [];
      const append = (batch: Array<[string, string]>) => {
        const r = svc.reconcile(timeline, extract(batch));
        timeline = [
          ...timeline,
          ...r.newMessages.map((m, i) => ({
            id: `n${timeline.length + i}`,
            speaker: m.speaker,
            text: m.text,
            orderIndex: m.orderIndex,
            fingerprint: m.fingerprint,
          })),
        ];
      };

      append(all.slice(0, 8));   // 1-8
      append(all.slice(5, 13));  // 6-13
      append(all.slice(10, 18)); // 11-18

      expect(timeline).toHaveLength(18);
      expect(timeline.map((m) => m.text)).toEqual(all.map(([, t]) => t));
    });
  });
});
