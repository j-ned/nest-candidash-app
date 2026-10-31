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
