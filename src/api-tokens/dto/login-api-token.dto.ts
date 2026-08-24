import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const loginApiTokenSchema = z
  .object({
    email: z.string().email({ message: 'Email invalide' }),
    password: z.string().min(1, { message: 'Le mot de passe est requis' }),
    nomAffiche: z
      .string({ message: 'Le nom du jeton doit être une chaîne de caractères' })
      .min(1, { message: 'Le nom du jeton ne peut pas être vide' })
      .default('Extension Chrome'),
  })
  .strict();

export class LoginApiTokenDto extends createZodDto(loginApiTokenSchema) {}
