import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updatePreferences(userId: string, data: {
    displayName?: string;
    gender?: string;
    goals?: string[];
    communicationStyle?: string;
    language?: string;
    timezone?: string;
  }) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async getProgress(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const totalAnalyses = await this.prisma.analysis.count({
      where: { userId, status: 'COMPLETED' },
    });
    const recentAnalyses = await this.prisma.analysis.findMany({
      where: { userId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { overallScore: true, createdAt: true },
    });

    const avgScore =
      recentAnalyses.length > 0
        ? Math.round(recentAnalyses.reduce((s, a) => s + (a.overallScore ?? 0), 0) / recentAnalyses.length)
        : null;

    return {
      eloScore: user.eloScore,
      streakDays: user.streakDays,
      totalAnalyses,
      avgScore,
      recentTrend: recentAnalyses.map((a) => ({ score: a.overallScore, date: a.createdAt })),
    };
  }

  async addConsent(userId: string, consentType: string, documentVersion: string) {
    return this.prisma.consent.upsert({
      where: { userId_consentType: { userId, consentType: consentType as any } },
      create: { userId, consentType: consentType as any, documentVersion, accepted: true },
      update: { accepted: true, documentVersion, acceptedAt: new Date() },
    });
  }
}
