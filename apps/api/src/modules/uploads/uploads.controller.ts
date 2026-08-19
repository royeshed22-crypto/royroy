import {
  Controller, Post, UseGuards, UseInterceptors, UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UploadsService } from './uploads.service';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads'),
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${extname(file.originalname)}`);
  },
});

const MAX_SIZE = 20 * 1024 * 1024;

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload conversation screenshots (max 10)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10, { storage }))
  async uploadFiles(
    @CurrentUser() user: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one image is required');
    }

    for (const file of files) {
      if (!file.mimetype?.startsWith('image/')) {
        throw new BadRequestException(`File ${file.originalname} is not an image`);
      }
      if (file.size > MAX_SIZE) {
        throw new BadRequestException(`File ${file.originalname} exceeds 20MB`);
      }
    }

    const uploads = await Promise.all(
      files.map((file) => this.uploadsService.createUploadRecord(user.id, file)),
    );
    return uploads.map((u) => ({ id: u.id, filename: u.filename, sizeBytes: u.sizeBytes }));
  }
}
