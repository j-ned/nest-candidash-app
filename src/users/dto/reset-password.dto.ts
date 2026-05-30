import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ResetPasswordDto extends createZodDto(
  z
    .object({
      token: z
        .string({ message: 'Le token doit être une chaîne de caractères' })
        .min(1, { message: 'Le token est requis' }),
      newPassword: z
        .string({ message: 'Le mot de passe doit être une chaîne de caractères' })
        .min(8, {
          message: 'Le mot de passe doit contenir au moins 8 caractères',
        })
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
          {
            message:
              'Le mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial',
          },
        ),
    })
    .strict(),
) {}
