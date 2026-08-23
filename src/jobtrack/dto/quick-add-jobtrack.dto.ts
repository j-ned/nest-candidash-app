import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const quickAddJobTrackSchema = z
  .object({
    title: z
      .string({ message: 'Le titre doit être une chaîne de caractères' })
      .min(1, { message: 'Le titre ne peut pas être vide' }),
    company: z
      .string({
        message: 'Le nom de l\'entreprise doit être une chaîne de caractères',
      })
      .optional(),
    jobUrl: z
      .string({ message: 'L\'URL de l\'offre doit être une chaîne de caractères' })
      .optional(),
    notes: z
      .string({ message: 'Les notes doivent être une chaîne de caractères' })
      .optional(),
  })
  .strict();

export class QuickAddJobTrackDto extends createZodDto(quickAddJobTrackSchema) {}
