import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const totpToken = z
  .string()
  .length(6)
  .regex(/^\d{6}$/, {
    message: 'Le code TOTP doit contenir exactement 6 chiffres',
  });

export class VerifyTotpSetupDto extends createZodDto(
  z.object({ token: totpToken }).strict(),
) {}

export class ValidateTotpDto extends createZodDto(
  z.object({ tempToken: z.string().min(1), token: totpToken }).strict(),
) {}

export class DisableTotpDto extends createZodDto(
  z.object({ password: z.string().min(1) }).strict(),
) {}

export class TotpRecoveryDto extends createZodDto(
  z
    .object({ tempToken: z.string().min(1), recoveryCode: z.string().min(1) })
    .strict(),
) {}
