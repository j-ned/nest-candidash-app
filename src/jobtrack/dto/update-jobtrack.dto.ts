import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OFFER_TEXT_MAX } from './create-jobtrack.dto';
import { jobStatusEnum, contractTypeEnum } from '../../db/schema';

export const updateJobTrackSchema = z
  .object({
    id: z.string().optional(),
    title: z
      .string({ message: 'Le titre doit être une chaîne de caractères' })
      .min(1, { message: 'Le titre ne peut pas être vide' })
      .optional(),
    company: z
      .string({
        message: 'Le nom de l’entreprise doit être une chaîne de caractères',
      })
      .optional(),
    jobUrl: z
      .string({
        message: 'L’URL de l’offre doit être une chaîne de caractères',
      })
      .optional(),
    appliedAt: z
      .string()
      .datetime({
        message: 'La date de candidature doit être une date ISO valide',
      })
      .optional(),
    status: z
      .enum(jobStatusEnum.enumValues, {
        message: 'Le statut doit être un statut de candidature valide',
      })
      .optional(),
    contractType: z
      .enum(contractTypeEnum.enumValues, {
        message: 'Le type de contrat doit être un type de contrat valide',
      })
      .optional(),
    notes: z
      .string({ message: 'Les notes doivent être une chaîne de caractères' })
      .optional(),
    offerText: z
      .string({
        message: 'Le texte de l’offre doit être une chaîne de caractères',
      })
      .max(OFFER_TEXT_MAX, {
        message: 'Le texte de l’offre ne peut pas dépasser 20 000 caractères',
      })
      .optional(),
  })
  .strict();

export class UpdateJobTrackDto extends createZodDto(updateJobTrackSchema) {}
