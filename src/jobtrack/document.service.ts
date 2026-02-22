import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Readable } from 'stream';

export type DocumentType = 'cv' | 'lm';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private getBucket(type: DocumentType): string {
    return type === 'cv'
      ? this.config.getOrThrow<string>('S3_BUCKET_CV')
      : this.config.getOrThrow<string>('S3_BUCKET_LM');
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
    const jobTrack = await this.prisma.jobTrack.findUnique({
      where: { id: jobTrackId },
      select: { userId: true },
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
    if (file.mimetype !== 'application/pdf') {
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
    await this.verifyOwnership(jobTrackId, userId);
    this.validateFile(file);

    const bucket = this.getBucket(type);
    const key = this.getS3Key(userId, jobTrackId, type);

    await this.storage.putObject(bucket, key, file.buffer, file.mimetype);

    const field = this.getFileNameField(type);
    await this.prisma.jobTrack.update({
      where: { id: jobTrackId },
      data: { [field]: file.originalname },
    });

    return { fileName: file.originalname };
  }

  async downloadDocument(
    jobTrackId: string,
    userId: string,
    type: DocumentType,
  ): Promise<{ stream: Readable; fileName: string; contentType: string }> {
    await this.verifyOwnership(jobTrackId, userId);

    const jobTrack = await this.prisma.jobTrack.findUnique({
      where: { id: jobTrackId },
      select: { cvFileName: true, lmFileName: true },
    });

    const fileName =
      type === 'cv' ? jobTrack?.cvFileName : jobTrack?.lmFileName;
    if (!fileName) {
      throw new NotFoundException('Aucun document trouvé');
    }

    const bucket = this.getBucket(type);
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

    const jobTrack = await this.prisma.jobTrack.findUnique({
      where: { id: jobTrackId },
      select: { cvFileName: true, lmFileName: true },
    });

    const fileName =
      type === 'cv' ? jobTrack?.cvFileName : jobTrack?.lmFileName;
    if (!fileName) {
      throw new NotFoundException('Aucun document trouvé');
    }

    const bucket = this.getBucket(type);
    const key = this.getS3Key(userId, jobTrackId, type);

    await this.storage.deleteObject(bucket, key);

    await this.prisma.jobTrack.update({
      where: { id: jobTrackId },
      data: { [this.getFileNameField(type)]: null },
    });
  }
}
