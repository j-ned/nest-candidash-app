import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class RefreshTokenDto extends createZodDto(
  z
    .object({
      refresh_token: z
        .string({
          message:
            'Le jeton de renouvellement doit être une chaîne de caractères',
        })
        .min(1, {
          message: 'Le jeton de renouvellement ne peut pas être vide',
        }),
    })
    .strict(),
) {}
