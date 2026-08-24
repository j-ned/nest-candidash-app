import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { totpToken } from '../../auth/dto/totp.dto';

export const login2faApiTokenSchema = z
  .object({
    tempToken: z.string().min(1),
    token: totpToken,
    nomAffiche: z
      .string({ message: 'Le nom du jeton doit être une chaîne de caractères' })
      .min(1, { message: 'Le nom du jeton ne peut pas être vide' })
      .default('Extension Chrome'),
  })
  .strict();

export class Login2faApiTokenDto extends createZodDto(login2faApiTokenSchema) {}
