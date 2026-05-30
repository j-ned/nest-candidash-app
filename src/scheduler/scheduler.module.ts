import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MailModule } from '../mail/mail.module';
import { ReminderAutomationService } from './reminder-automation.service';

/**
 * Module Scheduler
 *
 * FR: Ce module isole les tâches CRON (rappels automatiques) afin que
 * l'automatisation des reminders fonctionne même si le module Reminder
 * (et son contrôleur HTTP) est retiré. Les données restent gérées via
 * JobTrack (création/mise à jour des reminders) et l'envoi automatique
 * continue grâce à ce module.
 */
@Module({
  imports: [ScheduleModule.forRoot(), MailModule],
  providers: [ReminderAutomationService],
})
export class SchedulerModule {}
