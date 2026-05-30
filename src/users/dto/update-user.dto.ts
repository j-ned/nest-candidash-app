import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { roleEnum } from '../../db/schema';

export class UpdateUserDto extends createZodDto(
  z
    .object({
      id: z.string().optional(),
      email: z
        .string()
        .email({ message: 'Veuillez fournir une adresse e-mail valide' })
        .optional(),
      username: z.string().optional(),
      password: z
        .string()
        .min(6, {
          message: 'Le mot de passe doit contenir au moins 6 caractères',
        })
        .optional(),
      role: z
        .enum(roleEnum.enumValues, { message: 'Le rôle doit être USER ou ADMIN' })
        .optional(),
    })
    .strict(),
) {}
