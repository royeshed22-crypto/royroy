import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { GeminiClient } from './gemini.client';
import { ExtractorService } from './extractor.service';
import { MemoryUpdaterService } from './memory-updater.service';

/**
 * Three roles over one transport:
 *   ExtractorService     screenshots -> structured messages
 *   MemoryUpdaterService memory + new messages -> what changed
 *   AiService            assembled context -> analysis and replies
 *
 * Splitting them keeps the expensive reasoning model out of OCR work, and means
 * a change to how conversations are read cannot disturb how replies are written.
 */
@Module({
  providers: [GeminiClient, ExtractorService, MemoryUpdaterService, AiService],
  exports: [GeminiClient, ExtractorService, MemoryUpdaterService, AiService],
})
export class AiModule {}
