import { BadRequestException } from '@nestjs/common';
import { DocumentService } from './document.service';
import type { DrizzleService } from '../db/drizzle.service';
import type { StorageService } from '../storage/storage.service';
import type { ConfigService } from '@nestjs/config';

describe('DocumentService.validateFile', () => {
  const service = new DocumentService(
    {} as DrizzleService,
    {} as StorageService,
    {} as ConfigService,
  );

  const file = (mimetype: string, content: string) =>
    ({
      mimetype,
      buffer: Buffer.from(content),
      size: content.length,
    }) as Express.Multer.File;

  it('accepts a real PDF', () => {
    expect(() =>
      service.validateFile(file('application/pdf', '%PDF-1.7\n...')),
    ).not.toThrow();
  });

  it('rejects a file declared as PDF without the PDF signature', () => {
    expect(() =>
      service.validateFile(file('application/pdf', '<html>pas un pdf')),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-PDF MIME type', () => {
    expect(() => service.validateFile(file('text/plain', '%PDF-1.7'))).toThrow(
      BadRequestException,
    );
  });
});

describe('DocumentService.deleteFiles', () => {
  function setup() {
    const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentService(
      {} as DrizzleService,
      storage as unknown as StorageService,
      { getOrThrow: () => 'bucket' } as unknown as ConfigService,
    );
    return { service, storage };
  }

  it('deletes only the stored CV and cover letters', async () => {
    const { service, storage } = setup();

    await service.deleteFiles('u1', [
      { id: 'j1', cvFileName: 'cv.pdf', lmFileName: null },
      { id: 'j2', cvFileName: 'cv.pdf', lmFileName: 'lm.pdf' },
    ]);

    expect(storage.deleteObject.mock.calls).toEqual([
      ['bucket', 'u1/j1/cv.pdf'],
      ['bucket', 'u1/j2/cv.pdf'],
      ['bucket', 'u1/j2/lm.pdf'],
    ]);
  });

  it('never calls the storage when there is no file', async () => {
    const { service, storage } = setup();

    await service.deleteFiles('u1', [
      { id: 'j1', cvFileName: null, lmFileName: null },
    ]);

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
