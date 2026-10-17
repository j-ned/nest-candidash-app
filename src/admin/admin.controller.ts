import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import type { AdminUser } from './admin-user.interface';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnalyticsQueryDto } from '../analytics/dto/analytics-query.dto';
import type { AnalyticsStats } from '../analytics/analytics-stats.interface';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(['ADMIN'])
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('users')
  @ApiOperation({
    summary: 'Comptes inscrits, avec leur nombre de candidatures',
  })
  listUsers(): Promise<AdminUser[]> {
    return this.adminService.listUsers();
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Fréquentation : visites par jour, pages et sources',
  })
  analyticsStats(@Query() query: AnalyticsQueryDto): Promise<AnalyticsStats> {
    return this.analytics.stats(query.days);
  }
}
