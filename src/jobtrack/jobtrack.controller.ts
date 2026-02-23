import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  Request,
  Query,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JobTrackService } from './jobtrack.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { JobTrackResponseDto } from './dto/jobtrack-response.dto';
import { JobStatus } from '../generated/prisma/enums.js';
import { CreateJobTrackWithReminderDto } from './dto/create-jobtrack-with-reminder.dto';
import { JobTrackWithReminderResponseDto } from './dto/jobtrack-with-reminder-response.dto';
import { UpdateJobTrackWithReminderDto } from './dto/update-jobtrack-with-reminder.dto';
import type { AuthenticatedUser } from './interfaces';
import {
  ApiJobTrackOperation,
  ApiJobTrackWithReminderResponse,
} from './decorators/api-decorators';

@ApiTags('JobTrack')
@Controller('jobtrack')
export class JobTrackController {
  constructor(private readonly jobTrackService: JobTrackService) {}

  @Post('with-reminder')
  @ApiJobTrackOperation(
    'Créer une annonce et son rappel initial en un seul POST',
  )
  @ApiJobTrackWithReminderResponse(
    201,
    'Annonce et rappel initial créés avec succès',
  )
  @UseGuards(JwtAuthGuard)
  async createJobTrackWithReminder(
    @Body(ValidationPipe) body: CreateJobTrackWithReminderDto,
    @Request() req: AuthenticatedUser,
  ): Promise<JobTrackWithReminderResponseDto> {
    const userId = req.user.sub;
    const result = await this.jobTrackService.createWithReminder(userId, body);
    return {
      ...result.jobTrack,
      reminder: result.reminder,
    };
  }

  @Get()
  @ApiOperation({
    summary: "Récupérer toutes les annonces de candidature de l'utilisateur",
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des annonces de l’utilisateur',
    type: [JobTrackResponseDto],
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getUserJobTracks(@Request() req: AuthenticatedUser) {
    const userId = req.user.sub;
    return this.jobTrackService.findAllByUser(userId);
  }

  @Get('status/:status')
  @ApiOperation({ summary: 'Récupérer les annonces par statut' })
  @ApiParam({
    name: 'status',
    description: 'Filtre par statut d’annonce',
    enum: JobStatus,
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des annonces avec le statut spécifié',
    type: [JobTrackResponseDto],
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getJobTracksByStatus(
    @Param('status') status: JobStatus,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;
    return this.jobTrackService.findByStatus(userId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une annonce spécifique par ID' })
  @ApiParam({ name: 'id', description: 'Identifiant de l’annonce' })
  @ApiResponse({
    status: 200,
    description: 'Détails de l’annonce',
    type: JobTrackResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Annonce introuvable' })
  @ApiResponse({ status: 403, description: 'Accès refusé à cette annonce' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getJobTrackById(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;
    const jobTrack = await this.jobTrackService.findOne(id, userId);
    if (!jobTrack) {
      throw new NotFoundException('Annonce introuvable');
    }
    return jobTrack;
  }

  @Put(':id/with-reminder')
  @ApiOperation({
    summary:
      'Mettre à jour une annonce et son rappel (équivalent du POST with-reminder)',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de l’annonce à mettre à jour',
  })
  @ApiResponse({
    status: 200,
    description: 'Annonce et rappel mis à jour avec succès',
    type: JobTrackWithReminderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Données d’entrée invalides' })
  @ApiResponse({ status: 403, description: 'Accès refusé à cette annonce' })
  @ApiResponse({ status: 404, description: 'Annonce introuvable' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async updateJobTrackWithReminder(
    @Param('id') id: string,
    @Body(ValidationPipe) body: UpdateJobTrackWithReminderDto,
    @Request() req: { user: { sub: string } },
    @Query('upsert') upsert?: string,
  ): Promise<JobTrackWithReminderResponseDto> {
    const userId = req.user.sub;
    const doUpsert = upsert === 'true' || upsert === '1';
    const result = await this.jobTrackService.updateWithReminder(
      id,
      userId,
      body,
      doUpsert,
    );
    return {
      ...result.jobTrack,
      reminder: result.reminder ?? undefined,
    } as JobTrackWithReminderResponseDto;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une annonce de candidature' })
  @ApiParam({ name: 'id', description: 'Identifiant de l’annonce à supprimer' })
  @ApiResponse({
    status: 200,
    description: 'Annonce supprimée avec succès',
    type: JobTrackResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Accès refusé à cette annonce' })
  @ApiResponse({ status: 404, description: 'Annonce introuvable' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async deleteJobTrack(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;
    return this.jobTrackService.remove(id, userId);
  }
}
