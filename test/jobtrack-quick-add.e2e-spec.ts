import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createE2eUser, e2eCredentialsFromEnv } from './e2e-credentials';
import { JobStatus } from '../src/db/schema';

interface LoginDto {
  email: string;
  password: string;
}

interface ApiTokenCreatedResponseDto {
  id: string;
  token: string;
}

interface JobTrackResponseDto {
  id: string;
  userId: string;
  title: string;
  company?: string;
  jobUrl?: string;
  status: JobStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

async function configureApp(app: INestApplication): Promise<void> {
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api/v1');
  await app.init();
}

const { email: TEST_EMAIL, password: TEST_PASSWORD } =
  e2eCredentialsFromEnv('quick-add');

function api(server: Parameters<typeof request>[0]) {
  return request(server);
}

describe('JobTrack quick-add via API token (e2e)', () => {
  let app: INestApplication<Parameters<typeof request>[0]>;
  let httpServer: Parameters<typeof request>[0];
  let authCookies: string[];
  let apiToken: string;
  let apiTokenId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await configureApp(app);
    httpServer = app.getHttpServer();

    const loginBody: LoginDto = { email: TEST_EMAIL, password: TEST_PASSWORD };
    let loginRes = await api(httpServer)
      .post('/api/v1/auth/login')
      .send(loginBody);
    if (loginRes.status === 401) {
      await createE2eUser(app, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        username: 'e2e-user',
      });
      loginRes = await api(httpServer)
        .post('/api/v1/auth/login')
        .send(loginBody);
    }
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers['set-cookie'] as unknown as
      string[] | string | undefined;
    authCookies = Array.isArray(setCookie)
      ? setCookie
      : setCookie
        ? [setCookie]
        : [];

    const tokenRes = await api(httpServer)
      .post('/api/v1/api-tokens')
      .set('Cookie', authCookies)
      .send({ nomAffiche: 'quick-add e2e' });
    const created = tokenRes.body as ApiTokenCreatedResponseDto;
    apiToken = created.token;
    apiTokenId = created.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject quick-add without an Authorization header', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .send({ title: 'Sans jeton' });
    expect(res.status).toBe(401);
  });

  it('should reject quick-add with an invalid token', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', 'Bearer ctok_invalide')
      .send({ title: 'Jeton invalide' });
    expect(res.status).toBe(401);
  });

  it('should create a job track with status forced to TO_APPLY', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({
        title: 'Développeur Frontend',
        company: 'Extension Corp',
        jobUrl: 'https://example.com/jobs/999',
      });

    expect(res.status).toBe(201);
    const created = res.body as JobTrackResponseDto;
    expect(created.title).toBe('Développeur Frontend');
    expect(created.status).toBe(JobStatus.TO_APPLY);
  });

  it('should reject a status outside TO_APPLY/APPLIED', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({
        title: 'Tentative de statut hors périmètre',
        status: JobStatus.ACCEPTED,
      });
    expect(res.status).toBe(400);
  });

  it('should create a job track with status APPLIED and a standard reminder', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({
        title: 'Développeur Backend',
        company: 'Reminder Corp',
        status: JobStatus.APPLIED,
        contractType: 'CDI',
      });

    expect(res.status).toBe(201);
    const created = res.body as JobTrackResponseDto & { contractType?: string };
    expect(created.status).toBe(JobStatus.APPLIED);
    expect(created.contractType).toBe('CDI');

    const listRes = await api(httpServer)
      .get('/api/v1/jobtrack')
      .set('Cookie', authCookies);
    const withReminder = (
      listRes.body as Array<{ id: string; reminder?: { frequency: number } }>
    ).find((j) => j.id === created.id);
    expect(withReminder?.reminder?.frequency).toBe(7);
  });

  it('should create a job track with default status TO_APPLY and no reminder when status is omitted', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Sans statut explicite' });

    expect(res.status).toBe(201);
    const created = res.body as JobTrackResponseDto;
    expect(created.status).toBe(JobStatus.TO_APPLY);
  });

  it('keeps the offer text sent by the extension on the detail, not in the list', async () => {
    const offerText =
      'Nous recherchons un développeur Angular 22 maîtrisant les signals et NestJS.';
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Développeur Angular', offerText });
    expect(res.status).toBe(201);
    const { id } = res.body as JobTrackResponseDto;

    const detail = await api(httpServer)
      .get(`/api/v1/jobtrack/${id}`)
      .set('Cookie', authCookies);
    expect((detail.body as { offerText?: string }).offerText).toBe(offerText);

    const list = await api(httpServer)
      .get('/api/v1/jobtrack')
      .set('Cookie', authCookies);
    const listed = (
      list.body as Array<{ id: string; offerText?: string }>
    ).find((job) => job.id === id);
    expect(listed).toBeDefined();
    expect(listed?.offerText).toBeUndefined();
  });

  it('changes then clears the offer text pasted on the application', async () => {
    const created = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Lead front' });
    const { id } = created.body as JobTrackResponseDto;

    const pasted = await api(httpServer)
      .put(`/api/v1/jobtrack/${id}/with-reminder`)
      .set('Cookie', authCookies)
      .send({ offerText: 'Offre collée par l’utilisateur' });
    expect(pasted.status).toBe(200);
    expect((pasted.body as { offerText?: string }).offerText).toBe(
      'Offre collée par l’utilisateur',
    );

    const cleared = await api(httpServer)
      .put(`/api/v1/jobtrack/${id}/with-reminder`)
      .set('Cookie', authCookies)
      .send({ offerText: '' });
    expect((cleared.body as { offerText?: string }).offerText).toBeUndefined();
  });

  it('refuses an offer text over 20 000 characters', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Offre trop longue', offerText: 'x'.repeat(20_001) });
    expect(res.status).toBe(400);
  });

  it('should reject quick-add with a revoked token', async () => {
    await api(httpServer)
      .delete(`/api/v1/api-tokens/${apiTokenId}`)
      .set('Cookie', authCookies);

    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Après révocation' });
    expect(res.status).toBe(401);
  });
});
