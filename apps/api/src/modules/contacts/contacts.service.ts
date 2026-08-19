import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, status?: string) {
    return this.prisma.contact.findMany({
      where: { userId, status: status as any ?? 'ACTIVE' },
      include: {
        _count: { select: { analyses: true } },
        analyses: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { overallScore: true, vibeScore: true, createdAt: true, summary: true },
        },
      },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  async findOne(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        analyses: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, overallScore: true, vibeScore: true, interestScore: true,
            summary: true, recommendedAction: true, createdAt: true,
          },
        },
      },
    });
    if (!contact) throw new NotFoundException();
    if (contact.userId !== userId) throw new ForbiddenException();
    return contact;
  }

  async create(userId: string, data: { displayName: string; platform?: string; notes?: string }) {
    return this.prisma.contact.create({ data: { userId, ...data } });
  }

  async update(userId: string, contactId: string, data: Partial<{ displayName: string; platform: string; notes: string }>) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException();
    if (contact.userId !== userId) throw new ForbiddenException();
    return this.prisma.contact.update({ where: { id: contactId }, data });
  }

  /**
   * Replaces the listed memory categories. Lets the user delete something the
   * model got wrong, which matters because memory feeds every future reply.
   */
  async updateMemory(
    userId: string,
    contactId: string,
    updates: Partial<
      Record<'interests' | 'insideJokes' | 'plans' | 'unresolvedTopics' | 'boundaries', string[]>
    >,
  ) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException();
    if (contact.userId !== userId) throw new ForbiddenException();

    const current = (contact.aiMemory as any) ?? {};

    const merged = { ...current };
    for (const [key, value] of Object.entries(updates)) {
      if (Array.isArray(value)) {
        merged[key] = value.map((s) => String(s).trim()).filter(Boolean);
      }
    }

    return this.prisma.contact.update({
      where: { id: contactId },
      data: { aiMemory: merged },
    });
  }

  async archive(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException();
    if (contact.userId !== userId) throw new ForbiddenException();
    return this.prisma.contact.update({
      where: { id: contactId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  async remove(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException();
    if (contact.userId !== userId) throw new ForbiddenException();
    return this.prisma.contact.delete({ where: { id: contactId } });
  }
}
