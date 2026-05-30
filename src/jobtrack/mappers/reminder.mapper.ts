import { Reminder } from '../interfaces';

export class ReminderMapper {
  /**
   * Map Drizzle Reminder row to Service Reminder
   */
  static mapReminderToReminder(reminderRow: {
    id: string;
    jobTrackId: string;
    frequency: number;
    nextReminderAt: Date;
    lastSentAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Reminder {
    return {
      id: reminderRow.id,
      jobTrackId: reminderRow.jobTrackId,
      frequency: reminderRow.frequency,
      nextReminderAt: reminderRow.nextReminderAt,
      lastSentAt: reminderRow.lastSentAt,
      isActive: reminderRow.isActive,
      createdAt: reminderRow.createdAt,
      updatedAt: reminderRow.updatedAt,
    };
  }
}
