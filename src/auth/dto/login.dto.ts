import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class LoginDto extends createZodDto(
  z
    .object({
      email: z
        .string()
        .email({ message: 'Veuillez fournir une adresse e-mail valide' }),
      password: z.string().min(6, {
        message: 'Le mot de passe doit contenir au moins 6 caractères',
      }),
    })
    .strict(),
) {}
