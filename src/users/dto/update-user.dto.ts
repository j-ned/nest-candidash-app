import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Mise à jour de profil par l'utilisateur lui-même : le champ `role` est
// volontairement absent (un USER ne peut pas s'auto-promouvoir ADMIN).
// Un éventuel changement de rôle devra passer par un endpoint admin dédié.
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
    })
    .strict(),
) {}
