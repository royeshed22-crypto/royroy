import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GeminiClient, ImagePart } from './gemini.client';
import { EXTRACTION_PROMPT } from './prompts/memory.prompt';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExtractedMessageRaw {
  speaker: 'SELF' | 'OTHER' | 'UNKNOWN';
  text: string;
  messageType?: string;
  sentAtRaw?: string | null;
  /** Which image it was read from; deduplication needs this to find seams. */
  screenshotIndex?: number;
}

export interface ExtractedConversation {
  contactName: string | null;
  language: string;
  messages: ExtractedMessageRaw[];
}

/**
 * Turns screenshots into structured messages, and nothing else.
 *
 * Separating this out is what lets screenshots stay an ingestion detail: once a
 * conversation has been read, later analysis and reply generation work from the
 * stored text and never re-send the images.
 *
 * Images are read one at a time and cached by content hash. Batching several
 * into one call was cheaper, but the model would split messages differently
 * between passes, so re-uploading a screenshot produced text that no longer
 * matched what was stored and the whole thing landed again as new. Per-image
 * caching makes the same file always yield the same transcript.
 */
@Injectable()
export class ExtractorService {
  private readonly logger = new Logger(ExtractorService.name);

  constructor(
    private gemini: GeminiClient,
    private prisma: PrismaService,
  ) {}

  private hashFile(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private loadImage(imagePath: string): { part: ImagePart; hash: string } {
    const full = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);
    const buffer = fs.readFileSync(full);
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mimeType =
      ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : `image/${ext}`;

    return {
      part: { inlineData: { data: buffer.toString('base64'), mimeType } },
      hash: this.hashFile(buffer),
    };
  }

  /** Reads a single screenshot, serving a previous transcription when we have one. */
  private async extractOne(imagePath: string): Promise<ExtractedConversation> {
    const { part, hash } = this.loadImage(imagePath);

    const cached = await this.prisma.extractionCache
      .findUnique({ where: { imageHash: hash } })
      .catch(() => null);

    if (cached?.result) {
      this.logger.debug('Using cached transcription');
      return cached.result as unknown as ExtractedConversation;
    }

    const prompt = `${EXTRACTION_PROMPT}

You are given exactly one screenshot. Transcribe every message in it, in order.
Set screenshotIndex to 0 for all of them.`;

    try {
      const raw = await this.gemini.generateJson('extract', prompt, [part]);
      const parsed = JSON.parse(raw) as ExtractedConversation;

      const result: ExtractedConversation = {
        contactName: parsed.contactName?.trim() || null,
        language: parsed.language ?? 'he',
        messages: (parsed.messages ?? [])
          .filter((m) => typeof m?.text === 'string' && m.text.trim())
          .map((m) => ({
            speaker: (['SELF', 'OTHER', 'UNKNOWN'].includes(m.speaker) ? m.speaker : 'UNKNOWN') as
              'SELF' | 'OTHER' | 'UNKNOWN',
            text: m.text.trim(),
            messageType: m.messageType ?? 'text',
            sentAtRaw: m.sentAtRaw ?? null,
          })),
      };

      // Best-effort: a cache write failing must not fail the extraction.
      await this.prisma.extractionCache
        .create({ data: { imageHash: hash, result: result as any } })
        .catch(() => {});

      return result;
    } catch (err) {
      this.logger.error(`Extraction failed: ${err.message?.slice(0, 140)}`);
      if (this.gemini.isQuotaError(err)) {
        throw new BadRequestException(
          'Daily Gemini quota is used up. It resets at midnight Pacific time.',
        );
      }
      throw new BadRequestException('Could not read the screenshots. Please try again.');
    }
  }

  /**
   * Reads a set of screenshots, oldest first, and returns one flat list tagged
   * with the image each message came from.
   */
  async extractMany(imagePaths: string[]): Promise<ExtractedConversation> {
    if (!imagePaths.length) {
      return { contactName: null, language: 'he', messages: [] };
    }

    const all: ExtractedMessageRaw[] = [];
    let contactName: string | null = null;
    let language = 'he';

    for (let i = 0; i < imagePaths.length; i++) {
      const one = await this.extractOne(imagePaths[i]);

      contactName = contactName ?? one.contactName;
      if (one.language && one.language !== 'he') language = one.language;

      all.push(...one.messages.map((m) => ({ ...m, screenshotIndex: i })));
    }

    // Count only; the content itself must never reach the logs.
    this.logger.log(`Extracted ${all.length} message(s) from ${imagePaths.length} image(s)`);

    return { contactName, language, messages: all };
  }

  /** Kept for callers that read a single image. */
  async extractBatch(imagePaths: string[]): Promise<ExtractedConversation> {
    return this.extractMany(imagePaths);
  }
}
