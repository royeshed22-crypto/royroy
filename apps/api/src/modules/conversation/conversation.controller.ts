import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationService } from './conversation.service';

@ApiTags('conversation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts/:contactId/conversation')
export class ConversationController {
  constructor(private conversation: ConversationService) {}

  @Get()
  @ApiOperation({ summary: 'Full deduplicated message timeline for a contact' })
  getTimeline(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    return this.conversation.getTimeline(user.id, contactId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the timeline without deleting the contact' })
  clear(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    return this.conversation.clearTimeline(user.id, contactId);
  }
}
