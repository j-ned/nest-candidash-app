import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lte, asc, notInArray } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { reminders, jobTracks, users } from '../db/schema';
import { MailService, ReminderEmailData } from '../mail/mail.service';

/**
 * FR: Service d'automatisation des rappels (CRON)
 *
 * Ce service est désormais hébergé dans le module Scheduler afin de permettre
 * la suppression complète du dossier `src/reminder` sans impacter le CRON ni
 * les CRUD JobTrack.
 */
@Injectable()
export class ReminderAutomationService {
  private readonly logger = new Logger(ReminderAutomationService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Tâche CRON qui s'exécute toutes les heures pour vérifier les rappels à envoyer
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkAndSendReminders(): Promise<void> {
    this.logger.log('Début de la vérification des rappels automatiques');
    try {
      const dueReminders = await this.findDueReminders();
      this.logger.log(`${dueReminders.length} rappel(s) à envoyer trouvé(s)`);
      if (dueReminders.length === 0) {
        return;
      }
      const results = await Promise.allSettled(
        dueReminders.map((reminder) => this.processReminder(reminder)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `Vérification terminée: ${results.length - failed} succès, ${failed} échecs`,
      );
    } catch (error) {
      this.logger.error(
        'Erreur lors de la vérification des rappels:',
        error as Error,
      );
    }
  }

  /**
   * Méthode publique pour exécuter manuellement la vérification des rappels
   */
  async executeReminderCheck(): Promise<{
    processed: number;
    successful: number;
    failed: number;
  }> {
    this.logger.log('Exécution manuelle de la vérification des rappels');
    let processed = 0;
    let successful = 0;
    let failed = 0;
    try {
      const dueReminders = await this.findDueReminders();
      processed = dueReminders.length;
      this.logger.log(`${processed} rappel(s) à traiter`);
      const results = await Promise.allSettled(
        dueReminders.map((reminder) => this.processReminder(reminder)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          successful++;
        } else {
          failed++;
        }
      }
      this.logger.log(
        `Traitement terminé: ${successful} succès, ${failed} échecs sur ${processed} rappels`,
      );
    } catch (error) {
      this.logger.error("Erreur lors de l'exécution manuelle:", error as Error);
      failed = processed - successful;
    }
    return { processed, successful, failed };
  }

  private async findDueReminders(): Promise<ReminderWithJobTrackAndUser[]> {
    const now = new Date();
    // Le filtre porte sur une colonne de la table liée (jobtrack.status),
    // donc on utilise le query builder avec jointures.
    const rows = await this.drizzle.db
      .select({
        id: reminders.id,
        jobTrackId: reminders.jobTrackId,
        frequency: reminders.frequency,
        nextReminderAt: reminders.nextReminderAt,
        lastSentAt: reminders.lastSentAt,
        isActive: reminders.isActive,
        createdAt: reminders.createdAt,
        updatedAt: reminders.updatedAt,
        jt_id: jobTracks.id,
        jt_userId: jobTracks.userId,
        jt_title: jobTracks.title,
        jt_company: jobTracks.company,
        jt_jobUrl: jobTracks.jobUrl,
        jt_appliedAt: jobTracks.appliedAt,
        jt_status: jobTracks.status,
        jt_notes: jobTracks.notes,
        jt_createdAt: jobTracks.createdAt,
        jt_updatedAt: jobTracks.updatedAt,
        u_id: users.id,
        u_email: users.email,
        u_username: users.username,
      })
      .from(reminders)
      .innerJoin(jobTracks, eq(reminders.jobTrackId, jobTracks.id))
      .innerJoin(users, eq(jobTracks.userId, users.id))
      .where(
        and(
          eq(reminders.isActive, true),
          lte(reminders.nextReminderAt, now),
          notInArray(jobTracks.status, ['ACCEPTED', 'REJECTED']),
        ),
      )
      .orderBy(asc(reminders.nextReminderAt))
      .limit(100);

    return rows.map((r) => ({
      id: r.id,
      jobTrackId: r.jobTrackId,
      frequency: r.frequency,
      nextReminderAt: r.nextReminderAt,
      lastSentAt: r.lastSentAt,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      jobtrack: {
        id: r.jt_id,
        userId: r.jt_userId,
        title: r.jt_title,
        company: r.jt_company,
        jobUrl: r.jt_jobUrl,
        appliedAt: r.jt_appliedAt,
        status: r.jt_status,
        notes: r.jt_notes,
        createdAt: r.jt_createdAt,
        updatedAt: r.jt_updatedAt,
        user: { id: r.u_id, email: r.u_email, username: r.u_username },
      },
    }));
  }

  private async processReminder(
    reminder: ReminderWithJobTrackAndUser,
  ): Promise<boolean> {
    try {
      const templateData: ReminderEmailData = this.buildEmailData(reminder);
      await this.mailService.sendReminderEmail(templateData);
      await this.rescheduleReminder(reminder);
      return true;
    } catch (err) {
      this.logger.error(`Echec d'envoi du rappel ${reminder.id}`, err as Error);
      return false;
    }
  }

  private buildEmailData(reminder: {
    id: string;
    jobTrackId: string;
    frequency: number;
    nextReminderAt: Date;
    lastSentAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    jobtrack: {
      title: string;
      company: string | null;
      jobUrl: string | null;
      appliedAt: Date | null;
      user: { email: string; username: string | null };
    };
  }): ReminderEmailData {
    const userName = reminder.jobtrack.user.username || '';
    return {
      userEmail: reminder.jobtrack.user.email,
      userName,
      jobTitle: reminder.jobtrack.title,
      company: reminder.jobtrack.company ?? '',
      appliedAt: reminder.jobtrack.appliedAt ?? undefined,
      jobUrl: reminder.jobtrack.jobUrl ?? undefined,
    };
  }

  private async rescheduleReminder(reminder: {
    id: string;
    frequency: number;
  }): Promise<void> {
    const next = new Date();
    next.setDate(next.getDate() + reminder.frequency);
    await this.drizzle.db
      .update(reminders)
      .set({
        lastSentAt: new Date(),
        nextReminderAt: next,
        updatedAt: new Date(),
      })
      .where(eq(reminders.id, reminder.id));
  }
}

// Type helper pour les données de rappel avec les relations incluses
type ReminderWithJobTrackAndUser = {
  id: string;
  jobTrackId: string;
  frequency: number;
  nextReminderAt: Date;
  lastSentAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  jobtrack: {
    id: string;
    userId: string;
    title: string;
    company: string | null;
    jobUrl: string | null;
    appliedAt: Date | null;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: string;
      email: string;
      username: string | null;
    };
  };
};
