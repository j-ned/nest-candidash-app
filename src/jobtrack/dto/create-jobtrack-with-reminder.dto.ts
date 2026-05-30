import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createJobTrackSchema } from './create-jobtrack.dto';

/**
 * DTO de création combinée d'une annonce (JobTrack) avec rappel initial (Reminder).
 *
 * Mutualisation : étend le schéma de CreateJobTrack pour éviter la duplication
 * des champs de l'annonce, puis ajoute les champs du rappel.
 */
export const createJobTrackWithReminderSchema = createJobTrackSchema
  .extend({
    frequency: z
      .number({ message: 'La fréquence doit être un entier' })
      .int({ message: 'La fréquence doit être un entier' })
      .min(1, { message: 'La fréquence doit être d’au moins 1 jour' }),
    nextReminderAt: z.string().datetime({
      message: 'La prochaine date de rappel doit être une date ISO valide',
    }),
    isActive: z
      .boolean({ message: 'Le champ isActive doit être un booléen' })
      .optional(),
  })
  .strict();

export class CreateJobTrackWithReminderDto extends createZodDto(
  createJobTrackWithReminderSchema,
) {}
