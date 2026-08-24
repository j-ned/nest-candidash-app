import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
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

function extractCookies(res: request.Response): string[] {
  const setCookie = res.headers['set-cookie'] as unknown as
    | string[]
    | string
    | undefined;
  return Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
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
  let throttlerSpy: jest.SpyInstance<Promise<boolean>>;

  const NO_2FA_EMAIL = 'contact@djoudj.dev';
  const NO_2FA_PASSWORD = 'a4R!y5euSPf#8Vx4wRqMf6!B';
  // Email généré à chaque exécution du process : une fois la 2FA activée
  // par ce fichier (dernière étape du beforeAll ci-dessous), une adresse
  // fixe redevient verrouillée pour le run suivant — POST /auth/login ne
  // renvoie plus de cookies mais un `requires2FA: true`, et il n'existe
  // aucune route pour récupérer/désactiver la 2FA sans compléter un
  // challenge TOTP dont le secret n'est plus connu (comportement de
  // sécurité correct, mais qui rendrait ce fichier non-idempotent d'un run
  // à l'autre sur une base persistante). Repartir d'un compte neuf à
  // chaque process élimine structurellement ce verrouillage.
  const TWOFA_EMAIL = `ext-login-2fa-e2e-${Date.now()}@djoudj.dev`;
  const TWOFA_PASSWORD = 'V9!kLp3qXz#7mWnR2t!Yc8Bd';

  beforeAll(async () => {
    // ThrottlerGuard est enregistré globalement via APP_GUARD dans
    // AppModule. `.overrideGuard()`/`.overrideProvider(APP_GUARD)` ne
    // fonctionnent PAS pour ce cas : NestJS réécrit en interne le token de
    // ces enhancers globaux vers une clé "APP_GUARD (UUID: …)" générée à
    // l'analyse du module (voir @nestjs/core/scanner.js#insertProvider),
    // donc aucun override par token ne peut le cibler (vérifié
    // empiriquement : les deux approches laissent le throttling actif).
    // On neutralise donc directement la méthode partagée par toute
    // instance de la classe, restaurée en afterAll avant le describe de
    // rate limiting qui a besoin du vrai comportement.
    throttlerSpy = jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockResolvedValue(true);

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
    throttlerSpy.mockRestore();
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

    it('revoking one token via DELETE /api-tokens/me does not affect a different token', async () => {
      const firstLogin = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({
          email: NO_2FA_EMAIL,
          password: NO_2FA_PASSWORD,
          nomAffiche: 'Test e2e isolation A',
        });
      const { token: tokenA } = firstLogin.body as ApiTokenLoginResponse;

      const secondLogin = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({
          email: NO_2FA_EMAIL,
          password: NO_2FA_PASSWORD,
          nomAffiche: 'Test e2e isolation B',
        });
      const { token: tokenB } = secondLogin.body as ApiTokenLoginResponse;

      const revokeRes = await api(httpServer)
        .delete('/api/v1/api-tokens/me')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(revokeRes.status).toBe(200);

      const tokenAUsage = await api(httpServer)
        .post('/api/v1/jobtrack/quick-add')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Jeton A révoqué' });
      expect(tokenAUsage.status).toBe(401);

      const tokenBUsage = await api(httpServer)
        .post('/api/v1/jobtrack/quick-add')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Jeton B toujours actif' });
      expect(tokenBUsage.status).toBe(201);
      // Timeout étendu : 5 requêtes séquentielles impliquant chacune un
      // bcrypt.compare (coût 12, implémentation JS pure) dépassent parfois
      // les 5000 ms par défaut de Jest sur cette machine.
    }, 15000);

    it('extension login does not invalidate the existing web session refresh token', async () => {
      const email = 'ext-login-session-guard-e2e@djoudj.dev';
      const password = 'aB3!zQ9wLp&6Vc2XsT7uYr!K';

      // "webCookies" représente le navigateur de l'utilisateur : après un
      // refresh réussi, un vrai navigateur remplace automatiquement son
      // cookie jar par le Set-Cookie de la réponse (rotation standard du
      // refresh token). On simule ce comportement ici en réassignant
      // webCookies à chaque refresh réussi, pour représenter fidèlement
      // « la session web en cours » à travers le temps.
      let webCookies = await ensureUser(httpServer, email, password);

      const baselineRefresh = await api(httpServer)
        .post('/api/v1/auth/refresh')
        .set('Cookie', webCookies);
      expect(baselineRefresh.status).toBe(200);
      webCookies = extractCookies(baselineRefresh);

      const extensionLoginRes = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({
          email,
          password,
          nomAffiche: 'Test e2e session isolation',
        });
      expect(extensionLoginRes.status).toBe(200);
      const extensionLoginBody =
        extensionLoginRes.body as ApiTokenLoginResponse;
      expect(extensionLoginBody.token).toMatch(/^ctok_/);

      // Le refresh token de la session web (posé/renouvelé juste avant)
      // doit toujours être valide : le login extension ne doit PAS l'avoir
      // écrasé en base.
      const refreshAfterExtensionLogin = await api(httpServer)
        .post('/api/v1/auth/refresh')
        .set('Cookie', webCookies);
      expect(refreshAfterExtensionLogin.status).toBe(200);
      // Timeout étendu pour la même raison (plusieurs bcrypt.compare/hash
      // séquentiels + éventuelle création de compte).
    }, 15000);
  });

  describe('with 2FA enabled', () => {
    let totp: OTPAuth.TOTP;
    // Capturées AVANT l'activation de la 2FA (voir beforeAll) : une fois la
    // 2FA active, POST /auth/login ne renvoie plus de cookies (juste un
    // `requires2FA: true`), donc `ensureUser` ne peut plus en fournir de
    // nouvelles pour ce compte le reste du run. On réutilise cette session
    // web déjà valide dans les tests qui ont besoin d'un cookie de session.
    let sessionCookies: string[];

    beforeAll(async () => {
      sessionCookies = await ensureUser(
        httpServer,
        TWOFA_EMAIL,
        TWOFA_PASSWORD,
      );

      // Repartir d'un état déterministe : si une exécution précédente de ce
      // fichier a déjà activé la 2FA sur ce compte, /2fa/setup échouerait
      // silencieusement (secret plus récupérable) et masquerait pour
      // toujours le test qui valide un login TOTP réel. On désactive donc
      // d'abord (en ignorant l'échec si la 2FA n'était pas active).
      await api(httpServer)
        .post('/api/v1/auth/2fa/disable')
        .set('Cookie', sessionCookies)
        .send({ password: TWOFA_PASSWORD })
        .catch(() => undefined);

      const setupRes = await api(httpServer)
        .post('/api/v1/auth/2fa/setup')
        .set('Cookie', sessionCookies);
      expect(setupRes.status).toBe(200);

      const { otpauthUri } = setupRes.body as { otpauthUri: string };
      totp = OTPAuth.URI.parse(otpauthUri) as OTPAuth.TOTP;
      const verifyRes = await api(httpServer)
        .post('/api/v1/auth/2fa/verify-setup')
        .set('Cookie', sessionCookies)
        .send({ token: totp.generate() });
      expect(verifyRes.status).toBe(200);
      // Timeout étendu : login + disable + setup + verify-setup enchaînent
      // plusieurs bcrypt.compare/hash séquentiels (coût 12/10, JS pur).
    }, 15000);

    it('returns requires2FA instead of a token, and creates no API token', async () => {
      const beforeRes = await api(httpServer)
        .get('/api/v1/api-tokens')
        .set('Cookie', sessionCookies);
      expect(beforeRes.status).toBe(200);
      const tokenCountBefore = (beforeRes.body as unknown[]).length;

      const res = await api(httpServer).post('/api/v1/api-tokens/login').send({
        email: TWOFA_EMAIL,
        password: TWOFA_PASSWORD,
        nomAffiche: 'Test e2e 2fa',
      });
      expect(res.status).toBe(200);
      const body = res.body as TwoFactorPendingResponse;
      expect(body.requires2FA).toBe(true);
      expect(body.tempToken).toBeTruthy();

      const afterRes = await api(httpServer)
        .get('/api/v1/api-tokens')
        .set('Cookie', sessionCookies);
      expect(afterRes.status).toBe(200);
      expect((afterRes.body as unknown[]).length).toBe(tokenCountBefore);
    });

    it('rejects an invalid/garbage tempToken on /login/2fa', async () => {
      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login/2fa')
        .send({
          tempToken: 'not-a-real-token',
          token: '123456',
          nomAffiche: 'Test e2e tempToken invalide',
        });
      expect(res.status).toBe(401);
    });

    it('completes login and returns a token with a valid TOTP code', async () => {
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

describe('Extension login → API token (e2e) — rate limiting', () => {
  it('the 6th POST /api-tokens/login in under a minute is throttled (429)', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const throttledApp = moduleFixture.createNestApplication();
    await configureApp(throttledApp);
    const throttledServer =
      throttledApp.getHttpServer() as unknown as Parameters<typeof request>[0];

    try {
      const credentials = {
        email: 'rate-limit-probe-e2e@djoudj.dev',
        password: 'mauvais-mdp',
        nomAffiche: 'Test e2e rate limit',
      };

      const responses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await api(throttledServer)
          .post('/api/v1/api-tokens/login')
          .send(credentials);
        responses.push(res.status);
      }

      expect(responses.slice(0, 5).every((status) => status !== 429)).toBe(
        true,
      );
      expect(responses[5]).toBe(429);
    } finally {
      await throttledApp.close();
    }
  });
});
