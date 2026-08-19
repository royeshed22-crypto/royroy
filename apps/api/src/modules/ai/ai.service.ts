import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT } from './prompts/analysis.prompt';

/** A past analysis with the same person, used to give the model continuity. */
export interface ConversationHistoryEntry {
  date: Date;
  vibeScore?: number;
  interestScore?: number;
  stage?: string;
  summary?: string;
}

/** Knowledge about a contact that accumulates across every scan. */
export interface ContactMemory {
  facts: string[];
  interests: string[];
  insideJokes: string[];
  openThreads: string[];
  avoid: string[];
}

export const EMPTY_MEMORY: ContactMemory = {
  facts: [], interests: [], insideJokes: [], openThreads: [], avoid: [],
};

/** Everything known about the person, assembled for one call. */
export interface AnalysisContext {
  history?: ConversationHistoryEntry[];
  memory?: ContactMemory | null;
  /** Notes the user typed for this specific scan. */
  userContext?: string | null;
  /** Long-lived notes the user keeps on this contact. */
  contactNotes?: string | null;
  contactName?: string;
}

export interface AnalysisResult {
  language: string;
  /** Name read off the chat header, when the screenshot shows one. */
  contactName?: string | null;
  /** New knowledge to fold into the contact's memory. */
  memoryUpdates?: Partial<ContactMemory>;
  extractedMessages: Array<{ speaker: 'self' | 'other'; text: string; orderIndex: number }>;
  summary: string;
  scores: { overall: number; vibe: number; interest: number; confidence: number };
  conversationStage: string;
  recommendedAction: { type: string; explanation: string };
  communicationStyle: { pace: string; formality: string; engagement: string; emotional: string };
  greenFlags: string[];
  redFlags: string[];
  messageAnalysis: Array<{ orderIndex: number; sentiment: string; score: number; note: string }>;
  safetyDecision: 'allow' | 'warn' | 'block';
  safetyNote?: string;
  disclaimer: string;
}

export interface ReplyResult {
  replies: Array<{
    tone: 'PLAYFUL' | 'DIRECT' | 'WARM';
    /** 1 = subtle, 2 = clear, 3 = full send. */
    intensity: number;
    text: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }>;
}

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;
  private readonly logger = new Logger(AiService.name);

  /** Tried in order. A single model alias can sit at 503 for minutes at a time. */
  private readonly models: string[];

  constructor(private config: ConfigService) {
    this.genAI = new GoogleGenerativeAI(config.get('GEMINI_API_KEY'));

    const primary = config.get('GEMINI_MODEL', 'gemini-3.6-flash');
    const fallbacks = (config.get('GEMINI_FALLBACK_MODELS', 'gemini-3.5-flash,gemini-flash-latest') as string)
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    this.models = [primary, ...fallbacks.filter((m) => m !== primary)];
  }

  /**
   * 503 means the model is momentarily busy and retrying the same one works.
   * 429 means the key's quota for that model is spent — retrying only burns
   * more of it, so we skip straight to the next model in the chain.
   */
  private classifyError(err: any): 'overloaded' | 'quota' | 'fatal' {
    const msg = err?.message ?? '';
    if (/quota|429|rate limit/i.test(msg)) return 'quota';
    if (/50[023]|overloaded|high demand|unavailable/i.test(msg)) return 'overloaded';
    return 'fatal';
  }

  /** True once every configured model has reported its quota exhausted. */
  isQuotaExhausted(err: any): boolean {
    return this.classifyError(err) === 'quota';
  }

  /**
   * Runs `call` against each configured model in turn, retrying transient
   * failures (503 under load, rate limits) with exponential backoff before
   * moving on to the next model.
   */
  private async generate(
    label: string,
    call: (model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>) => Promise<any>,
    attemptsPerModel = 3,
  ): Promise<any> {
    let lastErr: any;

    for (const modelName of this.models) {
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' },
      });

      for (let i = 0; i < attemptsPerModel; i++) {
        try {
          return await call(model);
        } catch (err) {
          lastErr = err;
          const kind = this.classifyError(err);

          if (kind === 'fatal') throw err;

          if (kind === 'quota') {
            this.logger.warn(`${label}: ${modelName} quota exhausted, skipping to next model`);
            break;
          }

          const isLastAttempt = i === attemptsPerModel - 1;
          if (isLastAttempt) {
            this.logger.warn(`${label}: ${modelName} overloaded, trying next model`);
            break;
          }

          const delay = 1200 * Math.pow(2, i);
          this.logger.warn(`${label}: ${modelName} busy, retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastErr;
  }

  /**
   * Assembles everything known about the contact into one block. Ordered so the
   * user's own words come first — they are the highest-signal input and the
   * only thing the screenshots cannot convey.
   */
  private buildContext(ctx: AnalysisContext = {}): string {
    const who = ctx.contactName ?? 'THIS PERSON';
    const parts: string[] = [];

    if (ctx.userContext?.trim()) {
      parts.push(`=== WHAT THE USER TOLD YOU ABOUT THIS MOMENT ===
${ctx.userContext.trim()}`);
    }

    if (ctx.contactNotes?.trim()) {
      parts.push(`=== THE USER'S NOTES ON ${who} ===
${ctx.contactNotes.trim()}`);
    }

    const m = ctx.memory;
    if (m) {
      const section = (label: string, items?: string[]) =>
        items?.length ? `${label}:\n${items.map((i) => `  - ${i}`).join('\n')}` : '';

      const blocks = [
        section('Facts', m.facts),
        section('Interests', m.interests),
        section('Inside jokes', m.insideJokes),
        section('Open threads', m.openThreads),
        section('Avoid these topics', m.avoid),
      ].filter(Boolean);

      if (blocks.length) {
        parts.push(`=== WHAT YOU ALREADY KNOW ABOUT ${who} ===
${blocks.join('\n')}`);
      }
    }

    if (ctx.history?.length) {
      const lines = ctx.history.map((h) => {
        const when = h.date.toLocaleDateString('en-GB');
        const scores = `vibe ${h.vibeScore ?? '?'}, interest ${h.interestScore ?? '?'}`;
        return `  - ${when} (${scores}, stage: ${h.stage ?? 'unknown'}): ${h.summary ?? 'no summary'}`;
      });
      parts.push(`=== EARLIER CONVERSATIONS WITH ${who} ===
Oldest first. Judge direction from this, not just the current screenshot.
${lines.join('\n')}`);
    }

    return parts.length ? `\n\n${parts.join('\n\n')}\n` : '';
  }

  /**
   * Reads memory back out of a Prisma Json column, tolerating null, a legacy
   * shape, or anything malformed rather than throwing mid-analysis.
   */
  parseMemory(raw: unknown): ContactMemory | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const src = raw as Record<string, unknown>;
    const list = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

    const parsed: ContactMemory = {
      facts: list(src.facts),
      interests: list(src.interests),
      insideJokes: list(src.insideJokes),
      openThreads: list(src.openThreads),
      avoid: list(src.avoid),
    };

    const isEmpty = Object.values(parsed).every((v) => v.length === 0);
    return isEmpty ? null : parsed;
  }

  /**
   * Folds new findings into existing memory, skipping duplicates and keeping
   * each list bounded so the prompt doesn't grow without limit.
   */
  mergeMemory(existing: ContactMemory | null, updates?: Partial<ContactMemory>): ContactMemory {
    const base: ContactMemory = { ...EMPTY_MEMORY, ...(existing ?? {}) };
    if (!updates) return base;

    const LIMITS: Record<keyof ContactMemory, number> = {
      facts: 30, interests: 20, insideJokes: 15, openThreads: 12, avoid: 10,
    };

    for (const key of Object.keys(LIMITS) as Array<keyof ContactMemory>) {
      const incoming = (updates[key] ?? []).map((s) => String(s).trim()).filter(Boolean);
      if (!incoming.length) continue;

      const seen = new Set(base[key].map((s) => s.toLowerCase()));
      const fresh = incoming.filter((s) => !seen.has(s.toLowerCase()));

      // Newest last, and trim from the front so recent knowledge survives.
      base[key] = [...base[key], ...fresh].slice(-LIMITS[key]);
    }

    return base;
  }

  async analyzeConversation(
    imagePaths: string[],
    userPreferences: { communicationStyle?: string; goals?: string[]; language?: string },
    context: AnalysisContext = {},
  ): Promise<AnalysisResult> {
    const imageParts = await Promise.all(
      imagePaths.map(async (imagePath) => {
        const fullPath = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);
        const imageBuffer = fs.readFileSync(fullPath);
        const base64 = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase().replace('.', '');
        const mimeType = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : `image/${ext}`;
        return { inlineData: { data: base64, mimeType } };
      }),
    );

    const userContext = userPreferences.communicationStyle
      ? `\n\nUSER CONTEXT: Communication style preference: ${userPreferences.communicationStyle}. Goals: ${(userPreferences.goals || []).join(', ')}.`
      : '';

    try {
      const contextBlock = this.buildContext(context);
      const prompt = `${SYSTEM_PROMPT}${userContext}${contextBlock}\n\nAnalyze this dating conversation from ${imagePaths.length} screenshot(s). Read the name from the chat header, extract all messages, and provide a full analysis. Return valid JSON only.`;

      const result = await this.generate('analyzeConversation', (model) =>
        model.generateContent([prompt, ...imageParts]),
      );
      const raw = result.response.text();
      const parsed: AnalysisResult = JSON.parse(raw);

      // Clamp scores
      parsed.scores.overall  = Math.max(0, Math.min(100, Math.round(parsed.scores.overall)));
      parsed.scores.vibe     = Math.max(0, Math.min(100, Math.round(parsed.scores.vibe)));
      parsed.scores.interest = Math.max(0, Math.min(100, Math.round(parsed.scores.interest)));
      parsed.scores.confidence = Math.max(0, Math.min(1, parsed.scores.confidence));

      return parsed;
    } catch (err) {
      this.logger.error('Gemini analysis failed', err);
      if (this.isQuotaExhausted(err)) {
        throw new BadRequestException(
          'Daily Gemini quota is used up. It resets at midnight Pacific time.',
        );
      }
      throw new BadRequestException('AI analysis failed. Please try again.');
    }
  }

  async generateReplies(
    analysisResult: AnalysisResult,
    lastMessages: Array<{ speaker: string; text: string }>,
    context: AnalysisContext = {},
  ): Promise<ReplyResult> {
    const lastFew = lastMessages
      .slice(-6)
      .map((m) => `${m.speaker === 'self' ? 'Me' : 'Them'}: ${m.text}`)
      .join('\n');

    try {
      const prompt = `${REPLY_SYSTEM_PROMPT}
${this.buildContext({ ...context, contactName: context.contactName ?? analysisResult.contactName ?? undefined })}
CONVERSATION CONTEXT:
Last messages:
${lastFew}

ANALYSIS:
- Vibe: ${analysisResult.scores.vibe}/100
- Interest level: ${analysisResult.scores.interest}/100
- Stage: ${analysisResult.conversationStage}
- Language: ${analysisResult.language}
- Their style: ${analysisResult.communicationStyle?.formality}, ${analysisResult.communicationStyle?.emotional}

Recommended action: ${analysisResult.recommendedAction?.type}

Generate 3 reply options (playful, direct, warm) that respond naturally to their last message.`;

      const result = await this.generate('generateReplies', (model) => model.generateContent(prompt));
      return JSON.parse(result.response.text());
    } catch (err) {
      // Return no replies rather than empty placeholders — the caller decides
      // whether to leave the analysis without replies or surface a retry.
      this.logger.error('Reply generation failed', err);
      return { replies: [] };
    }
  }

  async generateQuickReply(
    messageText: string,
    contextDescription: string,
    tone: string,
    language = 'he',
  ): Promise<{ replies: Array<{ text: string; tone: string; riskLevel: string; explanation: string }> }> {
    const prompt = `${REPLY_SYSTEM_PROMPT}

Generate 3 reply options for this message/situation.
Message: "${messageText}"
Context: ${contextDescription}
Preferred tone: ${tone}
Language: ${language === 'he' ? 'Hebrew (עברית)' : 'English'}

Return valid JSON with replies array.`;

    const result = await this.generate('generateQuickReply', (model) => model.generateContent(prompt));
    return JSON.parse(result.response.text());
  }
}
