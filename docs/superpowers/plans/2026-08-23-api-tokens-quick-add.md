# API Tokens + Quick-Add JobTrack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend mechanism for the future Chrome extension to authenticate independently of the web session cookie, and a minimal endpoint to create a "spotted" job posting from it.

**Architecture:** New `Jetons` (api_tokens) table + `ApiTokensModule` (create/list/revoke, guarded by the existing `JwtAuthGuard` — web session only) + new standalone `ApiTokenGuard` (sha256 lookup on `Authorization: Bearer ctok_...`) protecting a new `POST /jobtrack/quick-add` route that forces the new `TO_APPLY` job status.

**Tech Stack:** NestJS 11, Drizzle ORM (`drizzle-orm/node-postgres`), `nestjs-zod` for request DTOs, Jest e2e tests (`test/*.e2e-spec.ts`) against a real dev Postgres database — this codebase has no mocked-service unit tests for guards/controllers, only e2e; follow that existing convention.

**Spec:** `../../../chrome-candidash-extension/docs/superpowers/specs/2026-08-23-quick-add-extension-design.md` (in the sibling `chrome-candidash-extension` repo)

## Global Constraints

- Never modify `JwtAuthGuard` or the cookie-only session auth — the new `ApiTokenGuard` is fully independent.
- `quick-add`'s request DTO must be `.strict()` and must NOT declare a `status` field — a client attempting to send one gets a 400 (unknown-key rejection), not a silently-ignored field. Status is always forced server-side to `TO_APPLY`.
- Token secrets: `crypto.randomBytes(32)` prefixed `ctok_`, stored only as a sha256 hex hash (indexed, unique) — never store or log the plaintext after the creation response.
- French for table/column names, comments, and commit messages, matching the rest of the codebase (`CLAUDE.md`).
- All new endpoints live under the existing global prefix `/api/v1` (already configured in `main.ts` / e2e test harness).

---

## Task 1: Database schema — `Jetons` table + `TO_APPLY` status

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces: `apiTokens` table, `ApiTokenRow` type, `JobStatus.TO_APPLY` value — consumed by Task 2 and Task 3.

This task has no Jest red/green cycle (it's schema DDL) — verification is a manual DB check at the end, per Step 5.

- [ ] **Step 1: Edit the `JobStatus` enum**

In `src/db/schema.ts`, find:

```ts
export const jobStatusEnum = pgEnum('JobStatus', [
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'ACCEPTED',
]);
```

Replace with:

```ts
export const jobStatusEnum = pgEnum('JobStatus', [
  'TO_APPLY',
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'ACCEPTED',
]);
```

Then find:

```ts
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export const JobStatus = {
  APPLIED: 'APPLIED',
  INTERVIEW: 'INTERVIEW',
  REJECTED: 'REJECTED',
  ACCEPTED: 'ACCEPTED',
} as const satisfies Record<string, JobStatus>;
```

Replace with:

```ts
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export const JobStatus = {
  TO_APPLY: 'TO_APPLY',
  APPLIED: 'APPLIED',
  INTERVIEW: 'INTERVIEW',
  REJECTED: 'REJECTED',
  ACCEPTED: 'ACCEPTED',
} as const satisfies Record<string, JobStatus>;
```

- [ ] **Step 2: Add the `Jetons` (api_tokens) table**

In `src/db/schema.ts`, immediately after the `reminders` table definition (before the `// ---------- UserTracking` comment block), add:

```ts
// ---------- Jetons d'API (ApiToken) — auth indépendante pour l'extension navigateur ----------
export const apiTokens = pgTable(
  'Jetons',
  {
    id: idCol(),
    userId: text('userId').notNull(),
    nomAffiche: text('nomAffiche').notNull(),
    tokenHash: text('tokenHash').notNull(),
    derniereUtilisation: ts('derniereUtilisation'),
    createdAt: ts('createdAt').notNull().defaultNow(),
    revokedAt: ts('revokedAt'),
  },
  (t) => [
    uniqueIndex('Jetons_tokenHash_key').on(t.tokenHash),
    index('Jetons_userId_idx').on(t.userId),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: 'Jetons_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
);
```

- [ ] **Step 3: Add the relation and the inferred row type**

In `src/db/schema.ts`, find:

```ts
export const usersRelations = relations(users, ({ many }) => ({
  jobTracks: many(jobTracks),
  userTracking: many(userTracking),
}));
```

Replace with:

```ts
export const usersRelations = relations(users, ({ many }) => ({
  jobTracks: many(jobTracks),
  userTracking: many(userTracking),
  apiTokens: many(apiTokens),
}));
```

Then, right after `userTrackingRelations` (before the `// ---------- Types inférés` comment), add:

```ts
export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, { fields: [apiTokens.userId], references: [users.id] }),
}));
```

Finally, find:

```ts
export type UserRow = typeof users.$inferSelect;
export type JobTrackRow = typeof jobTracks.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type PendingUserRow = typeof pendingUsers.$inferSelect;
export type VerificationCodeRow = typeof verificationCodes.$inferSelect;
```

Replace with:

```ts
export type UserRow = typeof users.$inferSelect;
export type JobTrackRow = typeof jobTracks.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type PendingUserRow = typeof pendingUsers.$inferSelect;
export type VerificationCodeRow = typeof verificationCodes.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate`

This creates a new file `drizzle/000X_<generated_name>.sql`. Open it and check two things against the project's idempotent-migration convention (`CLAUDE.md`: "DDL idempotent... pour migrations rejouables", see `drizzle/0000_baseline.sql` for the pattern):

1. The `CREATE TABLE` statement for `"Jetons"` should read `CREATE TABLE IF NOT EXISTS "Jetons" (...)`. If drizzle-kit generated it without `IF NOT EXISTS`, add it by hand.
2. The `ALTER TYPE "JobStatus" ADD VALUE 'TO_APPLY';` statement drizzle-kit generates must be rewritten to:

```sql
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'TO_APPLY' BEFORE 'APPLIED';
```

Also check the foreign key statement — it should follow the existing pattern:

```sql
DO $$ BEGIN ALTER TABLE "Jetons" ADD CONSTRAINT "Jetons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Utilisateurs"("id") ON DELETE cascade ON UPDATE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
```

And the indexes should use `IF NOT EXISTS`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "Jetons_tokenHash_key" ON "Jetons" USING btree ("tokenHash");
CREATE INDEX IF NOT EXISTS "Jetons_userId_idx" ON "Jetons" USING btree ("userId");
```

**Postgres note:** `ALTER TYPE ... ADD VALUE` cannot run in the same transaction as a statement that *uses* the new value — since this migration file only adds the value and does nothing else with it, this is safe as its own migration.

- [ ] **Step 5: Apply the migration and verify**

Run: `pnpm db:migrate`

Then verify directly against the dev database:

```bash
psql "$DATABASE_URL" -c "SELECT unnest(enum_range(NULL::\"JobStatus\"));"
psql "$DATABASE_URL" -c "\d \"Jetons\""
```

Expected: the enum list includes `TO_APPLY` (before `APPLIED`), and `\d "Jetons"` shows the table with columns `id, userId, nomAffiche, tokenHash, derniereUtilisation, createdAt, revokedAt` plus the unique index on `tokenHash` and the foreign key to `Utilisateurs`.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): ajoute le statut TO_APPLY et la table Jetons (api tokens)"
```

---

## Task 2: `ApiTokensModule` — génération / liste / révocation

**Files:**
- Create: `src/api-tokens/interfaces/api-token.interface.ts`
- Create: `src/api-tokens/interfaces/index.ts`
- Create: `src/api-tokens/mappers/api-token.mapper.ts`
- Create: `src/api-tokens/dto/create-api-token.dto.ts`
- Create: `src/api-tokens/dto/api-token-response.dto.ts`
- Create: `src/api-tokens/dto/api-token-created-response.dto.ts`
- Create: `src/api-tokens/api-tokens.service.ts`
- Create: `src/api-tokens/api-tokens.controller.ts`
- Create: `src/api-tokens/api-tokens.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/api-tokens.e2e-spec.ts`

**Interfaces:**
- Consumes: `apiTokens` table + `ApiTokenRow` from Task 1 (`src/db/schema.ts`); `DrizzleService` (`src/db/drizzle.service.ts`, global); `JwtAuthGuard` (`src/auth/guard/jwt-auth.guard.ts`); `AuthenticatedUser` (`src/auth/interfaces`, shape `{ user: { sub: string } }`).
- Produces: `ApiTokensService.create(userId: string, nomAffiche: string): Promise<ApiTokenCreated>`, `ApiTokensService.findAllActiveByUser(userId: string): Promise<ApiToken[]>`, `ApiTokensService.revoke(id: string, userId: string): Promise<void>` — Task 3 does not consume these directly but the pattern (and the `Jetons` table) is shared.

- [ ] **Step 1: Write the failing e2e test**

Create `test/api-tokens.e2e-spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:e2e -- --testPathPattern=api-tokens`
Expected: FAIL — `/api/v1/api-tokens` doesn't exist yet (404).

- [ ] **Step 3: Create the interfaces**

Create `src/api-tokens/interfaces/api-token.interface.ts`:

```ts
export interface ApiToken {
  id: string;
  userId: string;
  nomAffiche: string;
  createdAt: Date;
  derniereUtilisation?: Date;
}

export interface ApiTokenCreated extends ApiToken {
  token: string;
}
```

Create `src/api-tokens/interfaces/index.ts`:

```ts
export * from './api-token.interface';
```

- [ ] **Step 4: Create the mapper**

Create `src/api-tokens/mappers/api-token.mapper.ts`:

```ts
import { ApiTokenRow } from '../../db/schema';
import { ApiToken } from '../interfaces';

export class ApiTokenMapper {
  static mapApiTokenToApiToken(row: ApiTokenRow): ApiToken {
    return {
      id: row.id,
      userId: row.userId,
      nomAffiche: row.nomAffiche,
      createdAt: row.createdAt,
      derniereUtilisation: row.derniereUtilisation ?? undefined,
    };
  }
}
```

- [ ] **Step 5: Create the DTOs**

Create `src/api-tokens/dto/create-api-token.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createApiTokenSchema = z
  .object({
    nomAffiche: z
      .string({ message: 'Le nom du jeton doit être une chaîne de caractères' })
      .min(1, { message: 'Le nom du jeton ne peut pas être vide' })
      .default('Extension Chrome'),
  })
  .strict();

export class CreateApiTokenDto extends createZodDto(createApiTokenSchema) {}
```

Create `src/api-tokens/dto/api-token-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class ApiTokenResponseDto {
  @ApiProperty({ description: "Identifiant du jeton d'API" })
  id: string;

  @ApiProperty({
    description: 'Nom affiché du jeton',
    example: 'Extension Chrome',
  })
  nomAffiche: string;

  @ApiProperty({ description: 'Date de création' })
  createdAt: Date;

  @ApiProperty({
    description: 'Date de dernière utilisation',
    nullable: true,
  })
  derniereUtilisation?: Date;
}
```

Create `src/api-tokens/dto/api-token-created-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ApiTokenResponseDto } from './api-token-response.dto';

export class ApiTokenCreatedResponseDto extends ApiTokenResponseDto {
  @ApiProperty({
    description:
      "Secret en clair du jeton — affiché une seule fois, jamais renvoyé ensuite",
    example: 'ctok_3f9a1b2c...',
  })
  token: string;
}
```

- [ ] **Step 6: Create the service**

Create `src/api-tokens/api-tokens.service.ts`:

```ts
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { apiTokens } from '../db/schema';
import { ApiToken, ApiTokenCreated } from './interfaces';
import { ApiTokenMapper } from './mappers/api-token.mapper';

const TOKEN_PREFIX = 'ctok_';

@Injectable()
export class ApiTokensService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(userId: string, nomAffiche: string): Promise<ApiTokenCreated> {
    const secret = TOKEN_PREFIX + randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(secret).digest('hex');

    const [row] = await this.drizzle.db
      .insert(apiTokens)
      .values({ userId, nomAffiche, tokenHash })
      .returning();

    return { ...ApiTokenMapper.mapApiTokenToApiToken(row), token: secret };
  }

  async findAllActiveByUser(userId: string): Promise<ApiToken[]> {
    const rows = await this.drizzle.db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .orderBy(desc(apiTokens.createdAt));

    return rows.map((r) => ApiTokenMapper.mapApiTokenToApiToken(r));
  }

  async revoke(id: string, userId: string): Promise<void> {
    const [row] = await this.drizzle.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, id));

    if (!row) {
      throw new NotFoundException("Jeton d'API introuvable");
    }
    if (row.userId !== userId) {
      throw new ForbiddenException("Accès refusé à ce jeton d'API");
    }

    await this.drizzle.db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(apiTokens.id, id));
  }
}
```

- [ ] **Step 7: Create the controller**

Create `src/api-tokens/api-tokens.controller.ts`:

```ts
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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { ApiTokensService } from './api-tokens.service';
import { CreateApiTokenDto } from './dto/create-api-token.dto';
import { ApiTokenResponseDto } from './dto/api-token-response.dto';
import { ApiTokenCreatedResponseDto } from './dto/api-token-created-response.dto';
import type { AuthenticatedUser } from '../auth/interfaces';

@ApiTags('ApiTokens')
@Controller('api-tokens')
export class ApiTokensController {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  @Post()
  @ApiOperation({
    summary: "Générer un nouveau jeton d'API (ex. extension navigateur)",
  })
  @ApiResponse({
    status: 201,
    description: 'Jeton créé, secret affiché une seule fois',
    type: ApiTokenCreatedResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: CreateApiTokenDto,
    @Request() req: AuthenticatedUser,
  ): Promise<ApiTokenCreatedResponseDto> {
    return this.apiTokensService.create(req.user.sub, body.nomAffiche);
  }

  @Get()
  @ApiOperation({ summary: "Lister les jetons d'API actifs" })
  @ApiResponse({
    status: 200,
    description: 'Liste des jetons actifs (sans le secret)',
    type: [ApiTokenResponseDto],
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Request() req: AuthenticatedUser,
  ): Promise<ApiTokenResponseDto[]> {
    return this.apiTokensService.findAllActiveByUser(req.user.sub);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: "Révoquer un jeton d'API" })
  @ApiParam({ name: 'id', description: 'Identifiant du jeton' })
  @ApiResponse({ status: 200, description: 'Jeton révoqué' })
  @ApiResponse({ status: 403, description: 'Accès refusé à ce jeton' })
  @ApiResponse({ status: 404, description: 'Jeton introuvable' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async revoke(
    @Param('id') id: string,
    @Request() req: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.apiTokensService.revoke(id, req.user.sub);
    return { message: 'Jeton révoqué' };
  }
}
```

- [ ] **Step 8: Create the module and wire it into `AppModule`**

Create `src/api-tokens/api-tokens.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ApiTokensController } from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';

@Module({
  controllers: [ApiTokensController],
  providers: [ApiTokensService],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
```

In `src/app.module.ts`, add the import:

```ts
import { ApiTokensModule } from './api-tokens/api-tokens.module';
```

And add `ApiTokensModule` to the `imports` array (next to `JobTrackModule`):

```ts
    DrizzleModule,
    UsersModule,
    AuthModule,
    JobTrackModule,
    ApiTokensModule,
    SchedulerModule,
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm test:e2e -- --testPathPattern=api-tokens`
Expected: PASS (5 tests).

- [ ] **Step 10: Commit**

```bash
git add src/api-tokens src/app.module.ts test/api-tokens.e2e-spec.ts
git commit -m "feat(api-tokens): ajoute la génération/liste/révocation de jetons d'API"
```

---

## Task 3: `ApiTokenGuard` + `POST /jobtrack/quick-add`

**Files:**
- Create: `src/auth/guard/api-token.guard.ts`
- Create: `src/jobtrack/dto/quick-add-jobtrack.dto.ts`
- Modify: `src/jobtrack/jobtrack.controller.ts`
- Test: `test/jobtrack-quick-add.e2e-spec.ts`

**Interfaces:**
- Consumes: `apiTokens` table (Task 1), `ApiTokensService.create`/`.revoke` via the `POST /api-tokens` and `DELETE /api-tokens/:id` routes (Task 2, used only by the test to obtain/revoke a real token); `JobTrackService.create(userId: string, dto: CreateJobTrackDto): Promise<JobTrack>` (existing, `src/jobtrack/jobtrack.service.ts`); `DrizzleService` (global).
- Produces: `ApiTokenGuard` (usable via `@UseGuards(ApiTokenGuard)` anywhere, same DI pattern as `JwtAuthGuard`), `POST /jobtrack/quick-add`.

- [ ] **Step 1: Write the failing e2e test**

Create `test/jobtrack-quick-add.e2e-spec.ts`:

```ts
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
    apiToken = (tokenRes.body as ApiTokenCreatedResponseDto).token;
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
    const listRes = await api(httpServer)
      .get('/api/v1/api-tokens')
      .set('Cookie', authCookies);
    const tokenId = (listRes.body as { id: string }[])[0].id;
    await api(httpServer)
      .delete(`/api/v1/api-tokens/${tokenId}`)
      .set('Cookie', authCookies);

    const res = await api(httpServer)
      .post('/api/v1/jobtrack/quick-add')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ title: 'Après révocation' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:e2e -- --testPathPattern=jobtrack-quick-add`
Expected: FAIL — `/api/v1/jobtrack/quick-add` doesn't exist yet (404).

- [ ] **Step 3: Create `ApiTokenGuard`**

Create `src/auth/guard/api-token.guard.ts`:

```ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request as ExpressRequest } from 'express';
import { DrizzleService } from '../../db/drizzle.service';
import { apiTokens } from '../../db/schema';

interface RequestWithUser extends ExpressRequest {
  user?: { sub: string };
}

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly drizzle: DrizzleService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("Jeton d'API manquant");
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const [row] = await this.drizzle.db
      .select()
      .from(apiTokens)
      .where(
        and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)),
      )
      .limit(1);

    if (!row) {
      throw new UnauthorizedException("Jeton d'API invalide ou révoqué");
    }

    await this.drizzle.db
      .update(apiTokens)
      .set({ derniereUtilisation: new Date() })
      .where(eq(apiTokens.id, row.id));

    request.user = { sub: row.userId };
    return true;
  }

  private extractBearerToken(request: RequestWithUser): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : undefined;
  }
}
```

**Note on DI:** this guard is used directly as `@UseGuards(ApiTokenGuard)` without being registered in any module's `providers` array, exactly like `JwtAuthGuard` is used today in `JobTrackController` without `JobTrackModule` importing `AuthModule`. This works because its only dependency, `DrizzleService`, comes from the `@Global()` `DrizzleModule`.

- [ ] **Step 4: Create the quick-add DTO**

Create `src/jobtrack/dto/quick-add-jobtrack.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const quickAddJobTrackSchema = z
  .object({
    title: z
      .string({ message: 'Le titre doit être une chaîne de caractères' })
      .min(1, { message: 'Le titre ne peut pas être vide' }),
    company: z
      .string({
        message: 'Le nom de l’entreprise doit être une chaîne de caractères',
      })
      .optional(),
    jobUrl: z
      .string({ message: 'L’URL de l’offre doit être une chaîne de caractères' })
      .optional(),
    notes: z
      .string({ message: 'Les notes doivent être une chaîne de caractères' })
      .optional(),
  })
  .strict();

export class QuickAddJobTrackDto extends createZodDto(quickAddJobTrackSchema) {}
```

- [ ] **Step 5: Add the controller route**

In `src/jobtrack/jobtrack.controller.ts`, add the import (next to the other guard import):

```ts
import { ApiTokenGuard } from '../auth/guard/api-token.guard';
import { QuickAddJobTrackDto } from './dto/quick-add-jobtrack.dto';
import { JobStatus } from '../db/schema';
```

(`JobStatus` is already imported in this file for `@ApiParam({ enum: JobStatus })` — do not duplicate the import, just reuse it.)

Then add this method inside `JobTrackController`, right after the `createJobTrackWithReminder` method:

```ts
  @Post('quick-add')
  @ApiOperation({
    summary: "Ajout rapide d'une annonce (extension navigateur)",
  })
  @ApiResponse({
    status: 201,
    description: 'Annonce créée avec le statut "Repérée"',
    type: JobTrackResponseDto,
  })
  @UseGuards(ApiTokenGuard)
  async quickAddJobTrack(
    @Body() body: QuickAddJobTrackDto,
    @Request() req: AuthenticatedUser,
  ): Promise<JobTrackResponseDto> {
    const userId = req.user.sub;
    return this.jobTrackService.create(userId, {
      title: body.title,
      company: body.company,
      jobUrl: body.jobUrl,
      notes: body.notes,
      status: JobStatus.TO_APPLY,
    });
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test:e2e -- --testPathPattern=jobtrack-quick-add`
Expected: PASS (5 tests).

- [ ] **Step 7: Run the full test suite and lint**

Run: `pnpm test:e2e && pnpm lint && pnpm build`
Expected: all green — this confirms Task 1/2/3 didn't regress the existing `jobtrack-reminder.e2e-spec.ts` or `app.e2e-spec.ts` suites.

- [ ] **Step 8: Commit**

```bash
git add src/auth/guard/api-token.guard.ts src/jobtrack test/jobtrack-quick-add.e2e-spec.ts
git commit -m "feat(jobtrack): ajoute ApiTokenGuard et POST /jobtrack/quick-add"
```
