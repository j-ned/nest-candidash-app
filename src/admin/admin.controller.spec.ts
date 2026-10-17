import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';

describe('AdminController', () => {
  let app: INestApplication<App>;
  const adminService = { listUsers: jest.fn() };
  let allowed = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: adminService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => allowed })
      .compile();
    app = moduleRef.createNestApplication();
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
});
