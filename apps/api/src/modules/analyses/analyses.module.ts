import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AnalysesService } from './analyses.service';
import { AnalysesController } from './analyses.controller';
import { AnalysesProcessor } from './analyses.processor';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [
    AuthModule,
    AiModule,
    UploadsModule,
    ConversationModule,
    BullModule.registerQueue({ name: 'analyses' }),
  ],
  providers: [AnalysesService, AnalysesProcessor],
  controllers: [AnalysesController],
  exports: [AnalysesService],
})
export class AnalysesModule {}
