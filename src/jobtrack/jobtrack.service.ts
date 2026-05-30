import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { jobTracks, reminders, JobStatus, ContractType } from '../db/schema';
import { CreateJobTrackDto } from './dto/create-jobtrack.dto';
import { UpdateJobTrackDto } from './dto/update-jobtrack.dto';
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
  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Crée un nouveau suivi de candidature pour un utilisateur
   */
  async create(userId: string, dto: CreateJobTrackDto): Promise<JobTrack> {
    const [row] = await this.drizzle.db
      .insert(jobTracks)
      .values({
        userId,
        title: dto.title,
        company: dto.company,
        jobUrl: dto.jobUrl,
        appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
        status: dto.status ?? 'APPLIED',
        contractType: dto.contractType,
        notes: dto.notes,
      })
      .returning();

    return JobTrackMapper.mapJobTrackToJobTrack(row);
  }

  /**
   * Récupère tous les suivis de candidature d’un utilisateur
   */
  async findAllByUser(userId: string): Promise<JobTrack[]> {
    const rows = await this.drizzle.db.query.jobTracks.findMany({
      where: eq(jobTracks.userId, userId),
      with: { reminders: true },
      orderBy: [desc(jobTracks.createdAt)],
    });
    return rows.map((r) => JobTrackMapper.mapJobTrackToJobTrack(r));
  }

  /**
   * Récupère un suivi de candidature spécifique par son ID
   */
  async findOne(id: string, userId: string): Promise<JobTrack | null> {
    const row = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, id),
      with: { reminders: true },
    });

    if (!row) {
      return null;
    }

    // Vérification de la propriété
    if (row.userId !== userId) {
      throw new ForbiddenException(
        "Vous ne pouvez accéder qu'à vos propres annonces",
      );
    }

    return JobTrackMapper.mapJobTrackToJobTrack(row);
  }

  /**
   * Met à jour un suivi de candidature
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateJobTrackDto,
    upsert = false,
  ): Promise<JobTrack> {
    const existing = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, id),
      columns: { userId: true },
    });

    if (!existing) {
      if (upsert) {
        const [created] = await this.drizzle.db
          .insert(jobTracks)
          .values({
            id,
            userId,
            title: dto.title ?? 'New Job',
            company: dto.company,
            jobUrl: dto.jobUrl,
            appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
            status: dto.status ?? 'APPLIED',
            contractType: dto.contractType,
            notes: dto.notes,
          })
          .returning();
        return JobTrackMapper.mapJobTrackToJobTrack(created);
      }
      throw new NotFoundException('Annonce introuvable');
    }

    // Vérification de la propriété
    if (existing.userId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres annonces',
      );
    }

    const updateData: Partial<{
      title: string;
      company: string | null;
      jobUrl: string | null;
      appliedAt: Date | null;
      status: JobStatus;
      contractType: ContractType | null;
      notes: string | null;
    }> = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.company !== undefined) updateData.company = dto.company;
    if (dto.jobUrl !== undefined) updateData.jobUrl = dto.jobUrl;
    if (dto.appliedAt !== undefined)
      updateData.appliedAt = dto.appliedAt ? new Date(dto.appliedAt) : null;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.contractType !== undefined)
      updateData.contractType = dto.contractType;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const [updated] = await this.drizzle.db
      .update(jobTracks)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(jobTracks.id, id))
      .returning();

    return JobTrackMapper.mapJobTrackToJobTrack(updated);
  }

  /**
   * Supprime un suivi de candidature
   */
  async remove(id: string, userId: string): Promise<JobTrack> {
    const existing = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, id),
      columns: { userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Annonce introuvable');
    }

    // Vérification de la propriété
    if (existing.userId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres annonces',
      );
    }

    const [deleted] = await this.drizzle.db
      .delete(jobTracks)
      .where(eq(jobTracks.id, id))
      .returning();

    return JobTrackMapper.mapJobTrackToJobTrack(deleted);
  }

  /**
   * Crée un suivi de candidature et son rappel initial dans une seule transaction
   */
  async createWithReminder(
    userId: string,
    dto: JobTrackCreateData & ReminderCreateData,
  ): Promise<JobTrackWithReminder> {
    return this.drizzle.db.transaction(async (tx) => {
      const [createdJobTrack] = await tx
        .insert(jobTracks)
        .values({
          userId,
          title: dto.title,
          company: dto.company,
          jobUrl: dto.jobUrl,
          appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
          status: dto.status ?? 'APPLIED',
          contractType: dto.contractType,
          notes: dto.notes,
        })
        .returning();

      const [createdReminder] = await tx
        .insert(reminders)
        .values({
          jobTrackId: createdJobTrack.id,
          frequency: dto.frequency,
          nextReminderAt: new Date(dto.nextReminderAt),
          isActive: dto.isActive ?? true,
        })
        .returning();

      return {
        jobTrack: JobTrackMapper.mapJobTrackToJobTrack(createdJobTrack),
        reminder: ReminderMapper.mapReminderToReminder(createdReminder),
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
    return this.drizzle.db.transaction(async (tx) => {
      const existing = await tx.query.jobTracks.findFirst({
        where: eq(jobTracks.id, id),
      });

      if (!existing) {
        if (!upsert) throw new NotFoundException('Annonce introuvable');

        const [createdJob] = await tx
          .insert(jobTracks)
          .values({
            id,
            userId,
            title: dto.title ?? 'New Job',
            company: dto.company,
            jobUrl: dto.jobUrl,
            appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
            status: dto.status ?? 'APPLIED',
            contractType: dto.contractType,
            notes: dto.notes,
          })
          .returning();

        // Création du rappel si les données sont fournies
        let reminder: Reminder | null = null;
        if (dto.frequency !== undefined && dto.nextReminderAt) {
          const [createdRem] = await tx
            .insert(reminders)
            .values({
              jobTrackId: createdJob.id,
              frequency: dto.frequency,
              nextReminderAt: new Date(dto.nextReminderAt),
              isActive: dto.isActive ?? true,
            })
            .returning();
          reminder = ReminderMapper.mapReminderToReminder(createdRem);
        }

        return {
          jobTrack: JobTrackMapper.mapJobTrackToJobTrack(createdJob),
          reminder,
        };
      }

      if (existing.userId !== userId) {
        throw new ForbiddenException(
          'Vous ne pouvez modifier que vos propres annonces',
        );
      }

      const updateData: Partial<{
        title: string;
        company: string | null;
        jobUrl: string | null;
        appliedAt: Date | null;
        status: JobStatus;
        contractType: ContractType | null;
        notes: string | null;
      }> = {};

      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.company !== undefined) updateData.company = dto.company;
      if (dto.jobUrl !== undefined) updateData.jobUrl = dto.jobUrl;
      if (dto.appliedAt !== undefined)
        updateData.appliedAt = dto.appliedAt ? new Date(dto.appliedAt) : null;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.contractType !== undefined)
        updateData.contractType = dto.contractType;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      const updated = Object.keys(updateData).length
        ? (
            await tx
              .update(jobTracks)
              .set({ ...updateData, updatedAt: new Date() })
              .where(eq(jobTracks.id, id))
              .returning()
          )[0]
        : existing;

      // Désactiver automatiquement le rappel si le statut est terminal
      const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
        'ACCEPTED',
        'REJECTED',
      ]);
      const effectiveStatus = dto.status ?? existing.status;
      const isTerminal = TERMINAL_STATUSES.has(effectiveStatus);

      // Mise à jour ou création du rappel si les champs sont fournis
      let reminderEntity = await tx.query.reminders.findFirst({
        where: eq(reminders.jobTrackId, id),
      });

      // Si statut terminal, forcer la désactivation du rappel
      if (isTerminal && reminderEntity?.isActive) {
        [reminderEntity] = await tx
          .update(reminders)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(reminders.id, reminderEntity.id))
          .returning();
      }

      const hasReminderInput =
        dto.frequency !== undefined ||
        dto.nextReminderAt !== undefined ||
        dto.isActive !== undefined;

      if (hasReminderInput && !isTerminal) {
        if (reminderEntity) {
          const reminderUpdateData: Partial<{
            frequency: number;
            nextReminderAt: Date;
            isActive: boolean;
          }> = {};
          if (dto.frequency !== undefined)
            reminderUpdateData.frequency = dto.frequency;
          if (dto.nextReminderAt !== undefined)
            reminderUpdateData.nextReminderAt = new Date(dto.nextReminderAt);
          if (dto.isActive !== undefined)
            reminderUpdateData.isActive = dto.isActive;

          [reminderEntity] = await tx
            .update(reminders)
            .set({ ...reminderUpdateData, updatedAt: new Date() })
            .where(eq(reminders.id, reminderEntity.id))
            .returning();
        } else if (dto.frequency !== undefined && dto.nextReminderAt) {
          [reminderEntity] = await tx
            .insert(reminders)
            .values({
              jobTrackId: id,
              frequency: dto.frequency,
              nextReminderAt: new Date(dto.nextReminderAt),
              isActive: dto.isActive ?? true,
            })
            .returning();
        }
      }

      return {
        jobTrack: JobTrackMapper.mapJobTrackToJobTrack(updated),
        reminder: reminderEntity
          ? ReminderMapper.mapReminderToReminder(reminderEntity)
          : null,
      };
    });
  }

  /**
   * Récupère tous les suivis de candidature d’un utilisateur selon leur statut
   */
  async findByStatus(userId: string, status: JobStatus): Promise<JobTrack[]> {
    const rows = await this.drizzle.db.query.jobTracks.findMany({
      where: and(eq(jobTracks.userId, userId), eq(jobTracks.status, status)),
      with: { reminders: true },
      orderBy: [desc(jobTracks.createdAt)],
    });
    return rows.map((r) => JobTrackMapper.mapJobTrackToJobTrack(r));
  }
}
