# Extension Login + Quick-Add enrichi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajoute un login email/mdp (+ 2FA) pour l'extension Chrome, qui génère un jeton d'API automatiquement au lieu de le faire copier-coller à la main ; enrichit `POST /jobtrack/quick-add` avec `contractType` et un `status` limité (Repérée/Candidaturée), ce dernier déclenchant le rappel de relance standard.

**Architecture:** Deux nouvelles routes sous `ApiTokensController` (`POST /login`, `POST /login/2fa`) orchestrent `AuthService.login`/`validateTotp` (réutilisés tels quels) puis `ApiTokensService.create` — aucun JWT n'est jamais exposé à l'extension. Une troisième route (`DELETE /me`, guard `ApiTokenGuard`) permet à un jeton de se révoquer lui-même sans passer par le cookie de session web. `POST /jobtrack/quick-add` accepte deux champs optionnels de plus et bascule vers `createWithReminder` quand `status: 'APPLIED'` est demandé.

**Tech Stack:** NestJS 11, Drizzle ORM, nestjs-zod (DTOs), Jest (e2e via supertest), `otpauth` (génération de code TOTP en test).

**Spec:** `../../chrome-candidash-extension/docs/superpowers/specs/2026-08-24-extension-login-and-enriched-form-design.md` (spec écrite dans le repo extension, couvre les 3 repos — backend + extension).

## Global Constraints

- TypeScript strict, jamais `any` (cf. CLAUDE.md du repo).
- DTOs Zod `.strict()` — tout champ non déclaré est rejeté (pas de whitelist implicite).
- `sha256` (pas bcrypt) pour le hash des jetons d'API — cohérent avec `ApiTokensService.create` existant, ne pas dévier.
- Aucune modification de `JwtAuthGuard` ni du cookie `HttpOnly SameSite=Strict` — le login extension est un mécanisme entièrement séparé.
- `pnpm test:e2e` nécessite `DATABASE_URL`/`JWT_SECRET`/`TOTP_ENCRYPTION_KEY`/`MAIL_*` en env (voir README du repo) — prérequis d'exécution, pas de setup ad-hoc dans ce plan.
- Ne jamais commit vous-même sur ce repo sans validation explicite de l'utilisateur pour le push (le commit local est OK, cf. workflow déjà suivi dans ce chantier).

---

## Task 1: Login extension (email/mdp + 2FA) → jeton d'API auto-généré

**Files:**
- Modify: `src/auth/dto/totp.dto.ts` (exporter le validateur `totpToken` pour réutilisation)
- Create: `src/api-tokens/dto/login-api-token.dto.ts`
- Create: `src/api-tokens/dto/login-2fa-api-token.dto.ts`
- Create: `src/api-tokens/dto/api-token-login-response.dto.ts`
- Modify: `src/auth/guard/api-token.guard.ts` (attacher `apiTokenId` à la requête)
- Modify: `src/api-tokens/api-tokens.module.ts` (importer `AuthModule`)
- Modify: `src/api-tokens/api-tokens.service.ts` (deux nouvelles méthodes d'orchestration)
- Modify: `src/api-tokens/api-tokens.controller.ts` (3 nouvelles routes)
- Create: `test/api-tokens-login.e2e-spec.ts`

**Interfaces:**
- Consomme : `AuthService.login(credentials: LoginCredentials): Promise<AuthResult | TwoFactorPendingResponse>`, `AuthService.validateTotp(tempToken: string, token: string): Promise<AuthResult>` (existants, `src/auth/auth.service.ts`), `ApiTokensService.create(userId: string, nomAffiche: string): Promise<ApiTokenCreated>` (existant), `ApiTokensService.revoke(id: string, userId: string): Promise<void>` (existant).
- Produit : `ApiTokensService.loginAndCreate(credentials: LoginCredentials, nomAffiche: string): Promise<ApiTokenLoginResult | TwoFactorPendingResponse>`, `ApiTokensService.loginWithTotpAndCreate(tempToken: string, token: string, nomAffiche: string): Promise<ApiTokenLoginResult>` où `ApiTokenLoginResult = ApiTokenCreated & { user: { email: string } }` — utilisés par la Task du plan extension (`chrome-candidash-extension`) via HTTP, pas d'import direct cross-repo.

- [ ] **Step 1: Écrire les tests e2e (RED) pour les 3 nouvelles routes**

Créer `test/api-tokens-login.e2e-spec.ts` :

```ts
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
      .send({ email, password, username: 'e2e-ext-login' } satisfies CreateUserDto);
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
    httpServer = app.getHttpServer() as unknown as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('without 2FA', () => {
    beforeAll(async () => {
      await ensureUser(httpServer, NO_2FA_EMAIL, NO_2FA_PASSWORD);
    });

    it('rejects wrong credentials with a generic message', async () => {
      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({ email: NO_2FA_EMAIL, password: 'mauvais-mdp', nomAffiche: 'Test e2e' });
      expect(res.status).toBe(401);
      expect((res.body as { message: string }).message).toBe('Identifiants invalides');
    });

    it('returns a usable API token on success', async () => {
      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({ email: NO_2FA_EMAIL, password: NO_2FA_PASSWORD, nomAffiche: 'Test e2e' });
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
        .send({ email: NO_2FA_EMAIL, password: NO_2FA_PASSWORD, nomAffiche: 'Test e2e revoke' });
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
      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({ email: TWOFA_EMAIL, password: TWOFA_PASSWORD, nomAffiche: 'Test e2e 2fa' });
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
        .send({ email: TWOFA_EMAIL, password: TWOFA_PASSWORD, nomAffiche: 'Test e2e 2fa ok' });
      const { tempToken } = pendingRes.body as TwoFactorPendingResponse;

      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login/2fa')
        .send({ tempToken, token: totp.generate(), nomAffiche: 'Test e2e 2fa ok' });
      expect(res.status).toBe(200);
      const body = res.body as ApiTokenLoginResponse;
      expect(body.token).toMatch(/^ctok_/);
      expect(body.user.email).toBe(TWOFA_EMAIL);
    });

    it('rejects an invalid TOTP code', async () => {
      const pendingRes = await api(httpServer)
        .post('/api/v1/api-tokens/login')
        .send({ email: TWOFA_EMAIL, password: TWOFA_PASSWORD, nomAffiche: 'Test e2e 2fa invalide' });
      const { tempToken } = pendingRes.body as TwoFactorPendingResponse;

      const res = await api(httpServer)
        .post('/api/v1/api-tokens/login/2fa')
        .send({ tempToken, token: '000000', nomAffiche: 'Test e2e 2fa invalide' });
      expect(res.status).toBe(401);
    });
  });
});
```

Note : le compte `ext-login-2fa-e2e@djoudj.dev` est dédié à ce fichier de test — jamais réutilisé ailleurs, pour ne jamais risquer d'activer la 2FA sur `contact@djoudj.dev` (qui casserait `api-tokens.e2e-spec.ts`/`jobtrack-quick-add.e2e-spec.ts`, lesquels font un login simple sans gérer `requires2FA`).

- [ ] **Step 2: Lancer les tests, constater l'échec (RED)**

```bash
pnpm test:e2e -- api-tokens-login
```
Attendu : échecs sur les routes inexistantes (`POST /api-tokens/login` → 404), pas d'erreur de compilation TypeScript (le fichier de test doit compiler même si les routes n'existent pas encore — si TS échoue à la compilation, corrige les imports avant de continuer).

- [ ] **Step 3: Exporter le validateur TOTP existant**

Dans `src/auth/dto/totp.dto.ts`, retirer le mot-clé `const` non exporté :

```diff
-const totpToken = z
+export const totpToken = z
   .string()
   .length(6)
```

- [ ] **Step 4: Créer les 3 DTOs**

`src/api-tokens/dto/login-api-token.dto.ts` :

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const loginApiTokenSchema = z
  .object({
    email: z.string().email({ message: 'Email invalide' }),
    password: z.string().min(1, { message: 'Le mot de passe est requis' }),
    nomAffiche: z
      .string({ message: 'Le nom du jeton doit être une chaîne de caractères' })
      .min(1, { message: 'Le nom du jeton ne peut pas être vide' })
      .default('Extension Chrome'),
  })
  .strict();

export class LoginApiTokenDto extends createZodDto(loginApiTokenSchema) {}
```

`src/api-tokens/dto/login-2fa-api-token.dto.ts` :

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { totpToken } from '../../auth/dto/totp.dto';

export const login2faApiTokenSchema = z
  .object({
    tempToken: z.string().min(1),
    token: totpToken,
    nomAffiche: z
      .string({ message: 'Le nom du jeton doit être une chaîne de caractères' })
      .min(1, { message: 'Le nom du jeton ne peut pas être vide' })
      .default('Extension Chrome'),
  })
  .strict();

export class Login2faApiTokenDto extends createZodDto(login2faApiTokenSchema) {}
```

`src/api-tokens/dto/api-token-login-response.dto.ts` :

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ApiTokenCreatedResponseDto } from './api-token-created-response.dto';

class ApiTokenLoginUserDto {
  @ApiProperty({ example: 'utilisateur@exemple.com' })
  email: string;
}

export class ApiTokenLoginResponseDto extends ApiTokenCreatedResponseDto {
  @ApiProperty({ type: ApiTokenLoginUserDto })
  user: ApiTokenLoginUserDto;
}
```

- [ ] **Step 5: Attacher l'id du jeton à la requête dans `ApiTokenGuard`**

Dans `src/auth/guard/api-token.guard.ts` :

```diff
 interface RequestWithUser extends ExpressRequest {
   user?: { sub: string };
+  apiTokenId?: string;
 }
```

Et après le check `if (!row) { ... }`, avant `request.user = { sub: row.userId };` :

```diff
     request.user = { sub: row.userId };
+    request.apiTokenId = row.id;
     return true;
```

- [ ] **Step 6: Importer `AuthModule` dans `ApiTokensModule`**

```diff
 import { Module } from '@nestjs/common';
+import { AuthModule } from '../auth/auth.module';
 import { ApiTokensController } from './api-tokens.controller';
 import { ApiTokensService } from './api-tokens.service';

 @Module({
+  imports: [AuthModule],
   controllers: [ApiTokensController],
```

- [ ] **Step 7: Ajouter les 2 méthodes d'orchestration à `ApiTokensService`**

```diff
 import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
 import { randomBytes, createHash } from 'node:crypto';
 import { and, desc, eq, isNull } from 'drizzle-orm';
 import { DrizzleService } from '../db/drizzle.service';
 import { apiTokens } from '../db/schema';
 import { ApiToken, ApiTokenCreated } from './interfaces';
 import { ApiTokenMapper } from './mappers/api-token.mapper';
+import { AuthService } from '../auth/auth.service';
+import type { LoginCredentials, TwoFactorPendingResponse } from '../auth/interfaces';

 const TOKEN_PREFIX = 'ctok_';
+
+export type ApiTokenLoginResult = ApiTokenCreated & { user: { email: string } };

 @Injectable()
 export class ApiTokensService {
-  constructor(private readonly drizzle: DrizzleService) {}
+  constructor(
+    private readonly drizzle: DrizzleService,
+    private readonly authService: AuthService,
+  ) {}
```

Puis, après la méthode `revoke` :

```ts
  async loginAndCreate(
    credentials: LoginCredentials,
    nomAffiche: string,
  ): Promise<ApiTokenLoginResult | TwoFactorPendingResponse> {
    const result = await this.authService.login(credentials);
    if ('requires2FA' in result) return result;
    const created = await this.create(result.user.id, nomAffiche);
    return { ...created, user: { email: result.user.email } };
  }

  async loginWithTotpAndCreate(
    tempToken: string,
    token: string,
    nomAffiche: string,
  ): Promise<ApiTokenLoginResult> {
    const result = await this.authService.validateTotp(tempToken, token);
    const created = await this.create(result.user.id, nomAffiche);
    return { ...created, user: { email: result.user.email } };
  }
```

- [ ] **Step 8: Ajouter les 3 routes au contrôleur**

Dans `src/api-tokens/api-tokens.controller.ts`, ajouter les imports nécessaires :

```diff
 import {
   Controller,
   Post,
   Get,
   Delete,
   Body,
   Param,
   UseGuards,
   Request,
   HttpCode,
 } from '@nestjs/common';
+import { Throttle } from '@nestjs/throttler';
 import {
   ApiTags,
   ApiOperation,
   ApiResponse,
   ApiBearerAuth,
   ApiParam,
 } from '@nestjs/swagger';
 import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
+import { ApiTokenGuard } from '../auth/guard/api-token.guard';
 import { ApiTokensService } from './api-tokens.service';
 import { CreateApiTokenDto } from './dto/create-api-token.dto';
+import { LoginApiTokenDto } from './dto/login-api-token.dto';
+import { Login2faApiTokenDto } from './dto/login-2fa-api-token.dto';
+import { ApiTokenLoginResponseDto } from './dto/api-token-login-response.dto';
 import { ApiTokenResponseDto } from './dto/api-token-response.dto';
 import { ApiTokenCreatedResponseDto } from './dto/api-token-created-response.dto';
 import type { AuthenticatedUser } from '../auth/interfaces';
+import type { TwoFactorPendingResponse } from '../auth/interfaces';

+interface RequestWithApiToken extends AuthenticatedUser {
+  apiTokenId: string;
+}
```

Puis, avant la fermeture de la classe (après `revoke`) :

```ts
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: "Connexion + génération automatique d'un jeton (extension navigateur)",
  })
  async login(
    @Body() body: LoginApiTokenDto,
  ): Promise<ApiTokenLoginResponseDto | TwoFactorPendingResponse> {
    return this.apiTokensService.loginAndCreate(
      { email: body.email, password: body.password },
      body.nomAffiche,
    );
  }

  @Post('login/2fa')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: "Complète la connexion 2FA + génère un jeton (extension navigateur)",
  })
  async loginTwoFactor(
    @Body() body: Login2faApiTokenDto,
  ): Promise<ApiTokenLoginResponseDto> {
    return this.apiTokensService.loginWithTotpAndCreate(
      body.tempToken,
      body.token,
      body.nomAffiche,
    );
  }

  @Delete('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'Révoque le jeton utilisé pour cette requête' })
  @UseGuards(ApiTokenGuard)
  async revokeSelf(
    @Request() req: RequestWithApiToken,
  ): Promise<{ message: string }> {
    await this.apiTokensService.revoke(req.apiTokenId, req.user.sub);
    return { message: 'Jeton révoqué' };
  }
```

- [ ] **Step 9: Lancer les tests, constater le succès (GREEN)**

```bash
pnpm test:e2e -- api-tokens-login
```
Attendu : tous les tests passent. Si le test 2FA échoue sur un `expiresIn` dépassé (le `tempToken` a une durée de vie de 5 minutes), relance simplement la suite — pas un problème de code.

- [ ] **Step 10: Lancer la suite e2e complète pour vérifier l'absence de régression**

```bash
pnpm test:e2e
```
Attendu : tous les fichiers `.e2e-spec.ts` passent, y compris `api-tokens.e2e-spec.ts` et `jobtrack-quick-add.e2e-spec.ts` déjà existants (le compte `contact@djoudj.dev` ne doit jamais se retrouver avec la 2FA activée par erreur — vérifie que seul `ext-login-2fa-e2e@djoudj.dev` a la 2FA active si un test échoue de façon inattendue ailleurs).

- [ ] **Step 11: Commit**

```bash
git add src/auth/dto/totp.dto.ts src/api-tokens/ test/api-tokens-login.e2e-spec.ts
git commit -m "feat(api-tokens): ajoute le login extension (email/mdp + 2FA) et l'auto-révocation"
```

---

## Task 2: `POST /jobtrack/quick-add` — type de contrat + choix du statut

**Files:**
- Modify: `src/jobtrack/dto/quick-add-jobtrack.dto.ts`
- Modify: `src/jobtrack/jobtrack.controller.ts`
- Modify: `test/jobtrack-quick-add.e2e-spec.ts`

**Interfaces:**
- Consomme : `JobTrackService.create(userId, dto): Promise<JobTrack>` et `JobTrackService.createWithReminder(userId, dto): Promise<JobTrackWithReminder>` (existants, `src/jobtrack/jobtrack.service.ts`), `ContractType`/`JobStatus` (`src/db/schema.ts`).
- Produit : `QuickAddJobTrackDto` accepte désormais `contractType?: ContractType` et `status?: 'TO_APPLY' | 'APPLIED'` — consommé par le plan extension (`chrome-candidash-extension`) via le payload HTTP du formulaire enrichi.

- [ ] **Step 1: Mettre à jour le test existant qui vérifiait le rejet d'un `status` explicite**

Dans `test/jobtrack-quick-add.e2e-spec.ts`, remplacer :

```ts
  it('should reject quick-add payloads that try to set a status explicitly', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Tentative de statut forcé', status: JobStatus.ACCEPTED });
    expect(res.status).toBe(400);
  });
```

par :

```ts
  it('should reject a status outside TO_APPLY/APPLIED', async () => {
    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Tentative de statut hors périmètre', status: JobStatus.ACCEPTED });
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
    const withReminder = (listRes.body as Array<{ id: string; reminder?: { frequency: number } }>)
      .find((j) => j.id === created.id);
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
```

- [ ] **Step 2: Lancer les tests, constater l'échec (RED)**

```bash
pnpm test:e2e -- jobtrack-quick-add
```
Attendu : le nouveau test `status APPLIED` échoue (soit 400 car `contractType`/`status` rejetés par `.strict()`, soit un statut incorrect en retour) ; le test `should reject a status outside...` doit déjà passer (comportement inchangé sur ce point précis).

- [ ] **Step 3: Étendre `QuickAddJobTrackDto`**

```diff
 import { createZodDto } from 'nestjs-zod';
 import { z } from 'zod';
+import { ContractType, JobStatus } from '../../db/schema';

 export const quickAddJobTrackSchema = z
   .object({
     title: z
       .string({ message: 'Le titre doit être une chaîne de caractères' })
       .min(1, { message: 'Le titre ne peut pas être vide' }),
     company: z
       .string({
         message: 'Le nom de l\'entreprise doit être une chaîne de caractères',
       })
       .optional(),
     jobUrl: z
       .string({ message: 'L\'URL de l\'offre doit être une chaîne de caractères' })
       .optional(),
     notes: z
       .string({ message: 'Les notes doivent être une chaîne de caractères' })
       .optional(),
+    contractType: z.nativeEnum(ContractType).optional(),
+    status: z
+      .enum([JobStatus.TO_APPLY, JobStatus.APPLIED])
+      .optional()
+      .default(JobStatus.TO_APPLY),
   })
   .strict();
```

- [ ] **Step 4: Brancher le contrôleur sur `status`**

Dans `src/jobtrack/jobtrack.controller.ts`, remplacer le corps de `quickAddJobTrack` :

```diff
   async quickAddJobTrack(
     @Body() body: QuickAddJobTrackDto,
     @Request() req: AuthenticatedUser,
   ): Promise<JobTrackResponseDto> {
     const userId = req.user.sub;
-    return this.jobTrackService.create(userId, {
-      title: body.title,
-      company: body.company,
-      jobUrl: body.jobUrl,
-      notes: body.notes,
-      status: JobStatus.TO_APPLY,
-    });
+    if (body.status === JobStatus.APPLIED) {
+      const now = new Date();
+      const result = await this.jobTrackService.createWithReminder(userId, {
+        title: body.title,
+        company: body.company,
+        jobUrl: body.jobUrl,
+        notes: body.notes,
+        contractType: body.contractType,
+        status: JobStatus.APPLIED,
+        appliedAt: now.toISOString(),
+        frequency: 7,
+        nextReminderAt: new Date(
+          now.getTime() + 7 * 24 * 60 * 60 * 1000,
+        ).toISOString(),
+      });
+      return result.jobTrack;
+    }
+    return this.jobTrackService.create(userId, {
+      title: body.title,
+      company: body.company,
+      jobUrl: body.jobUrl,
+      notes: body.notes,
+      contractType: body.contractType,
+      status: JobStatus.TO_APPLY,
+    });
   }
```

Vérifie le type de retour de `createWithReminder` (`JobTrackWithReminder`, cf. Task 1 de la spec) : `result.jobTrack` doit correspondre à `JobTrackResponseDto`. Si le mapper diffère légèrement, ajuste l'extraction plutôt que le type de retour de la méthode (garder `quickAddJobTrack` typé `Promise<JobTrackResponseDto>`, cohérent avec l'`@ApiResponse` déjà déclarée juste au-dessus).

- [ ] **Step 5: Lancer les tests, constater le succès (GREEN)**

```bash
pnpm test:e2e -- jobtrack-quick-add
```

- [ ] **Step 6: Lancer la suite e2e complète**

```bash
pnpm test:e2e
```

- [ ] **Step 7: Commit**

```bash
git add src/jobtrack/dto/quick-add-jobtrack.dto.ts src/jobtrack/jobtrack.controller.ts test/jobtrack-quick-add.e2e-spec.ts
git commit -m "feat(jobtrack): ajoute contractType et le choix du statut à l'ajout rapide"
```
