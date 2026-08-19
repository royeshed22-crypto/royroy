import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContactsService } from './contacts.service';

class CreateContactDto {
  @IsString() displayName: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() notes?: string;
}

class UpdateContactDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() @MaxLength(8000) notes?: string;
}

/**
 * Each list replaces the stored one, so the user can prune what the model
 * learned. Only the plain-string lists are editable; facts and inferences carry
 * confidence the UI cannot re-derive, so they stay model-owned.
 */
class UpdateMemoryDto {
  @IsOptional() @IsArray() @IsString({ each: true }) interests?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) insideJokes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) plans?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) unresolvedTopics?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) boundaries?: string[];
}

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.contactsService.findAll(user.id, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateContactDto) {
    return this.contactsService.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(user.id, id, dto);
  }

  @Patch(':id/memory')
  updateMemory(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateMemoryDto) {
    return this.contactsService.updateMemory(user.id, id, dto);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.archive(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.remove(user.id, id);
  }
}
