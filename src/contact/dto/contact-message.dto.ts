import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const contactMessageSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { message: 'Le nom doit contenir au moins 2 caractères' })
      .max(100, { message: 'Le nom ne peut pas dépasser 100 caractères' }),
    email: z.string().trim().email({ message: 'Email invalide' }).max(254),
    subject: z
      .string()
      .trim()
      .min(3, { message: 'Le sujet doit contenir au moins 3 caractères' })
      .max(150, { message: 'Le sujet ne peut pas dépasser 150 caractères' }),
    message: z
      .string()
      .trim()
      .min(10, { message: 'Le message doit contenir au moins 10 caractères' })
      .max(5000, {
        message: 'Le message ne peut pas dépasser 5000 caractères',
      }),
    // Honeypot: hidden from humans, filled by bots
    website: z.string().max(200).optional(),
  })
  .strict();

export class ContactMessageDto extends createZodDto(contactMessageSchema) {}
