import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async createAnonymousSession(deviceId: string) {
    let user = await this.prisma.user.findUnique({ where: { deviceId } });

    if (!user) {
      user = await this.prisma.user.create({
        data: { deviceId, language: 'he' },
      });
    }

    const token = this.jwt.sign({ sub: user.id, deviceId: user.deviceId });
    return { token, user };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    return user;
  }
}
