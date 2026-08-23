import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createApiTokenSchema = z
  .object({
    nomAffiche: z
      .string({ message: 'Le nom du jeton doit être une chaîne de caractères' })
      .min(1, { message: 'Le nom du jeton ne peut pas être vide' })
      .default('Extension Chrome'),
  })
  .strict();

export class CreateApiTokenDto extends createZodDto(createApiTokenSchema) {}
