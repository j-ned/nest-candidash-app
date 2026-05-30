import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ForgotPasswordDto extends createZodDto(
  z
    .object({
      email: z
        .string()
        .min(1, { message: "L'e-mail est requis" })
        .email({ message: 'Veuillez fournir une adresse e-mail valide' }),
    })
    .strict(),
) {}
