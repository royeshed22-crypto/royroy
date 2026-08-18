import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';

class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('session')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or restore anonymous session' })
  createSession(@Body() dto: CreateSessionDto) {
    return this.authService.createAnonymousSession(dto.deviceId);
  }
}
