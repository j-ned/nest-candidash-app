import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';

describe('AdminController', () => {
  let app: INestApplication<App>;
  const adminService = { listUsers: jest.fn() };
  const analytics = { stats: jest.fn().mockResolvedValue({ days: 7 }) };
  let allowed = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: AnalyticsService, useValue: analytics },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => allowed })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());

  it('lists the registered users for an admin', async () => {
    allowed = true;
    const users = [
      {
        id: 'u1',
        email: 'camille@example.com',
        username: null,
        role: 'USER',
        totpEnabled: false,
        createdAt: '2026-10-01T10:00:00.000Z',
        applicationsCount: 3,
        lastActivityAt: '2026-10-15T08:00:00.000Z',
      },
    ];
    adminService.listUsers.mockResolvedValue(users);

    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .expect(200);

    expect(res.body).toEqual(users);
  });

  it('refuses a non-admin with 403', async () => {
    allowed = false;

    await request(app.getHttpServer()).get('/admin/users').expect(403);
  });

  it('returns the visit statistics for the requested period', async () => {
    allowed = true;

    await request(app.getHttpServer())
      .get('/admin/analytics?days=7')
      .expect(200);

    expect(analytics.stats).toHaveBeenCalledWith(7);
  });

  it.each(['0', '91', 'abc'])('rejects days=%s with 400', async (days) => {
    allowed = true;

    await request(app.getHttpServer())
      .get(`/admin/analytics?days=${days}`)
      .expect(400);
  });
});
