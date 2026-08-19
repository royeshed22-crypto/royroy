/**
 * Everything the system believes about one relationship.
 *
 * The central rule here is the split between Fact and Inference. A Fact is
 * something that was said outright; an Inference is the model's reading of it.
 * Collapsing the two is how an assistant starts confidently telling someone
 * "she's not interested" on thin evidence, so they are stored separately and
 * inferences always carry their confidence and the evidence behind them.
 */

/** Something stated outright in the conversation. */
export interface Fact {
  text: string;
  /** 1 when said verbatim; lower when paraphrased or implied. */
  confidence: number;
  /** ISO date this was first recorded. */
  since?: string;
}

/** The model's reading of the conversation, never presented as certain. */
export interface Inference {
  text: string;
  /** 0-1. Anything below ~0.5 should be treated as a guess. */
  confidence: number;
  /** Message excerpts or observations supporting it. */
  evidence: string[];
  updatedAt?: string;
}

/** Something that happened between them worth remembering. */
export interface RelationshipEvent {
  event: string;
  /** When it happened, as the conversation described it. */
  when?: string;
  /** How it turned out, if known. */
  result?: string;
  context?: string;
}

/** Observed habits, kept per side. */
export interface CommunicationPatterns {
  them: string[];
  me: string[];
}

export interface RelationshipMemory {
  /** Prose overview. Rewritten only when the relationship actually moves. */
  summary: string;

  facts: Fact[];
  inferences: Inference[];
  events: RelationshipEvent[];

  patterns: CommunicationPatterns;

  insideJokes: string[];
  interests: string[];
  /** Plans made, whether or not they were followed through. */
  plans: string[];
  /** Raised but never resolved. */
  unresolvedTopics: string[];
  /** Things that landed badly, or that she deflected. */
  boundaries: string[];

  /** One line on where things stand right now, hedged appropriately. */
  currentDynamic: string;

  updatedAt?: string;
}

export const EMPTY_MEMORY: RelationshipMemory = {
  summary: '',
  facts: [],
  inferences: [],
  events: [],
  patterns: { them: [], me: [] },
  insideJokes: [],
  interests: [],
  plans: [],
  unresolvedTopics: [],
  boundaries: [],
  currentDynamic: '',
};

/** What the memory-updater returns; every field optional, since most turns change little. */
export interface MemoryUpdate {
  summary?: string;
  currentDynamic?: string;
  stage?: string;
  newFacts?: Fact[];
  newInferences?: Inference[];
  newEvents?: RelationshipEvent[];
  newInsideJokes?: string[];
  newInterests?: string[];
  newPlans?: string[];
  newUnresolvedTopics?: string[];
  newBoundaries?: string[];
  newPatterns?: Partial<CommunicationPatterns>;
  /** Facts the latest messages contradict, matched loosely on text. */
  supersededFacts?: string[];
  /** Topics no longer open. */
  resolvedTopics?: string[];
}

/**
 * Caps per list. Memory is injected into every prompt, so it has to stay
 * bounded; without limits a long relationship would slowly crowd out the
 * actual conversation.
 */
export const MEMORY_LIMITS = {
  facts: 40,
  inferences: 15,
  events: 25,
  insideJokes: 15,
  interests: 20,
  plans: 15,
  unresolvedTopics: 12,
  boundaries: 10,
  patternsPerSide: 8,
} as const;
