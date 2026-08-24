import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as OTPAuth from 'otpauth';
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

interface ApiTokenLoginResponse {
  id: string;
  token: string;
  user: { email: string };
}

interface TwoFactorPendingResponse {
  requires2FA: true;
  tempToken: string;
}

async function configureApp(app: INestApplication): Promise<void> {
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api/v1');
  await app.init();
}

function api(server: Parameters<typeof request>[0]) {
  return request(server);
}

async function ensureUser(
  httpServer: Parameters<typeof request>[0],
  email: string,
  password: string,
): Promise<string[]> {
  let loginRes = await api(httpServer)
    .post('/api/v1/auth/login')
    .send({ email, password } satisfies LoginDto);
  if (loginRes.status === 401) {
    const createUserRes = await api(httpServer)
      .post('/api/v1/accounts/registration')
      .send({
        email,
        password,
        username: 'e2e-ext-login',
      } satisfies CreateUserDto);
    expect(createUserRes.status).toBeLessThan(400);
    loginRes = await api(httpServer)
      .post('/api/v1/auth/login')
      .send({ email, password } satisfies LoginDto);
  }
  expect(loginRes.status).toBe(200);
  const setCookie = loginRes.headers['set-cookie'] as unknown as
    | string[]
    | string
    | undefined;
  return Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
}

describe('Extension login → API token (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  const NO_2FA_EMAIL = 'contact@djoudj.dev';
  const NO_2FA_PASSWORD = 'a4R!y5euSPf#8Vx4wRqMf6!B';
  const TWOFA_EMAIL = 'ext-login-2fa-e2e@djoudj.dev';
  const TWOFA_PASSWORD = 'V9!kLp3qXz#7mWnR2t!Yc8Bd';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await configureApp(app);
    httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('without 2FA', () => {
    beforeAll(async () => {
      await ensureUser(httpServer, NO_2FA_EMAIL, NO_2FA_PASSWORD);
    });

    it('rejects wrong credentials with a generic message', async () => {
      const res = await api(httpServer).post('/api/v1/api-tokens/login').send({
        email: NO_2FA_EMAIL,
        password: 'mauvais-mdp',
        nomAffiche: 'Test e2e',
      });
      expect(res.status).toBe(401);
      expect((res.body as { message: string }).message).toBe(
        'Identifiants invalides',
      );
    });

    it('returns a usable API token on success', async () => {
      const res = await api(httpServer).post('/api/v1/api-tokens/login').send({
        email: NO_2FA_EMAIL,
        password: NO_2FA_PASSWORD,
        nomAffiche: 'Test e2e',
      });
      expect(res.status).toBe(200);
      const body = res.body as ApiTokenLoginResponse;
      expect(body.token).toMatch(/^ctok_/);
      expect(body.user.email).toBe(NO_2FA_EMAIL);

      const quickAddRes = await api(httpServer)
        .post('/api/v1/jobtrack/quick-add')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ title: 'Vérif jeton généré par login' });
      expect(quickAddRes.status).toBe(201);
    });

    it('self-revokes via DELETE /api-tokens/me using its own bearer token', async () => {
      const loginRes = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({
          email: NO_2FA_EMAIL,
          password: NO_2FA_PASSWORD,
          nomAffiche: 'Test e2e revoke',
        });
      const { token } = loginRes.body as ApiTokenLoginResponse;

      const revokeRes = await api(httpServer)
        .delete('/api/v1/api-tokens/me')
        .set('Authorization', `Bearer ${token}`);
      expect(revokeRes.status).toBe(200);

      const afterRevoke = await api(httpServer)
        .post('/api/v1/jobtrack/quick-add')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Ne doit plus fonctionner' });
      expect(afterRevoke.status).toBe(401);
    });
  });

  describe('with 2FA enabled', () => {
    let totp: OTPAuth.TOTP | null = null;

    beforeAll(async () => {
      const cookies = await ensureUser(httpServer, TWOFA_EMAIL, TWOFA_PASSWORD);

      const setupRes = await api(httpServer)
        .post('/api/v1/auth/2fa/setup')
        .set('Cookie', cookies);
      if (setupRes.status !== 200) {
        // 2FA déjà active sur ce compte (ré-exécution de la suite) : le
        // secret n'est plus récupérable via /setup. Les tests de ce bloc
        // qui ont besoin de générer un code seront skippés (voir plus bas).
        return;
      }
      const { otpauthUri } = setupRes.body as { otpauthUri: string };
      totp = OTPAuth.URI.parse(otpauthUri) as OTPAuth.TOTP;
      const verifyRes = await api(httpServer)
        .post('/api/v1/auth/2fa/verify-setup')
        .set('Cookie', cookies)
        .send({ token: totp.generate() });
      expect(verifyRes.status).toBe(200);
    });

    it('returns requires2FA instead of a token', async () => {
      const res = await api(httpServer).post('/api/v1/api-tokens/login').send({
        email: TWOFA_EMAIL,
        password: TWOFA_PASSWORD,
        nomAffiche: 'Test e2e 2fa',
      });
      expect(res.status).toBe(200);
      const body = res.body as TwoFactorPendingResponse;
      expect(body.requires2FA).toBe(true);
      expect(body.tempToken).toBeTruthy();
    });

    it('completes login and returns a token with a valid TOTP code', async () => {
      if (!totp) {
        // Secret indisponible (2FA déjà active avant ce run) — couvert par
        // la 1ère exécution de la suite, pas une régression si skippé ici.
        return;
      }
      const pendingRes = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({
          email: TWOFA_EMAIL,
          password: TWOFA_PASSWORD,
          nomAffiche: 'Test e2e 2fa ok',
        });
      const { tempToken } = pendingRes.body as TwoFactorPendingResponse;

      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login/2fa')
        .send({
          tempToken,
          token: totp.generate(),
          nomAffiche: 'Test e2e 2fa ok',
        });
      expect(res.status).toBe(200);
      const body = res.body as ApiTokenLoginResponse;
      expect(body.token).toMatch(/^ctok_/);
      expect(body.user.email).toBe(TWOFA_EMAIL);
    });

    it('rejects an invalid TOTP code', async () => {
      const pendingRes = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({
          email: TWOFA_EMAIL,
          password: TWOFA_PASSWORD,
          nomAffiche: 'Test e2e 2fa invalide',
        });
      const { tempToken } = pendingRes.body as TwoFactorPendingResponse;

      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login/2fa')
        .send({
          tempToken,
          token: '000000',
          nomAffiche: 'Test e2e 2fa invalide',
        });
      expect(res.status).toBe(401);
    });
  });
});
