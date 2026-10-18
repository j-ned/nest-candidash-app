import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class LookupJobTrackQueryDto extends createZodDto(
  z.object({ url: z.string().min(1).max(2000) }).strict(),
) {}
