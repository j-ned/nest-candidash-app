import { Module } from '@nestjs/common';
import { JobTrackController } from './jobtrack.controller';
import { JobTrackService } from './jobtrack.service';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [JobTrackController, DocumentController],
  providers: [JobTrackService, DocumentService],
  exports: [JobTrackService],
})
export class JobTrackModule {}
