import {
  JobTrack as PrismaJobTrack,
  Reminder as PrismaReminder,
} from '../../generated/prisma/client.js';
import { JobTrack } from '../interfaces';
import { ReminderMapper } from './reminder.mapper';

type PrismaJobTrackWithReminders = PrismaJobTrack & {
  reminders?: PrismaReminder[];
};

export class JobTrackMapper {
  /**
   * Map Prisma JobTrack to Service JobTrack
   */
  static mapPrismaJobTrackToJobTrack(
    prismaJobTrack: PrismaJobTrackWithReminders,
  ): JobTrack {
    const reminder = prismaJobTrack.reminders?.[0] ?? null;

    return {
      id: prismaJobTrack.id,
      userId: prismaJobTrack.userId,
      title: prismaJobTrack.title,
      company: prismaJobTrack.company ?? undefined,
      jobUrl: prismaJobTrack.jobUrl ?? undefined,
      appliedAt: prismaJobTrack.appliedAt ?? undefined,
      status: prismaJobTrack.status,
      contractType: prismaJobTrack.contractType ?? undefined,
      notes: prismaJobTrack.notes ?? undefined,
      cvFileName: prismaJobTrack.cvFileName ?? undefined,
      lmFileName: prismaJobTrack.lmFileName ?? undefined,
      reminder: reminder
        ? ReminderMapper.mapPrismaReminderToReminder(reminder)
        : null,
      createdAt: prismaJobTrack.createdAt,
      updatedAt: prismaJobTrack.updatedAt,
    };
  }
}
