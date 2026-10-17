import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { App } from 'supertest/types';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let app: INestApplication<App>;
  const analytics = { track: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: analytics }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => analytics.track.mockClear());

  it('accepts a page view with 204 and forwards the request context', async () => {
    await request(app.getHttpServer())
      .post('/analytics/track')
      .set('User-Agent', 'Firefox/144')
      .set('Origin', 'https://candidash.example')
      .send({ path: '/features' })
      .expect(204);

    expect(analytics.track).toHaveBeenCalledWith(
      { path: '/features' },
      expect.objectContaining({
        userAgent: 'Firefox/144',
        origin: 'https://candidash.example',
      }),
    );
  });

  it('rejects an unknown field with 400', async () => {
    await request(app.getHttpServer())
      .post('/analytics/track')
      .send({ path: '/', email: 'x@example.com' })
      .expect(400);

    expect(analytics.track).not.toHaveBeenCalled();
  });
});
