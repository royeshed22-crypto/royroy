import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

/** An image ready to hand to the vision model. */
export interface ImagePart {
  inlineData: { data: string; mimeType: string };
}

/**
 * Thin transport layer over Gemini.
 *
 * Everything that talks to the model goes through here so retry, model
 * fallback, and quota handling live in exactly one place. The services above it
 * deal only in prompts and parsed results.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private genAI: GoogleGenerativeAI;

  /** Tried in order. A single alias can sit at 503, or spend its daily quota. */
  private readonly models: string[];

  constructor(private config: ConfigService) {
    this.genAI = new GoogleGenerativeAI(config.get('GEMINI_API_KEY'));

    const primary = config.get('GEMINI_MODEL', 'gemini-3.6-flash');
    const fallbacks = (
      config.get(
        'GEMINI_FALLBACK_MODELS',
        'gemini-3.5-flash,gemini-flash-latest,gemini-flash-lite-latest',
      ) as string
    )
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    this.models = [primary, ...fallbacks.filter((m) => m !== primary)];
  }

  /**
   * 503 means momentarily busy and retrying the same model works. 429 means the
   * quota for that model is spent, and retrying only burns more of it, so we
   * move straight to the next model.
   */
  private classify(err: any): 'overloaded' | 'quota' | 'fatal' {
    const msg = err?.message ?? '';
    if (/quota|429|rate limit/i.test(msg)) return 'quota';
    if (/50[023]|overloaded|high demand|unavailable/i.test(msg)) return 'overloaded';
    return 'fatal';
  }

  isQuotaError(err: any): boolean {
    return this.classify(err) === 'quota';
  }

  /**
   * Runs a JSON-mode generation against each model in turn, retrying transient
   * failures with backoff before moving on.
   *
   * `label` is used only for logging and never carries conversation content —
   * these are private chats and must not reach the logs.
   */
  async generateJson(
    label: string,
    prompt: string,
    images: ImagePart[] = [],
    attemptsPerModel = 3,
  ): Promise<string> {
    let lastErr: any;

    for (const modelName of this.models) {
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' },
      });

      for (let i = 0; i < attemptsPerModel; i++) {
        try {
          const result = await model.generateContent(
            images.length ? [prompt, ...images] : prompt,
          );
          return result.response.text();
        } catch (err) {
          lastErr = err;
          const kind = this.classify(err);

          if (kind === 'fatal') throw err;

          if (kind === 'quota') {
            this.logger.warn(`${label}: ${modelName} quota spent, next model`);
            break;
          }

          if (i === attemptsPerModel - 1) {
            this.logger.warn(`${label}: ${modelName} overloaded, next model`);
            break;
          }

          const delay = 1200 * Math.pow(2, i);
          this.logger.warn(`${label}: ${modelName} busy, retry in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastErr;
  }
}
