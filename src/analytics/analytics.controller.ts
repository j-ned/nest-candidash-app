import { Body, Controller, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { TrackVisitDto } from './dto/track-visit.dto';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('track')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Enregistre une page vue (sans IP ni cookie)' })
  async track(
    @Body() body: TrackVisitDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    await this.analytics.track(body, {
      ip,
      userAgent: userAgent ?? '',
      origin,
    });
  }
}
