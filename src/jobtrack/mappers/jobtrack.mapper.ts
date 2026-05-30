import { JobTrackRow, ReminderRow } from '../../db/schema';
import { JobTrack } from '../interfaces';
import { ReminderMapper } from './reminder.mapper';

type JobTrackRowWithReminders = JobTrackRow & {
  reminders?: ReminderRow[];
};

export class JobTrackMapper {
  /**
   * Map Drizzle JobTrack row to Service JobTrack
   */
  static mapJobTrackToJobTrack(row: JobTrackRowWithReminders): JobTrack {
    const reminder = row.reminders?.[0] ?? null;

    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      company: row.company ?? undefined,
      jobUrl: row.jobUrl ?? undefined,
      appliedAt: row.appliedAt ?? undefined,
      status: row.status,
      contractType: row.contractType ?? undefined,
      notes: row.notes ?? undefined,
      cvFileName: row.cvFileName ?? undefined,
      lmFileName: row.lmFileName ?? undefined,
      reminder: reminder
        ? ReminderMapper.mapReminderToReminder(reminder)
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
