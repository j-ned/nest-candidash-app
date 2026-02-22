import { Module } from '@nestjs/common';
import { JobTrackController } from './jobtrack.controller';
import { JobTrackService } from './jobtrack.service';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [JobTrackController, DocumentController],
  providers: [JobTrackService, DocumentService],
  exports: [JobTrackService],
})
export class JobTrackModule {}
