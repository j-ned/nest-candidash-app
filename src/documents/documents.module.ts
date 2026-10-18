import { Module } from '@nestjs/common';
import { JobTrackModule } from '../jobtrack/jobtrack.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentPdfService } from './pdf/document-pdf.service';
import { PdfRenderer } from './pdf/pdf-renderer';

@Module({
  imports: [JobTrackModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, PdfRenderer, DocumentPdfService],
})
export class DocumentsModule {}
