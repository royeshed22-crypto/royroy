import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiClient, ImagePart } from './gemini.client';
import { EXTRACTION_PROMPT } from './prompts/memory.prompt';

export interface ExtractedConversation {
  contactName: string | null;
  language: string;
  messages: Array<{
    speaker: 'SELF' | 'OTHER' | 'UNKNOWN';
    text: string;
    messageType?: string;
    sentAtRaw?: string | null;
    /** Which image it was read from; deduplication needs this to find seams. */
    screenshotIndex?: number;
  }>;
}

/**
 * Turns screenshots into structured messages, and nothing else.
 *
 * Separating this out is what lets screenshots stay an ingestion detail: once a
 * conversation has been read, later analysis and reply generation work from the
 * stored text and never re-send the images.
 */
@Injectable()
export class ExtractorService {
  private readonly logger = new Logger(ExtractorService.name);

  /** Beyond this, one request risks truncation; callers should chunk. */
  static readonly MAX_IMAGES_PER_CALL = 8;

  constructor(private gemini: GeminiClient) {}

  private loadImage(imagePath: string): ImagePart {
    const full = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);
    const buffer = fs.readFileSync(full);
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mimeType =
      ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : `image/${ext}`;

    return { inlineData: { data: buffer.toString('base64'), mimeType } };
  }

  /**
   * Reads one batch of screenshots. Order matters: they are treated as oldest
   * first, matching how the UI presents them.
   */
  async extractBatch(imagePaths: string[]): Promise<ExtractedConversation> {
    if (!imagePaths.length) {
      return { contactName: null, language: 'he', messages: [] };
    }

    const images = imagePaths.map((p) => this.loadImage(p));
    const prompt = `${EXTRACTION_PROMPT}

You are given ${imagePaths.length} screenshot(s), oldest first. Transcribe every
message you can read across all of them, in chronological order.`;

    try {
      const raw = await this.gemini.generateJson('extract', prompt, images);
      const parsed = JSON.parse(raw) as ExtractedConversation;

      const messages = (parsed.messages ?? [])
        .filter((m) => typeof m?.text === 'string' && m.text.trim())
        .map((m) => ({
          speaker: (['SELF', 'OTHER', 'UNKNOWN'].includes(m.speaker) ? m.speaker : 'UNKNOWN') as
            'SELF' | 'OTHER' | 'UNKNOWN',
          text: m.text.trim(),
          messageType: m.messageType ?? 'text',
          sentAtRaw: m.sentAtRaw ?? null,
          screenshotIndex:
            typeof m.screenshotIndex === 'number' ? m.screenshotIndex : undefined,
        }));

      // Count only; the content itself must never reach the logs.
      this.logger.log(`Extracted ${messages.length} message(s) from ${imagePaths.length} image(s)`);

      return {
        contactName: parsed.contactName?.trim() || null,
        language: parsed.language ?? 'he',
        messages,
      };
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
   * Reads a large upload in sequential chunks.
   *
   * Chunks overlap by one screenshot so the seam between them stays visible to
   * the reader, and the batches are processed in order because a later chunk's
   * position only makes sense relative to the one before it.
   */
  async extractMany(imagePaths: string[]): Promise<ExtractedConversation> {
    if (imagePaths.length <= ExtractorService.MAX_IMAGES_PER_CALL) {
      return this.extractBatch(imagePaths);
    }

    const chunkSize = ExtractorService.MAX_IMAGES_PER_CALL;
    const step = chunkSize - 1;
    const all: ExtractedConversation['messages'] = [];
    let contactName: string | null = null;
    let language = 'he';

    for (let start = 0; start < imagePaths.length; start += step) {
      const chunk = imagePaths.slice(start, start + chunkSize);
      const result = await this.extractBatch(chunk);

      contactName = contactName ?? result.contactName;
      if (result.language && result.language !== 'he') language = result.language;

      // Each chunk numbers its images from zero, so shift them into the
      // batch-wide sequence or deduplication would see every chunk restart.
      all.push(
        ...result.messages.map((m) => ({
          ...m,
          screenshotIndex:
            typeof m.screenshotIndex === 'number' ? m.screenshotIndex + start : undefined,
        })),
      );

      if (start + chunkSize >= imagePaths.length) break;
    }

    return { contactName, language, messages: all };
  }
}
