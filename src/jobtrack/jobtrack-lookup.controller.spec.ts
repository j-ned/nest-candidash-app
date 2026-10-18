import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { App } from 'supertest/types';
import { JobTrackController } from './jobtrack.controller';
import { JobTrackService } from './jobtrack.service';
import { ApiTokenGuard } from '../auth/guard/api-token.guard';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';

describe('JobTrackController GET /jobtrack/lookup', () => {
  let app: INestApplication<App>;
  const service = { findByJobUrl: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [JobTrackController],
      providers: [{ provide: JobTrackService, useValue: service }],
    })
      .overrideGuard(ApiTokenGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          ctx.switchToHttp().getRequest().user = { sub: 'user-1' };
          return true;
        },
      })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => service.findByJobUrl.mockReset());

  it('returns the tracked application for the current user', async () => {
    const job = { id: 'j1', title: 'Dev Angular', status: 'TO_APPLY' };
    service.findByJobUrl.mockResolvedValue(job);

    const res = await request(app.getHttpServer())
      .get('/jobtrack/lookup')
      .query({ url: 'https://fr.indeed.com/viewjob?jk=abc' })
      .expect(200);

    expect(res.body).toEqual({ jobTrack: job });
    expect(service.findByJobUrl).toHaveBeenCalledWith(
      'user-1',
      'https://fr.indeed.com/viewjob?jk=abc',
    );
  });

  it('answers null when the offer is not tracked yet', async () => {
    service.findByJobUrl.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get('/jobtrack/lookup')
      .query({ url: 'https://example.com/job' })
      .expect(200);

    expect(res.body).toEqual({ jobTrack: null });
  });

  it('rejects a missing url with 400', async () => {
    await request(app.getHttpServer()).get('/jobtrack/lookup').expect(400);
    expect(service.findByJobUrl).not.toHaveBeenCalled();
  });
});
