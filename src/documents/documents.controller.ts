import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/request.interface';
import {
  DocumentsService,
  type DocumentDetail,
  type DocumentSummary,
} from './documents.service';
import {
  CreateDocumentDto,
  DuplicateDocumentDto,
  UpdateDocumentDto,
} from './dto/document.dto';

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({
    summary: 'CV et lettres de l’utilisateur, sans leur contenu',
  })
  list(@Request() req: AuthenticatedUser): Promise<DocumentSummary[]> {
    return this.documentsService.list(req.user.sub);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @Request() req: AuthenticatedUser,
  ): Promise<DocumentDetail> {
    return this.documentsService.get(id, req.user.sub);
  }

  @Post()
  create(
    @Body() body: CreateDocumentDto,
    @Request() req: AuthenticatedUser,
  ): Promise<DocumentDetail> {
    return this.documentsService.create(req.user.sub, body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateDocumentDto,
    @Request() req: AuthenticatedUser,
  ): Promise<DocumentDetail> {
    return this.documentsService.update(id, req.user.sub, body);
  }

  @Post(':id/duplicate')
  @ApiOperation({
    summary:
      'Déclinaison indépendante d’un document (par exemple pour une offre)',
  })
  duplicate(
    @Param('id') id: string,
    @Body() body: DuplicateDocumentDto,
    @Request() req: AuthenticatedUser,
  ): Promise<DocumentDetail> {
    return this.documentsService.duplicate(id, req.user.sub, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Request() req: AuthenticatedUser,
  ): Promise<void> {
    await this.documentsService.remove(id, req.user.sub);
  }
}
