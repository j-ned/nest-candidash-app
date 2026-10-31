import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Inscription publique : le champ `role` est volontairement absent (sinon
// n'importe qui pourrait créer un compte ADMIN). Tout compte naît USER.
export class CreateUserDto extends createZodDto(
  z
    .object({
      email: z
        .string()
        .email({ message: 'Veuillez fournir une adresse e-mail valide' }),
      username: z.string().optional(),
      password: z.string().min(6, {
        message: 'Le mot de passe doit contenir au moins 6 caractères',
      }),
    })
    .strict(),
) {}
