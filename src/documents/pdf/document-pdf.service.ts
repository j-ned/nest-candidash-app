import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentsService } from '../documents.service';
import {
  DocumentService as JobTrackDocuments,
  type DocumentType,
} from '../../jobtrack/document.service';
import { PdfRenderer } from './pdf-renderer';
import { renderDocumentHtml } from './render-document-html';

export type RenderedPdf = { fileName: string; content: Buffer };
export type AttachedPdf = {
  jobTrackId: string;
  type: DocumentType;
  fileName: string;
};

/** « CV Développeur Angular — Acme » → « cv-developpeur-angular-acme.pdf » */
function toFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return `${slug || 'document'}.pdf`;
}

@Injectable()
export class DocumentPdfService {
  constructor(
    private readonly documents: DocumentsService,
    private readonly renderer: PdfRenderer,
    private readonly jobTrackDocuments: JobTrackDocuments,
  ) {}

  async pdf(id: string, userId: string): Promise<RenderedPdf> {
    const document = await this.documents.get(id, userId);
    return this.render(document);
  }

  /** Le PDF devient le CV (ou la lettre) de la candidature visée, à la place du précédent. */
  async attach(id: string, userId: string): Promise<AttachedPdf> {
    const document = await this.documents.get(id, userId);
    if (!document.jobTrackId) {
      throw new BadRequestException(
        'Ce document n’est rattaché à aucune candidature',
      );
    }
    const { fileName, content } = await this.render(document);
    const type: DocumentType = document.kind === 'CV' ? 'cv' : 'lm';
    await this.jobTrackDocuments.storeDocument(
      document.jobTrackId,
      userId,
      type,
      content,
      fileName,
    );
    return { jobTrackId: document.jobTrackId, type, fileName };
  }

  private async render(document: {
    title: string;
    markdown: string;
  }): Promise<RenderedPdf> {
    const html = renderDocumentHtml(document.title, document.markdown);
    return {
      fileName: toFileName(document.title),
      content: await this.renderer.render(html),
    };
  }
}
