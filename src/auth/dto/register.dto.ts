import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  .regex(/(?=.*[A-Z])/, {
    message: 'Le mot de passe doit contenir au moins une majuscule',
  })
  .regex(/(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins un chiffre',
  })
  .regex(/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message: 'Le mot de passe doit contenir au moins un caractère spécial',
  });

const usernameSchema = z
  .string()
  .min(3, {
    message: "Le nom d'utilisateur doit contenir au moins 3 caractères",
  })
  .regex(/^[a-zA-Z0-9_]+$/, {
    message:
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscores",
  });

export class RegisterDto extends createZodDto(
  z
    .object({
      email: z.string().email({ message: 'Email invalide' }),
      password: passwordSchema,
      username: usernameSchema.optional(),
    })
    .strict(),
) {}

export class VerifyRegistrationDto extends createZodDto(
  z
    .object({
      email: z.string().email({ message: 'Email invalide' }),
      verificationCode: z.string().regex(/^\d{6}$/, {
        message: 'Le code de validation doit être composé de 6 chiffres',
      }),
    })
    .strict(),
) {}

export class ResendVerificationCodeDto extends createZodDto(
  z.object({ email: z.string().email({ message: 'Email invalide' }) }).strict(),
) {}
