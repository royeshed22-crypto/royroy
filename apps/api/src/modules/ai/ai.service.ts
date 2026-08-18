import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT } from './prompts/analysis.prompt';

export interface AnalysisResult {
  language: string;
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
    text: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }>;
}

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;
  private readonly logger = new Logger(AiService.name);
  private readonly model: string;

  constructor(private config: ConfigService) {
    this.genAI = new GoogleGenerativeAI(config.get('GEMINI_API_KEY'));
    this.model = config.get('GEMINI_MODEL', 'gemini-flash-latest');
  }

  /**
   * Gemini returns 503 when the model is under load. Retry with exponential
   * backoff before giving up — these spikes are usually a few seconds long.
   */
  private async withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const retryable = /50[023]|overloaded|high demand|rate limit|429/i.test(err?.message ?? '');
        if (!retryable || i === attempts - 1) break;
        const delay = 1500 * Math.pow(2, i);
        this.logger.warn(`${label} attempt ${i + 1} failed (${err.message?.slice(0, 80)}), retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  async analyzeConversation(
    imagePaths: string[],
    userPreferences: { communicationStyle?: string; goals?: string[]; language?: string },
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
      const gemini = this.genAI.getGenerativeModel({
        model: this.model,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `${SYSTEM_PROMPT}${userContext}\n\nAnalyze this dating conversation from ${imagePaths.length} screenshot(s). Extract all messages and provide a full analysis. Return valid JSON only.`;

      const result = await this.withRetry('analyzeConversation', () =>
        gemini.generateContent([prompt, ...imageParts]),
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
      throw new BadRequestException('AI analysis failed. Please try again.');
    }
  }

  async generateReplies(
    analysisResult: AnalysisResult,
    lastMessages: Array<{ speaker: string; text: string }>,
  ): Promise<ReplyResult> {
    const lastFew = lastMessages
      .slice(-6)
      .map((m) => `${m.speaker === 'self' ? 'Me' : 'Them'}: ${m.text}`)
      .join('\n');

    try {
      const gemini = this.genAI.getGenerativeModel({
        model: this.model,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `${REPLY_SYSTEM_PROMPT}

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

      const result = await this.withRetry('generateReplies', () => gemini.generateContent(prompt));
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
    const gemini = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `${REPLY_SYSTEM_PROMPT}

Generate 3 reply options for this message/situation.
Message: "${messageText}"
Context: ${contextDescription}
Preferred tone: ${tone}
Language: ${language === 'he' ? 'Hebrew (עברית)' : 'English'}

Return valid JSON with replies array.`;

    const result = await this.withRetry('generateQuickReply', () => gemini.generateContent(prompt));
    return JSON.parse(result.response.text());
  }
}
