import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

interface LoginDto {
  email: string;
  password: string;
}

interface CreateUserDto {
  email: string;
  password: string;
  username?: string;
}

interface ApiTokenResponseDto {
  id: string;
  nomAffiche: string;
  createdAt: string;
  derniereUtilisation?: string;
}

interface ApiTokenCreatedResponseDto extends ApiTokenResponseDto {
  token: string;
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

describe('ApiTokens CRUD (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let authCookies: string[];
  let createdToken: ApiTokenCreatedResponseDto;

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
    expect(authCookies.some((c) => c.startsWith('access_token='))).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject token creation without a session cookie', async () => {
    const res = await api(httpServer).post('/api/v1/api-tokens').send({});
    expect(res.status).toBe(401);
  });

  it('should create an api token and return the secret once', async () => {
    const res = await api(httpServer)
      .post('/api/v1/api-tokens')
      .set('Cookie', authCookies)
      .send({ nomAffiche: 'Extension Chrome (e2e)' });

    expect(res.status).toBe(201);
    createdToken = res.body as ApiTokenCreatedResponseDto;
    expect(createdToken.token).toMatch(/^ctok_/);
    expect(createdToken.nomAffiche).toBe('Extension Chrome (e2e)');
  });

  it('should list active tokens without exposing the secret', async () => {
    const res = await api(httpServer)
      .get('/api/v1/api-tokens')
      .set('Cookie', authCookies);
    expect(res.status).toBe(200);
    const list = res.body as ApiTokenResponseDto[];
    const found = list.find((t) => t.id === createdToken.id);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty('token');
  });

  it('should revoke the token', async () => {
    const res = await api(httpServer)
      .delete(`/api/v1/api-tokens/${createdToken.id}`)
      .set('Cookie', authCookies);
    expect(res.status).toBe(200);
  });

  it('should no longer list the revoked token', async () => {
    const res = await api(httpServer)
      .get('/api/v1/api-tokens')
      .set('Cookie', authCookies);
    expect(res.status).toBe(200);
    const list = res.body as ApiTokenResponseDto[];
    expect(list.find((t) => t.id === createdToken.id)).toBeUndefined();
  });
});
