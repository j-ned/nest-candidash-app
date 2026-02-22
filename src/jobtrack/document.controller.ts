import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  StreamableFile,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { DocumentService, DocumentType } from './document.service';

@ApiTags('Documents')
@Controller('jobtrack')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  // ── CV ───────────────────────────────────────────────

  @Post(':id/cv')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload un CV (PDF, max 5 Mo)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiParam({ name: 'id', description: 'ID de la candidature' })
  @ApiResponse({ status: 201, description: 'CV uploadé avec succès' })
  @ApiResponse({ status: 400, description: 'Fichier invalide' })
  async uploadCv(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { sub: string } },
  ) {
    return this.documentService.uploadDocument(id, req.user.sub, 'cv', file);
  }

  @Get(':id/cv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Télécharger le CV' })
  @ApiParam({ name: 'id', description: 'ID de la candidature' })
  @ApiResponse({ status: 200, description: 'Fichier CV' })
  @ApiResponse({ status: 404, description: 'CV introuvable' })
  async downloadCv(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(id, req.user.sub, 'cv', res);
  }

  @Delete(':id/cv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Supprimer le CV' })
  @ApiParam({ name: 'id', description: 'ID de la candidature' })
  @ApiResponse({ status: 200, description: 'CV supprimé' })
  @ApiResponse({ status: 404, description: 'CV introuvable' })
  async deleteCv(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ) {
    await this.documentService.deleteDocument(id, req.user.sub, 'cv');
    return { message: 'CV supprimé' };
  }

  // ── LM ───────────────────────────────────────────────

  @Post(':id/lm')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload une lettre de motivation (PDF, max 5 Mo)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiParam({ name: 'id', description: 'ID de la candidature' })
  @ApiResponse({ status: 201, description: 'LM uploadée avec succès' })
  @ApiResponse({ status: 400, description: 'Fichier invalide' })
  async uploadLm(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { sub: string } },
  ) {
    return this.documentService.uploadDocument(id, req.user.sub, 'lm', file);
  }

  @Get(':id/lm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Télécharger la lettre de motivation' })
  @ApiParam({ name: 'id', description: 'ID de la candidature' })
  @ApiResponse({ status: 200, description: 'Fichier LM' })
  @ApiResponse({ status: 404, description: 'LM introuvable' })
  async downloadLm(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(id, req.user.sub, 'lm', res);
  }

  @Delete(':id/lm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Supprimer la lettre de motivation' })
  @ApiParam({ name: 'id', description: 'ID de la candidature' })
  @ApiResponse({ status: 200, description: 'LM supprimée' })
  @ApiResponse({ status: 404, description: 'LM introuvable' })
  async deleteLm(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ) {
    await this.documentService.deleteDocument(id, req.user.sub, 'lm');
    return { message: 'Lettre de motivation supprimée' };
  }

  // ── Shared ───────────────────────────────────────────

  private async streamDocument(
    jobTrackId: string,
    userId: string,
    type: DocumentType,
    res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, contentType } =
      await this.documentService.downloadDocument(jobTrackId, userId, type);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    });

    return new StreamableFile(stream);
  }
}
