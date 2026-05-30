import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createJobTrackSchema } from './create-jobtrack.dto';

/**
 * DTO de mise à jour combinée d'une annonce (JobTrack) avec son rappel (Reminder).
 *
 * Mutualisation : part du schéma partiel de CreateJobTrack pour éviter la
 * duplication des champs de l'annonce, puis ajoute les champs du rappel.
 */
export const updateJobTrackWithReminderSchema = createJobTrackSchema
  .partial()
  .extend({
    frequency: z
      .number({ message: 'La fréquence doit être un entier' })
      .int({ message: 'La fréquence doit être un entier' })
      .min(1, { message: 'La fréquence doit être d’au moins 1 jour' })
      .optional(),
    nextReminderAt: z
      .string()
      .datetime({
        message: 'La prochaine date de rappel doit être une date ISO valide',
      })
      .optional(),
    isActive: z
      .boolean({ message: 'Le champ isActive doit être un booléen' })
      .optional(),
  })
  .strict();

export class UpdateJobTrackWithReminderDto extends createZodDto(
  updateJobTrackWithReminderSchema,
) {}
