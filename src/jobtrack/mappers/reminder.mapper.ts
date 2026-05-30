import { Reminder } from '../interfaces';

export class ReminderMapper {
  /**
   * Map Drizzle Reminder row to Service Reminder
   */
  static mapReminderToReminder(prismaReminder: {
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
      id: prismaReminder.id,
      jobTrackId: prismaReminder.jobTrackId,
      frequency: prismaReminder.frequency,
      nextReminderAt: prismaReminder.nextReminderAt,
      lastSentAt: prismaReminder.lastSentAt,
      isActive: prismaReminder.isActive,
      createdAt: prismaReminder.createdAt,
      updatedAt: prismaReminder.updatedAt,
    };
  }
}
