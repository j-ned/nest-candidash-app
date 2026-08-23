import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JobStatus } from '../src/db/schema';

interface LoginDto {
  email: string;
  password: string;
}

interface CreateUserDto {
  email: string;
  password: string;
  username?: string;
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

const TEST_EMAIL = 'contact@djoudj.dev';
const TEST_PASSWORD = 'a4R!y5euSPf#8Vx4wRqMf6!B';

function api(server: Parameters<typeof request>[0]) {
  return request(server);
}

describe('JobTrack quick-add via API token (e2e)', () => {
  let app: INestApplication;
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
    httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];

    const loginBody: LoginDto = { email: TEST_EMAIL, password: TEST_PASSWORD };
    let loginRes = await api(httpServer)
      .post('/api/v1/auth/login')
      .send(loginBody);
    if (loginRes.status === 401) {
      const createUserBody: CreateUserDto = {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        username: 'e2e-user',
      };
      const createUserRes = await api(httpServer)
        .post('/api/v1/accounts/registration')
        .send(createUserBody);
      expect(createUserRes.status).toBeLessThan(400);
      loginRes = await api(httpServer)
        .post('/api/v1/auth/login')
        .send(loginBody);
    }
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers['set-cookie'] as unknown as
      | string[]
      | string
      | undefined;
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

  it('should reject quick-add payloads that try to set a status explicitly', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Tentative de statut forcé', status: JobStatus.ACCEPTED });
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
