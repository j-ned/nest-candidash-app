import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus, ContractType } from '../generated/prisma/enums.js';
import { CreateJobTrackDto } from './dto/create-jobtrack.dto';
import { UpdateJobTrackDto } from './dto/update-jobtrack.dto';
import type { Prisma } from '../generated/prisma/client.js';
import {
  JobTrack,
  JobTrackCreateData,
  JobTrackUpdateData,
  Reminder,
  ReminderCreateData,
  ReminderUpdateData,
  JobTrackWithReminder,
  JobTrackWithOptionalReminder,
} from './interfaces';
import { JobTrackMapper, ReminderMapper } from './mappers';

@Injectable()
export class JobTrackService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crée un nouveau suivi de candidature pour un utilisateur
   */
  async create(
    userId: string,
    createJobTrackDto: CreateJobTrackDto,
  ): Promise<JobTrack> {
    const prismaJobTrack = await this.prisma.jobTrack.create({
      data: {
        userId,
        title: createJobTrackDto.title,
        company: createJobTrackDto.company,
        jobUrl: createJobTrackDto.jobUrl,
        appliedAt: createJobTrackDto.appliedAt
          ? new Date(createJobTrackDto.appliedAt)
          : undefined,
        status: createJobTrackDto.status || 'APPLIED',
        contractType: createJobTrackDto.contractType,
        notes: createJobTrackDto.notes,
      },
    });

    return JobTrackMapper.mapPrismaJobTrackToJobTrack(prismaJobTrack);
  }

  /**
   * Récupère tous les suivis de candidature d’un utilisateur
   */
  async findAllByUser(userId: string): Promise<JobTrack[]> {
    const prismaJobTracks = await this.prisma.jobTrack.findMany({
      where: { userId },
      include: { reminders: true },
      orderBy: { createdAt: 'desc' },
    });

    return prismaJobTracks.map((jobTrack) =>
      JobTrackMapper.mapPrismaJobTrackToJobTrack(jobTrack),
    );
  }

  /**
   * Récupère un suivi de candidature spécifique par son ID
   */
  async findOne(id: string, userId: string): Promise<JobTrack | null> {
    const prismaJobTrack = await this.prisma.jobTrack.findUnique({
      where: { id },
      include: { reminders: true },
    });

    if (!prismaJobTrack) {
      return null;
    }

    // Vérification de la propriété
    if (prismaJobTrack.userId !== userId) {
      throw new ForbiddenException(
        "Vous ne pouvez accéder qu'à vos propres annonces",
      );
    }

    return JobTrackMapper.mapPrismaJobTrackToJobTrack(prismaJobTrack);
  }

  /**
   * Met à jour un suivi de candidature
   */
  async update(
    id: string,
    userId: string,
    updateJobTrackDto: UpdateJobTrackDto,
    upsert = false,
  ): Promise<JobTrack> {
    const existingJobTrack = await this.prisma.jobTrack.findUnique({
      where: { id },
    });

    if (!existingJobTrack) {
      if (upsert) {
        const prismaJobTrackCreate = await this.prisma.jobTrack.create({
          data: {
            id,
            userId,
            title: updateJobTrackDto.title ?? 'New Job',
            company: updateJobTrackDto.company,
            jobUrl: updateJobTrackDto.jobUrl,
            appliedAt:
              updateJobTrackDto.appliedAt !== undefined &&
              updateJobTrackDto.appliedAt
                ? new Date(updateJobTrackDto.appliedAt)
                : undefined,
            status: updateJobTrackDto.status ?? 'APPLIED',
            contractType: updateJobTrackDto.contractType,
            notes: updateJobTrackDto.notes,
          },
        });
        return JobTrackMapper.mapPrismaJobTrackToJobTrack(prismaJobTrackCreate);
      }
      throw new NotFoundException('Annonce introuvable');
    }

    // Vérification de la propriété
    if (existingJobTrack.userId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres annonces',
      );
    }

    const updateData: Partial<{
      title: string;
      company: string;
      jobUrl: string;
      appliedAt: Date;
      status: JobStatus;
      contractType: ContractType;
      notes: string;
    }> = {};

    if (updateJobTrackDto.title !== undefined)
      updateData.title = updateJobTrackDto.title;
    if (updateJobTrackDto.company !== undefined)
      updateData.company = updateJobTrackDto.company;
    if (updateJobTrackDto.jobUrl !== undefined)
      updateData.jobUrl = updateJobTrackDto.jobUrl;
    if (updateJobTrackDto.appliedAt !== undefined)
      updateData.appliedAt = updateJobTrackDto.appliedAt
        ? new Date(updateJobTrackDto.appliedAt)
        : undefined;
    if (updateJobTrackDto.status !== undefined)
      updateData.status = updateJobTrackDto.status;
    if (updateJobTrackDto.contractType !== undefined)
      updateData.contractType = updateJobTrackDto.contractType;
    if (updateJobTrackDto.notes !== undefined)
      updateData.notes = updateJobTrackDto.notes;

    const prismaJobTrack = await this.prisma.jobTrack.update({
      where: { id },
      data: updateData,
    });

    return JobTrackMapper.mapPrismaJobTrackToJobTrack(prismaJobTrack);
  }

  /**
   * Supprime un suivi de candidature
   */
  async remove(id: string, userId: string): Promise<JobTrack> {
    const existingJobTrack = await this.prisma.jobTrack.findUnique({
      where: { id },
    });

    if (!existingJobTrack) {
      throw new NotFoundException('Annonce introuvable');
    }

    // Vérification de la propriété
    if (existingJobTrack.userId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres annonces',
      );
    }

    const prismaJobTrack = await this.prisma.jobTrack.delete({
      where: { id },
    });

    return JobTrackMapper.mapPrismaJobTrackToJobTrack(prismaJobTrack);
  }

  /**
   * Crée un suivi de candidature et son rappel initial dans une seule transaction
   */
  async createWithReminder(
    userId: string,
    dto: JobTrackCreateData & ReminderCreateData,
  ): Promise<JobTrackWithReminder> {
    return this.prisma.$transaction(async (tx) => {
      const createdJobTrack = await tx.jobTrack.create({
        data: {
          userId,
          title: dto.title,
          company: dto.company,
          jobUrl: dto.jobUrl,
          appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
          status: dto.status || 'APPLIED',
          contractType: dto.contractType,
          notes: dto.notes,
        },
      });

      const createdReminder = await tx.reminder.create({
        data: {
          jobTrackId: createdJobTrack.id,
          frequency: dto.frequency,
          nextReminderAt: new Date(dto.nextReminderAt),
          isActive: dto.isActive ?? true,
        },
      });

      return {
        jobTrack: JobTrackMapper.mapPrismaJobTrackToJobTrack(createdJobTrack),
        reminder: ReminderMapper.mapPrismaReminderToReminder(createdReminder),
      };
    });
  }

  /**
   * Met à jour un suivi de candidature et son rappel en un seul appel (upsert optionnel)
   */
  async updateWithReminder(
    id: string,
    userId: string,
    dto: JobTrackUpdateData & ReminderUpdateData,
    upsert = false,
  ): Promise<JobTrackWithOptionalReminder> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.jobTrack.findUnique({ where: { id } });

      if (!existing) {
        if (!upsert) throw new NotFoundException('Annonce introuvable');

        const createdJob = await tx.jobTrack.create({
          data: {
            id,
            userId,
            title: dto.title ?? 'New Job',
            company: dto.company,
            jobUrl: dto.jobUrl,
            appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
            status: dto.status ?? 'APPLIED',
            contractType: dto.contractType,
            notes: dto.notes,
          },
        });

        // Création du rappel si les données sont fournies
        let reminder: Reminder | null = null;
        if (dto.frequency !== undefined && dto.nextReminderAt) {
          const createdRem = await tx.reminder.create({
            data: {
              jobTrackId: createdJob.id,
              frequency: dto.frequency,
              nextReminderAt: new Date(dto.nextReminderAt),
              isActive: dto.isActive ?? true,
            },
          });
          reminder = ReminderMapper.mapPrismaReminderToReminder(createdRem);
        }

        return {
          jobTrack: JobTrackMapper.mapPrismaJobTrackToJobTrack(createdJob),
          reminder,
        };
      }

      if (existing.userId !== userId) {
        throw new ForbiddenException(
          'Vous ne pouvez modifier que vos propres annonces',
        );
      }

      const updateData: Prisma.JobTrackUpdateInput = {};

      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.company !== undefined) updateData.company = dto.company;
      if (dto.jobUrl !== undefined) updateData.jobUrl = dto.jobUrl;
      if (dto.appliedAt !== undefined)
        updateData.appliedAt = dto.appliedAt
          ? new Date(dto.appliedAt)
          : undefined;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.contractType !== undefined)
        updateData.contractType = dto.contractType;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      const updated = Object.keys(updateData).length
        ? await tx.jobTrack.update({ where: { id }, data: updateData })
        : existing;

      // Mise à jour ou création du rappel si les champs sont fournis
      let reminderEntity = await tx.reminder.findFirst({
        where: { jobTrackId: id },
      });
      const hasReminderInput =
        dto.frequency !== undefined ||
        dto.nextReminderAt !== undefined ||
        dto.isActive !== undefined;

      if (hasReminderInput) {
        if (reminderEntity) {
          const reminderUpdateData: {
            frequency?: number;
            nextReminderAt?: Date;
            isActive?: boolean;
          } = {};
          if (dto.frequency !== undefined)
            reminderUpdateData.frequency = dto.frequency;
          if (dto.nextReminderAt !== undefined)
            reminderUpdateData.nextReminderAt = dto.nextReminderAt
              ? new Date(dto.nextReminderAt)
              : undefined;
          if (dto.isActive !== undefined)
            reminderUpdateData.isActive = dto.isActive;

          reminderEntity = await tx.reminder.update({
            where: { id: reminderEntity.id },
            data: reminderUpdateData,
          });
        } else if (dto.frequency !== undefined && dto.nextReminderAt) {
          reminderEntity = await tx.reminder.create({
            data: {
              jobTrackId: id,
              frequency: dto.frequency,
              nextReminderAt: new Date(dto.nextReminderAt),
              isActive: dto.isActive ?? true,
            },
          });
        }
      }

      return {
        jobTrack: JobTrackMapper.mapPrismaJobTrackToJobTrack(updated),
        reminder: reminderEntity
          ? ReminderMapper.mapPrismaReminderToReminder(reminderEntity)
          : null,
      };
    });
  }

  /**
   * Récupère tous les suivis de candidature d’un utilisateur selon leur statut
   */
  async findByStatus(userId: string, status: JobStatus): Promise<JobTrack[]> {
    const prismaJobTracks = await this.prisma.jobTrack.findMany({
      where: { userId, status },
      include: { reminders: true },
      orderBy: { createdAt: 'desc' },
    });

    return prismaJobTracks.map((jobTrack) =>
      JobTrackMapper.mapPrismaJobTrackToJobTrack(jobTrack),
    );
  }
}
