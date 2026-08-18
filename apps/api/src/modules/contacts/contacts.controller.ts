import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
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
  @IsOptional() @IsString() notes?: string;
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

  @Patch(':id/archive')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.archive(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.remove(user.id, id);
  }
}
