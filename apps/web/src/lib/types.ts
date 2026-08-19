export type UserStatus = 'ACTIVE' | 'DELETING' | 'DELETED' | 'SUSPENDED';

export interface User {
  id: string;
  deviceId?: string;
  displayName?: string;
  gender?: string;
  goals?: string[];
  communicationStyle?: string;
  language: string;
  eloScore: number;
  streakDays: number;
  isPro: boolean;
  status: UserStatus;
  createdAt: string;
}

/** What the model has learned about a contact across every scan. */
export interface ContactMemory {
  facts: string[];
  interests: string[];
  insideJokes: string[];
  openThreads: string[];
  avoid: string[];
}

export const MEMORY_SECTIONS = [
  { key: 'insideJokes', label: 'Inside jokes', emoji: '😏' },
  { key: 'openThreads', label: 'Open threads', emoji: '🧵' },
  { key: 'facts', label: 'Facts', emoji: '📌' },
  { key: 'interests', label: 'Interests', emoji: '✨' },
  { key: 'avoid', label: 'Avoid', emoji: '🚫' },
] as const;

export interface Contact {
  id: string;
  displayName: string;
  platform?: string;
  notes?: string;
  aiMemory?: ContactMemory | null;
  status: 'ACTIVE' | 'ARCHIVED';
  currentVibeScore?: number;
  lastActivityAt?: string;
  _count?: { analyses: number };
  analyses?: Partial<Analysis>[];
}

export type AnalysisStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
export type ReplyTone = 'PLAYFUL' | 'DIRECT' | 'WARM';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Analysis {
  id: string;
  status: AnalysisStatus;
  /** Notes the user typed before scanning. */
  userContext?: string;
  /** True when this run backfilled history rather than asking for replies. */
  isImport?: boolean;
  messagesFound?: number;
  messagesNew?: number;
  /** Size of the whole relationship timeline, not just this scan. */
  totalMessages?: number;
  language?: string;
  overallScore?: number;
  vibeScore?: number;
  interestScore?: number;
  confidence?: number;
  summary?: string;
  conversationStage?: string;
  recommendedAction?: { type: string; explanation: string };
  communicationStyle?: { pace: string; formality: string; engagement: string; emotional: string };
  greenFlags?: string[];
  redFlags?: string[];
  disclaimer?: string;
  failureCode?: string;
  createdAt: string;
  completedAt?: string;
  contact?: { id: string; displayName: string; platform?: string; notes?: string; aiMemory?: ContactMemory | null };
  messages?: AnalysisMessage[];
  replies?: SuggestedReply[];
}

export interface AnalysisMessage {
  id: string;
  speaker: 'SELF' | 'OTHER' | 'UNKNOWN';
  text: string;
  orderIndex: number;
  sentiment?: string;
  score?: number;
  explanation?: string;
}

export interface SuggestedReply {
  id: string;
  text: string;
  tone: ReplyTone;
  /** 1 = subtle, 2 = clear, 3 = full send. */
  intensity: number;
  riskLevel: RiskLevel;
  explanation: string;
  copiedAt?: string;
}

export interface UserProgress {
  eloScore: number;
  streakDays: number;
  totalAnalyses: number;
  avgScore?: number;
  recentTrend: Array<{ score?: number; date: string }>;
}

export const ELO_RANKS = [
  { min: 0, max: 900, label: 'Newbie', emoji: '🌱', color: '#6B7280' },
  { min: 900, max: 1050, label: 'Aware', emoji: '👀', color: '#10B981' },
  { min: 1050, max: 1150, label: 'Smooth', emoji: '😎', color: '#3B82F6' },
  { min: 1150, max: 1250, label: 'Charming', emoji: '✨', color: '#8B5CF6' },
  { min: 1250, max: 1400, label: 'Sharp', emoji: '⚡', color: '#F59E0B' },
  { min: 1400, max: Infinity, label: 'Elite', emoji: '👑', color: '#EF4444' },
] as const;

export function getRank(elo: number) {
  return ELO_RANKS.find((r) => elo >= r.min && elo < r.max) ?? ELO_RANKS[0];
}
