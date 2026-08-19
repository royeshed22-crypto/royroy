import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { GeminiClient } from './gemini.client';
import { SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT } from './prompts/analysis.prompt';

export interface AnalysisResult {
  language: string;
  summary: string;
  scores: { overall: number; vibe: number; interest: number; confidence: number };
  conversationStage: string;
  recommendedAction: { type: string; explanation: string };
  communicationStyle: { pace: string; formality: string; engagement: string; emotional: string };
  greenFlags: string[];
  redFlags: string[];
  safetyDecision: 'allow' | 'warn' | 'block';
  safetyNote?: string;
  disclaimer: string;
}

export interface ReplyResult {
  replies: Array<{
    tone: 'PLAYFUL' | 'DIRECT' | 'WARM';
    intensity: number;
    text: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }>;
}

/**
 * The dating assistant: reads an already-assembled context and produces the
 * user-facing output.
 *
 * It never sees screenshots. Extraction happens once in ExtractorService, and
 * everything here works from stored text, which is what keeps a long
 * relationship from re-sending its entire image history on every request.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private gemini: GeminiClient) {}

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * Scores the relationship and reads the room.
   *
   * `context` comes from ContextBuilderService and already carries memory, the
   * user's notes, and a recent message window.
   */
  async analyzeConversation(
    context: string,
    prefs: { communicationStyle?: string | null; language?: string } = {},
  ): Promise<AnalysisResult> {
    const styleNote = prefs.communicationStyle
      ? `\n\nUSER CONTEXT: their natural style is ${prefs.communicationStyle}.`
      : '';

    const prompt = `${SYSTEM_PROMPT}${styleNote}

${context}

Analyse where this conversation stands. Return valid JSON only.`;

    try {
      const raw = await this.gemini.generateJson('analyze', prompt);
      const parsed = JSON.parse(raw) as AnalysisResult;

      parsed.scores = {
        overall: Math.round(this.clamp(parsed.scores?.overall ?? 50, 0, 100)),
        vibe: Math.round(this.clamp(parsed.scores?.vibe ?? 50, 0, 100)),
        interest: Math.round(this.clamp(parsed.scores?.interest ?? 50, 0, 100)),
        confidence: this.clamp(parsed.scores?.confidence ?? 0.5, 0, 1),
      };
      parsed.language = parsed.language ?? prefs.language ?? 'he';

      return parsed;
    } catch (err) {
      this.logger.error(`Analysis failed: ${err.message?.slice(0, 140)}`);
      if (this.gemini.isQuotaError(err)) {
        throw new BadRequestException(
          'Daily Gemini quota is used up. It resets at midnight Pacific time.',
        );
      }
      throw new BadRequestException('AI analysis failed. Please try again.');
    }
  }

  /** Nine suggestions: three tones at three intensities. */
  async generateReplies(analysis: AnalysisResult, context: string): Promise<ReplyResult> {
    const prompt = `${REPLY_SYSTEM_PROMPT}

${context}

=== THE READ ON THIS CONVERSATION ===
Vibe ${analysis.scores.vibe}/100, interest ${analysis.scores.interest}/100
Stage: ${analysis.conversationStage}
Language: ${analysis.language}
Recommended action: ${analysis.recommendedAction?.type ?? 'REPLY_NOW'}

Write the nine replies. Return valid JSON only.`;

    try {
      const raw = await this.gemini.generateJson('replies', prompt);
      return JSON.parse(raw) as ReplyResult;
    } catch (err) {
      // Replies failing must not fail the analysis; the caller surfaces a retry.
      this.logger.error(`Reply generation failed: ${err.message?.slice(0, 140)}`);
      return { replies: [] };
    }
  }

  /** A one-off suggestion with no stored relationship behind it. */
  async generateQuickReply(
    messageText: string,
    contextDescription: string,
    tone: string,
    language = 'he',
  ): Promise<ReplyResult> {
    const prompt = `${REPLY_SYSTEM_PROMPT}

=== THE SITUATION ===
Their message: "${messageText}"
Context: ${contextDescription}
Preferred tone: ${tone}
Language: ${language === 'he' ? 'Hebrew' : 'English'}

Write the nine replies. Return valid JSON only.`;

    const raw = await this.gemini.generateJson('quickReply', prompt);
    return JSON.parse(raw) as ReplyResult;
  }
}
