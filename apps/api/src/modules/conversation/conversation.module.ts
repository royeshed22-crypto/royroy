import { Module } from '@nestjs/common';
import { DedupService } from './dedup.service';
import { ConversationService } from './conversation.service';
import { ContextBuilderService } from './context-builder.service';
import { ConversationController } from './conversation.controller';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiModule, AuthModule],
  providers: [DedupService, ConversationService, ContextBuilderService],
  controllers: [ConversationController],
  exports: [DedupService, ConversationService, ContextBuilderService],
})
export class ConversationModule {}
