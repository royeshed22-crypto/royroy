import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, IsNumber, IsIn, MaxLength, IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AnalysesService } from './analyses.service';
import { AiService } from '../ai/ai.service';

class CreateAnalysisDto {
  @IsArray() uploadIds: string[];
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsString() goal?: string;
  /** What a photo showed, what a voice note said, background on the relationship. */
  @IsOptional() @IsString() @MaxLength(4000) userContext?: string;
  /** Backfilling an existing conversation rather than asking what to reply. */
  @IsOptional() @IsBoolean() isImport?: boolean;
}

class SubmitFeedbackDto {
  @IsNumber() rating: number;
  @IsOptional() @IsString() comment?: string;
}

class QuickReplyDto {
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsString() context?: string;
  @IsOptional() @IsString() @IsIn(['playful', 'direct', 'warm', 'auto']) tone?: string;
}

@ApiTags('analyses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analyses')
export class AnalysesController {
  constructor(
    private analysesService: AnalysesService,
    private aiService: AiService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new analysis job' })
  create(@CurrentUser() user: any, @Body() dto: CreateAnalysisDto) {
    return this.analysesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all analyses for user' })
  findAll(@CurrentUser() user: any) {
    return this.analysesService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full analysis result' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.analysesService.findOne(user.id, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Poll analysis status' })
  getStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.analysesService.getStatus(user.id, id);
  }

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Submit feedback on analysis' })
  feedback(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.analysesService.submitFeedback(user.id, id, dto.rating, dto.comment);
  }

  @Post(':id/replies/regenerate')
  @ApiOperation({ summary: 'Regenerate suggested replies for an analysis' })
  regenerateReplies(@CurrentUser() user: any, @Param('id') id: string) {
    return this.analysesService.regenerateReplies(user.id, id);
  }

  @Post('replies/:replyId/copy')
  @ApiOperation({ summary: 'Mark reply as copied' })
  markCopied(@CurrentUser() user: any, @Param('replyId') replyId: string) {
    return this.analysesService.markReplyCopied(user.id, replyId);
  }

  @Post('quick-reply')
  @ApiOperation({ summary: 'Generate quick reply without full analysis' })
  async quickReply(@CurrentUser() user: any, @Body() dto: QuickReplyDto) {
    const prismaUser = await this.analysesService['prisma'].user.findUnique({ where: { id: user.id } });
    return this.aiService.generateQuickReply(
      dto.message ?? '',
      dto.context ?? '',
      dto.tone ?? 'auto',
      prismaUser?.language ?? 'he',
    );
  }
}
