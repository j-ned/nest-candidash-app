import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { jobTracks } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { Readable } from 'stream';

export type DocumentType = 'cv' | 'lm';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo
const PDF_MAGIC = Buffer.from('%PDF-');

@Injectable()
export class DocumentService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  // Bucket unique Cloudflare R2 (candidash-app) ; CV et LM sont distingués par
  // le préfixe de clé (`<userId>/<jobTrackId>/cv.pdf` vs `.../lm.pdf`).
  private getBucket(): string {
    return this.config.getOrThrow<string>('S3_BUCKET');
  }

  private getS3Key(
    userId: string,
    jobTrackId: string,
    type: DocumentType,
  ): string {
    return `${userId}/${jobTrackId}/${type}.pdf`;
  }

  private getFileNameField(type: DocumentType): 'cvFileName' | 'lmFileName' {
    return type === 'cv' ? 'cvFileName' : 'lmFileName';
  }

  private async verifyOwnership(
    jobTrackId: string,
    userId: string,
  ): Promise<void> {
    const jobTrack = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, jobTrackId),
      columns: { userId: true },
    });

    if (!jobTrack) {
      throw new NotFoundException('Candidature introuvable');
    }

    if (jobTrack.userId !== userId) {
      throw new ForbiddenException(
        "Vous ne pouvez accéder qu'à vos propres candidatures",
      );
    }
  }

  validateFile(file: Express.Multer.File): void {
    // Le type MIME est déclaré par le client : on vérifie aussi la signature.
    const isPdf =
      file.mimetype === 'application/pdf' &&
      file.buffer?.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
    if (!isPdf) {
      throw new BadRequestException('Seuls les fichiers PDF sont acceptés');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Le fichier ne doit pas dépasser 5 Mo');
    }
  }

  async uploadDocument(
    jobTrackId: string,
    userId: string,
    type: DocumentType,
    file: Express.Multer.File,
  ): Promise<{ fileName: string }> {
    this.validateFile(file);
    return this.storeDocument(
      jobTrackId,
      userId,
      type,
      file.buffer,
      file.originalname,
    );
  }

  /** Enregistre un PDF (envoyé ou généré) comme CV ou lettre de la candidature. */
  async storeDocument(
    jobTrackId: string,
    userId: string,
    type: DocumentType,
    content: Buffer,
    fileName: string,
  ): Promise<{ fileName: string }> {
    await this.verifyOwnership(jobTrackId, userId);
    if (content.length > MAX_FILE_SIZE) {
      throw new BadRequestException('Le fichier ne doit pas dépasser 5 Mo');
    }

    const bucket = this.getBucket();
    const key = this.getS3Key(userId, jobTrackId, type);

    await this.storage.putObject(bucket, key, content, 'application/pdf');

    const field = this.getFileNameField(type);
    await this.drizzle.db
      .update(jobTracks)
      .set({ [field]: fileName, updatedAt: new Date() })
      .where(eq(jobTracks.id, jobTrackId));

    return { fileName };
  }

  async downloadDocument(
    jobTrackId: string,
    userId: string,
    type: DocumentType,
  ): Promise<{ stream: Readable; fileName: string; contentType: string }> {
    await this.verifyOwnership(jobTrackId, userId);

    const jobTrack = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, jobTrackId),
      columns: { cvFileName: true, lmFileName: true },
    });

    const fileName =
      type === 'cv' ? jobTrack?.cvFileName : jobTrack?.lmFileName;
    if (!fileName) {
      throw new NotFoundException('Aucun document trouvé');
    }

    const bucket = this.getBucket();
    const key = this.getS3Key(userId, jobTrackId, type);

    const { stream } = await this.storage.getObject(bucket, key);

    return {
      stream,
      fileName,
      contentType: 'application/pdf',
    };
  }

  async deleteDocument(
    jobTrackId: string,
    userId: string,
    type: DocumentType,
  ): Promise<void> {
    await this.verifyOwnership(jobTrackId, userId);

    const jobTrack = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, jobTrackId),
      columns: { cvFileName: true, lmFileName: true },
    });

    const fileName =
      type === 'cv' ? jobTrack?.cvFileName : jobTrack?.lmFileName;
    if (!fileName) {
      throw new NotFoundException('Aucun document trouvé');
    }

    const bucket = this.getBucket();
    const key = this.getS3Key(userId, jobTrackId, type);

    await this.storage.deleteObject(bucket, key);

    await this.drizzle.db
      .update(jobTracks)
      .set({ [this.getFileNameField(type)]: null, updatedAt: new Date() })
      .where(eq(jobTracks.id, jobTrackId));
  }
}
