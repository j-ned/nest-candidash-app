import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
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
    return this.prisma.reminder.findMany({
      where: {
        isActive: true,
        nextReminderAt: { lte: now },
        jobtrack: {
          status: { notIn: ['ACCEPTED', 'REJECTED'] },
        },
      },
      include: {
        jobtrack: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: { nextReminderAt: 'asc' },
      take: 100,
    });
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
    await this.prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        lastSentAt: new Date(),
        nextReminderAt: next,
        updatedAt: new Date(),
      },
    });
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
