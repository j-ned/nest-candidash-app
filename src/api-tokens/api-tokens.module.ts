import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiTokensController } from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';

@Module({
  imports: [AuthModule],
  controllers: [ApiTokensController],
  providers: [ApiTokensService],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
