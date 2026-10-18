import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { documents, jobTracks, type DocumentRow } from '../db/schema';
import type {
  CreateDocumentDto,
  DuplicateDocumentDto,
  UpdateDocumentDto,
} from './dto/document.dto';

export type DocumentSummary = Omit<DocumentRow, 'markdown' | 'userId'>;
export type DocumentDetail = Omit<DocumentRow, 'userId'>;

const NOT_FOUND = 'Document introuvable';

function toSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    template: row.template,
    baseDocumentId: row.baseDocumentId,
    jobTrackId: row.jobTrackId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDetail(row: DocumentRow): DocumentDetail {
  return { ...toSummary(row), markdown: row.markdown };
}

@Injectable()
export class DocumentsService {
  constructor(private readonly drizzle: DrizzleService) {}

  /** Liste sans le contenu, du plus récemment modifié au plus ancien. */
  async list(userId: string): Promise<DocumentSummary[]> {
    const rows = await this.drizzle.db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.updatedAt));
    return rows.map(
      ({ markdown: _markdown, userId: _userId, ...summary }) => summary,
    );
  }

  async get(id: string, userId: string): Promise<DocumentDetail> {
    return toDetail(await this.owned(id, userId));
  }

  async create(
    userId: string,
    dto: CreateDocumentDto,
  ): Promise<DocumentDetail> {
    if (dto.jobTrackId) await this.assertOwnJobTrack(dto.jobTrackId, userId);
    const [row] = await this.drizzle.db
      .insert(documents)
      .values({
        userId,
        kind: dto.kind,
        title: dto.title,
        markdown: dto.markdown ?? '',
        jobTrackId: dto.jobTrackId ?? null,
      })
      .returning();
    return toDetail(row);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateDocumentDto,
  ): Promise<DocumentDetail> {
    await this.owned(id, userId);
    if (dto.jobTrackId) await this.assertOwnJobTrack(dto.jobTrackId, userId);
    const [row] = await this.drizzle.db
      .update(documents)
      .set({
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.markdown !== undefined && { markdown: dto.markdown }),
        ...(dto.jobTrackId !== undefined && { jobTrackId: dto.jobTrackId }),
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return toDetail(row);
  }

  /** Copie indépendante, rattachée à son document de base (et éventuellement à une candidature). */
  async duplicate(
    id: string,
    userId: string,
    dto: DuplicateDocumentDto,
  ): Promise<DocumentDetail> {
    const base = await this.owned(id, userId);
    if (dto.jobTrackId) await this.assertOwnJobTrack(dto.jobTrackId, userId);
    const [row] = await this.drizzle.db
      .insert(documents)
      .values({
        userId,
        kind: base.kind,
        title: dto.title ?? `${base.title} (copie)`,
        markdown: base.markdown,
        template: base.template,
        baseDocumentId: base.id,
        jobTrackId: dto.jobTrackId ?? null,
      })
      .returning();
    return toDetail(row);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.owned(id, userId);
    await this.drizzle.db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  // 404 et non 403 : l'existence du document d'un autre utilisateur ne doit pas se deviner
  private async owned(id: string, userId: string): Promise<DocumentRow> {
    const row = await this.drizzle.db.query.documents.findFirst({
      where: and(eq(documents.id, id), eq(documents.userId, userId)),
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private async assertOwnJobTrack(
    jobTrackId: string,
    userId: string,
  ): Promise<void> {
    const job = await this.drizzle.db.query.jobTracks.findFirst({
      columns: { id: true },
      where: and(eq(jobTracks.id, jobTrackId), eq(jobTracks.userId, userId)),
    });
    if (!job) throw new NotFoundException('Candidature introuvable');
  }
}
