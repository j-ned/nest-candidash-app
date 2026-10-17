import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class TrackVisitDto extends createZodDto(
  z
    .object({
      path: z.string().min(1).max(500),
      referrer: z.string().max(1000).optional(),
    })
    .strict(),
) {}
