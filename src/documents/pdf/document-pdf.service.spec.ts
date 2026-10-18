import { BadRequestException } from '@nestjs/common';
import type { DocumentsService } from '../documents.service';
import type { DocumentService as JobTrackDocuments } from '../../jobtrack/document.service';
import type { PdfRenderer } from './pdf-renderer';
import { DocumentPdfService } from './document-pdf.service';

type Doc = {
  id: string;
  kind: 'CV' | 'LETTER';
  title: string;
  markdown: string;
  jobTrackId: string | null;
};

function setup(doc: Doc) {
  const documents = { get: jest.fn().mockResolvedValue(doc) };
  const renderer = {
    render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
  };
  const jobTrackDocuments = {
    storeDocument: jest.fn().mockResolvedValue({ fileName: 'x' }),
  };
  const service = new DocumentPdfService(
    documents as unknown as DocumentsService,
    renderer as unknown as PdfRenderer,
    jobTrackDocuments as unknown as JobTrackDocuments,
  );
  return { service, documents, renderer, jobTrackDocuments };
}

const CV: Doc = {
  id: 'doc-1',
  kind: 'CV',
  title: 'CV Développeur Angular — Acme',
  markdown: '# Camille',
  jobTrackId: 'job-1',
};

describe('DocumentPdfService', () => {
  it('renders the owned document and names the file after its title', async () => {
    const { service, documents, renderer } = setup(CV);

    const pdf = await service.pdf('doc-1', 'user-1');

    expect(documents.get).toHaveBeenCalledWith('doc-1', 'user-1');
    expect(renderer.render).toHaveBeenCalledWith(
      expect.stringContaining('<h1 class="doc-h1">Camille</h1>'),
    );
    expect(pdf.fileName).toBe('cv-developpeur-angular-acme.pdf');
    expect(pdf.content.toString()).toBe('%PDF-1.7');
  });

  it('falls back to a generic file name', async () => {
    const { service } = setup({ ...CV, title: '***' });

    expect((await service.pdf('doc-1', 'user-1')).fileName).toBe(
      'document.pdf',
    );
  });

  it.each([
    ['CV', 'cv'],
    ['LETTER', 'lm'],
  ] as const)(
    'attaches a %s to its application as the %s file',
    async (kind, type) => {
      const { service, jobTrackDocuments } = setup({ ...CV, kind });

      const attached = await service.attach('doc-1', 'user-1');

      expect(jobTrackDocuments.storeDocument).toHaveBeenCalledWith(
        'job-1',
        'user-1',
        type,
        Buffer.from('%PDF-1.7'),
        'cv-developpeur-angular-acme.pdf',
      );
      expect(attached).toEqual({
        jobTrackId: 'job-1',
        type,
        fileName: 'cv-developpeur-angular-acme.pdf',
      });
    },
  );

  it('refuses to attach a document linked to no application', async () => {
    const { service, renderer } = setup({ ...CV, jobTrackId: null });

    await expect(service.attach('doc-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
