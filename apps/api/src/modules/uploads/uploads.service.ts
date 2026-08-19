import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadsService {
  constructor(private prisma: PrismaService) {}

  async createUploadRecord(
    userId: string,
    file: Express.Multer.File,
  ) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return this.prisma.upload.create({
      data: {
        userId,
        filename: file.originalname,
        path: file.path,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        expiresAt,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.upload.findUnique({ where: { id } });
  }

  async findManyByIds(ids: string[]) {
    return this.prisma.upload.findMany({ where: { id: { in: ids } } });
  }

  async cleanupExpiredUploads() {
    const expired = await this.prisma.upload.findMany({
      where: { expiresAt: { lt: new Date() }, analysisId: null },
    });

    for (const upload of expired) {
      try {
        if (fs.existsSync(upload.path)) {
          fs.unlinkSync(upload.path);
        }
      } catch { /* ignore */ }
    }

    await this.prisma.upload.deleteMany({
      where: { id: { in: expired.map((u) => u.id) } },
    });
  }

  async deleteFile(uploadId: string) {
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (upload) {
      try {
        if (fs.existsSync(upload.path)) fs.unlinkSync(upload.path);
      } catch { /* ignore */ }
      await this.prisma.upload.delete({ where: { id: uploadId } });
    }
  }
}
