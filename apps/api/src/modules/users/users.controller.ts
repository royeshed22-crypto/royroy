import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

class UpdatePreferencesDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsArray() goals?: string[];
  @IsOptional() @IsString() communicationStyle?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() timezone?: string;
}

class AddConsentDto {
  @IsString() consentType: string;
  @IsString() documentVersion: string;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update user preferences' })
  updatePreferences(@CurrentUser() user: any, @Body() dto: UpdatePreferencesDto) {
    return this.usersService.updatePreferences(user.id, dto);
  }

  @Get('progress')
  @ApiOperation({ summary: 'Get user progress and ELO' })
  getProgress(@CurrentUser() user: any) {
    return this.usersService.getProgress(user.id);
  }

  @Post('consents')
  @ApiOperation({ summary: 'Record user consent' })
  addConsent(@CurrentUser() user: any, @Body() dto: AddConsentDto) {
    return this.usersService.addConsent(user.id, dto.consentType, dto.documentVersion);
  }
}
