import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AnalysesService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
    private aiService: AiService,
    @InjectQueue('analyses') private analysesQueue: Queue,
  ) {}

  async create(userId: string, dto: { uploadIds: string[]; contactId?: string; goal?: string }) {
    if (!dto.uploadIds || dto.uploadIds.length === 0) {
      throw new BadRequestException('At least one upload is required');
    }

    const uploads = await this.uploadsService.findManyByIds(dto.uploadIds);
    const forbidden = uploads.find((u) => u.userId !== userId);
    if (forbidden) throw new ForbiddenException('Invalid upload ownership');

    const analysis = await this.prisma.analysis.create({
      data: {
        userId,
        contactId: dto.contactId ?? null,
        status: 'PENDING',
        uploads: { connect: dto.uploadIds.map((id) => ({ id })) },
      },
    });

    await this.analysesQueue.add(
      'process',
      { analysisId: analysis.id, userId, goal: dto.goal },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { id: analysis.id, status: 'PENDING' };
  }

  async findAll(userId: string) {
    return this.prisma.analysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, status: true, overallScore: true, vibeScore: true,
        summary: true, createdAt: true, completedAt: true,
        contact: { select: { id: true, displayName: true } },
      },
    });
  }

  async findOne(userId: string, analysisId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        messages: { orderBy: { orderIndex: 'asc' } },
        replies: { orderBy: { createdAt: 'asc' } },
        contact: { select: { id: true, displayName: true, platform: true } },
      },
    });

    if (!analysis) throw new NotFoundException();
    if (analysis.userId !== userId) throw new ForbiddenException();
    return analysis;
  }

  async getStatus(userId: string, analysisId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { id: true, status: true, failureCode: true, userId: true },
    });
    if (!analysis) throw new NotFoundException();
    if (analysis.userId !== userId) throw new ForbiddenException();
    return { id: analysis.id, status: analysis.status, failureCode: analysis.failureCode };
  }

  async submitFeedback(userId: string, analysisId: string, rating: number, comment?: string) {
    const analysis = await this.prisma.analysis.findUnique({ where: { id: analysisId } });
    if (!analysis) throw new NotFoundException();
    if (analysis.userId !== userId) throw new ForbiddenException();
    return { success: true };
  }

  async markReplyCopied(userId: string, replyId: string) {
    const reply = await this.prisma.suggestedReply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException();
    if (reply.userId !== userId) throw new ForbiddenException();
    return this.prisma.suggestedReply.update({
      where: { id: replyId },
      data: { copiedAt: new Date() },
    });
  }

  /**
   * Re-runs reply generation for an already-completed analysis, replacing any
   * replies it currently has. Used when the first generation hit a transient
   * model outage.
   */
  async regenerateReplies(userId: string, analysisId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { messages: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!analysis) throw new NotFoundException();
    if (analysis.userId !== userId) throw new ForbiddenException();
    if (analysis.status !== 'COMPLETED') {
      throw new BadRequestException('Analysis is not completed yet');
    }

    const lastMessages = analysis.messages.map((m) => ({
      speaker: m.speaker === 'SELF' ? 'self' : 'other',
      text: m.text,
    }));

    const result = await this.aiService.generateReplies(
      {
        scores: {
          overall: analysis.overallScore ?? 50,
          vibe: analysis.vibeScore ?? 50,
          interest: analysis.interestScore ?? 50,
          confidence: analysis.confidence ?? 0.5,
        },
        conversationStage: analysis.conversationStage ?? 'building',
        language: analysis.language ?? 'he',
        communicationStyle: analysis.communicationStyle as any,
        recommendedAction: analysis.recommendedAction as any,
      } as any,
      lastMessages,
    );

    const valid = (result.replies ?? []).filter((r) => r.text?.trim());
    if (valid.length === 0) {
      throw new BadRequestException('Reply generation is temporarily unavailable. Please try again.');
    }

    await this.prisma.suggestedReply.deleteMany({ where: { analysisId } });
    await this.prisma.suggestedReply.createMany({
      data: valid.map((r) => ({
        analysisId,
        userId,
        text: r.text,
        tone: r.tone as any,
        riskLevel: r.riskLevel as any,
        explanation: r.explanation,
      })),
    });

    return this.prisma.suggestedReply.findMany({
      where: { analysisId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
