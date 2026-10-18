import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DOCUMENT_MARKDOWN_MAX = 50_000;

const title = z
  .string()
  .trim()
  .min(1, { message: 'Le titre est requis' })
  .max(120, { message: 'Le titre ne peut pas dépasser 120 caractères' });
const markdown = z.string().max(DOCUMENT_MARKDOWN_MAX, {
  message: 'Le document dépasse 50 000 caractères',
});

export class CreateDocumentDto extends createZodDto(
  z
    .object({
      kind: z.enum(['CV', 'LETTER'], {
        message: 'Le type doit être CV ou LETTER',
      }),
      title,
      markdown: markdown.optional(),
      jobTrackId: z.string().min(1).optional(),
    })
    .strict(),
) {}

export class UpdateDocumentDto extends createZodDto(
  z
    .object({
      title: title.optional(),
      markdown: markdown.optional(),
      jobTrackId: z.string().min(1).nullable().optional(),
    })
    .strict(),
) {}

export class DuplicateDocumentDto extends createZodDto(
  z
    .object({
      title: title.optional(),
      jobTrackId: z.string().min(1).optional(),
    })
    .strict(),
) {}
