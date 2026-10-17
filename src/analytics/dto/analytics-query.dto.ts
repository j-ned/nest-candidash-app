import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ANALYTICS_MAX_DAYS = 90;

export class AnalyticsQueryDto extends createZodDto(
  z
    .object({
      days: z.coerce.number().int().min(1).max(ANALYTICS_MAX_DAYS).default(30),
    })
    .strict(),
) {}
