# Migration Prisma → Drizzle + validation Zod — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer Prisma 7 par Drizzle ORM (driver `node-postgres`) et class-validator par Zod (`nestjs-zod`) dans `nest-candidash-app`, sans perte de données ni régression d'API, sur une base de production déjà en ligne.

**Architecture :** Une couche `src/db/` (schéma Drizzle introspecté + `DrizzleService` global) remplace `src/prisma/` à l'identique côté injection. Les 6 services sont réécrits méthode par méthode en conservant signatures et exceptions Nest. Les ~13 DTOs deviennent des schémas Zod via `createZodDto`. Les migrations sont baselisées (`__drizzle_migrations` marqué appliqué) pour que `drizzle-kit migrate` au boot soit un no-op sur une base déjà au schéma courant.

**Tech Stack :** NestJS 11, TypeScript 5.7, `drizzle-orm` + `drizzle-kit`, `pg` (déjà présent), `nestjs-zod` + `zod`, PostgreSQL 18, Docker/Podman pour la base de test locale.

**Convention J-Ned :** ne jamais exécuter `git add` / `git commit`. À chaque étape « Commit », **proposer** le message à l'utilisateur ; il committe lui-même. Repo Angular `ng-candidash-app` **non touché**.

---

## File Structure

**Créés :**
- `drizzle.config.ts` — config drizzle-kit (introspection + génération baseline).
- `src/db/schema.ts` — 8 tables + 3 enums + `relations()`. Source de vérité du modèle.
- `src/db/drizzle.service.ts` — `@Injectable()` détenant `Pool` pg + instance `db`.
- `src/db/drizzle.module.ts` — `@Global()`, fournit/exporte `DrizzleService`.
- `drizzle/` — dossier de migrations généré (baseline).
- `scripts/restore-local-db.sh` — restaure le dump dans un Postgres local jetable.

**Modifiés :**
- 6 services (`users`, `jobtrack`, `document`, `pending-user`, `verification`, `reminder-automation`).
- 4 mappers/interfaces (`user.mapper`, `user.interface`, `jobtrack.mapper`, `jobtrack.interface`, `reminder.interface`) — re-typage Drizzle.
- ~13 DTOs d'entrée + 4 DTOs de réponse (imports d'enums).
- 2 controllers (`jobtrack.controller`, `users.controller`) — retrait des `@Body(ValidationPipe)`.
- `src/main.ts` — `ZodValidationPipe` global + `patchNestjsSwagger()`.
- `src/app.module.ts` — `PrismaModule` → `DrizzleModule`.
- `Dockerfile`, `package.json`.

**Supprimés (phase finale) :**
- `src/prisma/`, `src/generated/`, `prisma/`, `prisma.config.ts`.

---

## PHASE 0 — Base de test locale + filet de sécurité

### Task 0.1 : Restaurer le dump dans un Postgres local jetable

**Files:**
- Create: `scripts/restore-local-db.sh`

- [ ] **Step 1 : Écrire le script de restauration**

`scripts/restore-local-db.sh` :
```bash
#!/usr/bin/env bash
set -euo pipefail

# Postgres local jetable pour tester la migration Drizzle sans toucher la prod.
DUMP="${1:-$HOME/Bureau/candidash_db_2026-05-30_102657.dump}"
CONTAINER="candidash-migr-test"
PORT=5456
PASS="testpass"

# Utilise docker, sinon podman.
DOCKER="$(command -v docker || command -v podman)"

"$DOCKER" rm -f "$CONTAINER" 2>/dev/null || true
"$DOCKER" run -d --name "$CONTAINER" \
  -e POSTGRES_USER=djoudj \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_DB=candidash_db \
  -p "$PORT:5432" postgres:18

echo "Attente du démarrage de Postgres..."
until "$DOCKER" exec "$CONTAINER" pg_isready -U djoudj -d candidash_db >/dev/null 2>&1; do
  sleep 1
done

# Restauration (le dump contient déjà le schéma + données ; --clean --if-exists pour idempotence).
"$DOCKER" exec -i "$CONTAINER" pg_restore --clean --if-exists --no-owner -U djoudj -d candidash_db < "$DUMP" || true

echo "Base restaurée sur postgresql://djoudj:$PASS@localhost:$PORT/candidash_db"
echo "Tables :"
"$DOCKER" exec "$CONTAINER" psql -U djoudj -d candidash_db -c '\dt'
```

- [ ] **Step 2 : Rendre exécutable et lancer**

Run :
```bash
chmod +x scripts/restore-local-db.sh
./scripts/restore-local-db.sh
```
Expected : liste des 7 tables (`Annonces`, `CodesVerification`, `Relance`, `UserTracking`, `Utilisateurs`, `UtilisateursEnAttente`, `_prisma_migrations`).

- [ ] **Step 3 : Créer un `.env.test.local` pointant sur cette base**

`.env.test.local` (ne PAS committer — ajouter à `.gitignore` si absent) :
```
DATABASE_URL="postgresql://djoudj:testpass@localhost:5456/candidash_db?schema=public"
```

- [ ] **Step 4 : Établir l'état de référence (avant toute modif)**

Run :
```bash
pnpm install
pnpm build
```
Expected : build OK (référence « vert » avec Prisma encore en place). Noter le résultat ; c'est l'état à reproduire après migration.

- [ ] **Step 5 : Commit (proposer le message)**

Message proposé :
```
chore(db): script de restauration base de test locale pour migration Drizzle
```

---

## PHASE 1 — Couche Drizzle (cohabite avec Prisma)

### Task 1.1 : Installer Drizzle et configurer drizzle-kit

**Files:**
- Create: `drizzle.config.ts`
- Modify: `package.json` (scripts + deps)

- [ ] **Step 1 : Installer les dépendances**

Run :
```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```
Expected : `drizzle-orm` en dependencies, `drizzle-kit` en devDependencies. (`pg` et `@types/pg` sont déjà présents — on les réutilise.)

- [ ] **Step 2 : Créer `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Les tables portent des noms français ; on ne filtre rien.
  verbose: true,
  strict: true,
});
```

- [ ] **Step 3 : Ajouter les scripts npm**

Dans `package.json`, ajouter aux `scripts` :
```json
"db:pull": "drizzle-kit pull",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 4 : Commit (proposer le message)**

```
build(db): ajoute drizzle-orm + drizzle-kit et la config drizzle
```

### Task 1.2 : Introspecter la base pour valider les types réels

**Files:**
- Create (temporaire) : `src/db/_introspected/` (sortie de pull, sert de référence à comparer)

- [ ] **Step 1 : Lancer l'introspection sur la base de test locale**

Run :
```bash
set -a; source .env.test.local; set +a
pnpm drizzle-kit pull --config=drizzle.config.ts
```
Note : si `pull` écrit dans `./drizzle`, déplacer le `schema.ts` généré en `src/db/_introspected/schema.generated.ts` pour le garder comme **référence terrain** (types de colonnes, noms d'enums, index réels). Ne PAS l'utiliser tel quel en prod (noms de variables français bruts).

Expected : un `schema.generated.ts` listant les 6 tables applicatives + enums `Role`, `JobStatus`, `ContractType`. **Vérifier** que `JobStatus` = `['APPLIED','INTERVIEW','REJECTED','ACCEPTED']` (l'historique de migration était tordu ; c'est ici qu'on confirme l'état réel).

- [ ] **Step 2 : Croiser avec le schéma cible (Task 1.3)**

Comparer types et nullabilité colonne par colonne entre `schema.generated.ts` et le schéma cible ci-dessous. Tout écart (type, nullable, nom d'enum, nom d'index) → corriger le schéma cible pour matcher la **réalité de la base**, pas ce plan.

- [ ] **Step 3 : Pas de commit** (fichier de référence, supprimé en Phase 4).

### Task 1.3 : Écrire `src/db/schema.ts` (schéma cible)

**Files:**
- Create: `src/db/schema.ts`

- [ ] **Step 1 : Écrire le schéma complet**

> Noms d'export propres (`users`, `jobTracks`, …) mais `pgTable('NomFrançais', …)` pour matcher la base. `id` et `updatedAt` reçoivent la génération côté app (la base n'a pas de default SQL dessus — comportement hérité de Prisma).

```ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// ---------- Enums (noms = types PG réels, confirmés par drizzle-kit pull) ----------
export const roleEnum = pgEnum('Role', ['ADMIN', 'USER']);
export const jobStatusEnum = pgEnum('JobStatus', [
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'ACCEPTED',
]);
export const contractTypeEnum = pgEnum('ContractType', [
  'CDI',
  'CDD',
  'INTERIM',
  'STAGE',
  'ALTERNANCE',
  'FREELANCE',
]);

const ts = (name: string) =>
  timestamp(name, { precision: 3, mode: 'date', withTimezone: false });

// id TEXT sans default SQL → généré côté app (parité Prisma @default(uuid())).
const idCol = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

// updatedAt NOT NULL sans default SQL → géré côté app (parité Prisma @updatedAt).
const updatedAtCol = () =>
  ts('updatedAt')
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

// ---------- Utilisateurs (User) ----------
export const users = pgTable(
  'Utilisateurs',
  {
    id: idCol(),
    email: text('email').notNull(),
    username: text('username'),
    password: text('password').notNull(),
    role: roleEnum('role').notNull().default('USER'),
    refreshToken: text('refreshToken'),
    refreshTokenExpires: ts('refreshTokenExpires'),
    resetPasswordToken: text('resetPasswordToken'),
    resetPasswordExpires: ts('resetPasswordExpires'),
    totpSecret: text('totpSecret'),
    totpEnabled: boolean('totpEnabled').notNull().default(false),
    totpRecoveryCodes: text('totpRecoveryCodes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [
    uniqueIndex('Utilisateurs_email_key').on(t.email),
    index('Utilisateurs_resetPasswordToken_idx').on(t.resetPasswordToken),
  ],
);

// ---------- Annonces (JobTrack) ----------
export const jobTracks = pgTable(
  'Annonces',
  {
    id: idCol(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    title: text('title').notNull(),
    company: text('company'),
    jobUrl: text('jobUrl'),
    appliedAt: ts('appliedAt'),
    status: jobStatusEnum('status').notNull().default('APPLIED'),
    contractType: contractTypeEnum('contractType'),
    notes: text('notes'),
    cvFileName: text('cvFileName'),
    lmFileName: text('lmFileName'),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [index('Annonces_userId_idx').on(t.userId)],
);

// ---------- Relance (Reminder) ----------
export const reminders = pgTable(
  'Relance',
  {
    id: idCol(),
    jobTrackId: text('jobTrackId')
      .notNull()
      .references(() => jobTracks.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    frequency: integer('frequency').notNull(),
    nextReminderAt: ts('nextReminderAt').notNull(),
    lastSentAt: ts('lastSentAt'),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [
    index('Relance_jobTrackId_idx').on(t.jobTrackId),
    index('Relance_isActive_nextReminderAt_idx').on(
      t.isActive,
      t.nextReminderAt,
    ),
  ],
);

// ---------- UserTracking (non utilisé en code, présent pour parité schéma) ----------
export const userTracking = pgTable(
  'UserTracking',
  {
    id: idCol(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    totalApplications: integer('totalApplications').notNull().default(0),
    totalRemindersSent: integer('totalRemindersSent').notNull().default(0),
    applicationsPerStatus: jsonb('applicationsPerStatus')
      .notNull()
      .default({}),
    lastActionAt: ts('lastActionAt'),
    responseRate: doublePrecision('responseRate').default(0),
    remindersEffectiveness: doublePrecision('remindersEffectiveness').default(0),
    avgResponseTime: doublePrecision('avgResponseTime').default(0),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [index('UserTracking_userId_idx').on(t.userId)],
);

// ---------- CodesVerification (VerificationCode) ----------
export const verificationCodes = pgTable(
  'CodesVerification',
  {
    id: idCol(),
    email: text('email').notNull(),
    code: text('code').notNull(),
    expiresAt: ts('expiresAt').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [uniqueIndex('CodesVerification_email_key').on(t.email)],
);

// ---------- UtilisateursEnAttente (PendingUser) ----------
export const pendingUsers = pgTable(
  'UtilisateursEnAttente',
  {
    id: idCol(),
    email: text('email').notNull(),
    username: text('username'),
    password: text('password').notNull(),
    verified: boolean('verified').notNull().default(false),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [uniqueIndex('UtilisateursEnAttente_email_key').on(t.email)],
);

// ---------- Relations (pour db.query.*.findMany({ with })) ----------
export const usersRelations = relations(users, ({ many }) => ({
  jobTracks: many(jobTracks),
  userTracking: many(userTracking),
}));

export const jobTracksRelations = relations(jobTracks, ({ one, many }) => ({
  user: one(users, { fields: [jobTracks.userId], references: [users.id] }),
  reminders: many(reminders),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  jobtrack: one(jobTracks, {
    fields: [reminders.jobTrackId],
    references: [jobTracks.id],
  }),
}));

export const userTrackingRelations = relations(userTracking, ({ one }) => ({
  user: one(users, { fields: [userTracking.userId], references: [users.id] }),
}));

// ---------- Types inférés (remplacent les types Prisma) ----------
export type UserRow = typeof users.$inferSelect;
export type JobTrackRow = typeof jobTracks.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type PendingUserRow = typeof pendingUsers.$inferSelect;
export type VerificationCodeRow = typeof verificationCodes.$inferSelect;

export type Role = (typeof roleEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type ContractType = (typeof contractTypeEnum.enumValues)[number];
```

- [ ] **Step 2 : Vérifier la compilation isolée du schéma**

Run :
```bash
pnpm exec tsc --noEmit
```
Expected : aucune erreur liée à `src/db/schema.ts`. (Des erreurs Prisma résiduelles ailleurs sont normales à ce stade.)

- [ ] **Step 3 : Commit (proposer le message)**

```
feat(db): schéma Drizzle (8 tables, 3 enums, relations) aligné sur la base existante
```

### Task 1.4 : `DrizzleService` + `DrizzleModule`

**Files:**
- Create: `src/db/drizzle.service.ts`
- Create: `src/db/drizzle.module.ts`

- [ ] **Step 1 : Écrire `drizzle.service.ts`**

```ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  public readonly db: NodePgDatabase<typeof schema>;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    this.pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleInit(): Promise<void> {
    // Valide la connexion au démarrage (parité avec PrismaService.$connect()).
    const client = await this.pool.connect();
    client.release();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
```

- [ ] **Step 2 : Écrire `drizzle.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { DrizzleService } from './drizzle.service';

@Global()
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DrizzleModule {}
```

- [ ] **Step 3 : Brancher dans `app.module.ts` (en plus de Prisma, pas à la place encore)**

Dans `src/app.module.ts`, ajouter l'import et l'entrée `DrizzleModule` dans `imports` (laisser `PrismaModule` pour l'instant — cohabitation) :
```ts
import { DrizzleModule } from './db/drizzle.module';
// ... imports: [ ..., PrismaModule, DrizzleModule, ... ]
```

- [ ] **Step 4 : Vérifier le démarrage**

Run :
```bash
set -a; source .env.test.local; set +a
pnpm build && timeout 12 node dist/main.js || true
```
Expected : l'app démarre, logs Nest visibles, pas d'erreur `DATABASE_URL` ni de connexion pg. (Le `timeout` coupe le serveur.)

- [ ] **Step 5 : Commit (proposer le message)**

```
feat(db): DrizzleService + DrizzleModule global (driver node-postgres)
```

---

## PHASE 2 — Réécriture des services (un commit par service, build vert à chaque fois)

> Patron global pour chaque service : remplacer `constructor(private prisma: PrismaService)` par `constructor(private readonly drizzle: DrizzleService)`, et `this.prisma.<model>.<op>` par les équivalents Drizzle ci-dessous. Importer les helpers : `import { and, eq, gte, lte, lt, asc, desc, notInArray } from 'drizzle-orm';` et les tables depuis `../db/schema` (ajuster le chemin relatif). **Signatures publiques et exceptions Nest inchangées.**

### Task 2.1 : `verification.service.ts` (le plus simple — valide le patron upsert)

**Files:**
- Modify: `src/auth/services/verification.service.ts`

- [ ] **Step 1 : Réécrire le service**

```ts
import { Injectable } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle.service';
import { verificationCodes } from '../../db/schema';
import { EmailService } from './email.service';
import * as crypto from 'crypto';

@Injectable()
export class VerificationService {
  constructor(
    private readonly drizzle: DrizzleService,
    private emailService: EmailService,
  ) {}

  generateVerificationCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  async saveVerificationCode(email: string, code: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.drizzle.db
      .insert(verificationCodes)
      .values({ email, code, expiresAt, attempts: 0 })
      .onConflictDoUpdate({
        target: verificationCodes.email,
        set: { code, expiresAt, attempts: 0, updatedAt: new Date() },
      });
  }

  async verifyCode(email: string, code: string): Promise<boolean> {
    const verification = await this.drizzle.db.query.verificationCodes.findFirst(
      { where: eq(verificationCodes.email, email) },
    );

    if (!verification) {
      return false;
    }

    if (new Date() > verification.expiresAt) {
      await this.drizzle.db
        .delete(verificationCodes)
        .where(eq(verificationCodes.email, email));
      return false;
    }

    if (verification.attempts >= 5) {
      return false;
    }

    await this.drizzle.db
      .update(verificationCodes)
      .set({ attempts: verification.attempts + 1, updatedAt: new Date() })
      .where(eq(verificationCodes.email, email));

    if (verification.code === code) {
      await this.drizzle.db
        .delete(verificationCodes)
        .where(eq(verificationCodes.email, email));
      return true;
    }

    return false;
  }

  async cleanupExpiredCodes(): Promise<void> {
    await this.drizzle.db
      .delete(verificationCodes)
      .where(lt(verificationCodes.expiresAt, new Date()));
  }

  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    return this.emailService.sendVerificationEmail(email, code);
  }

  async canResendCode(email: string): Promise<boolean> {
    const verification = await this.drizzle.db.query.verificationCodes.findFirst(
      { where: eq(verificationCodes.email, email) },
    );

    if (!verification) {
      return true;
    }

    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

    return verification.updatedAt <= oneMinuteAgo;
  }
}
```

- [ ] **Step 2 : Build**

Run : `pnpm build`
Expected : OK (le reste du code en Prisma compile toujours).

- [ ] **Step 3 : Commit (proposer le message)**

```
refactor(auth): migre VerificationService de Prisma vers Drizzle
```

### Task 2.2 : `pending-user.service.ts`

**Files:**
- Modify: `src/auth/services/pending-user.service.ts`

- [ ] **Step 1 : Réécrire le service**

```ts
import { Injectable, ConflictException } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle.service';
import { pendingUsers, users } from '../../db/schema';
import { UsersService } from '../../users/users.service';
import * as bcrypt from 'bcryptjs';

export interface PendingUserData {
  email: string;
  password: string;
  username?: string;
}

@Injectable()
export class PendingUserService {
  constructor(
    private readonly drizzle: DrizzleService,
    private usersService: UsersService,
  ) {}

  async createPendingUser(userData: PendingUserData): Promise<void> {
    const existingUser = await this.usersService.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);

    await this.drizzle.db
      .insert(pendingUsers)
      .values({
        email: userData.email,
        password: hashedPassword,
        username: userData.username,
        verified: false,
      })
      .onConflictDoUpdate({
        target: pendingUsers.email,
        set: {
          password: hashedPassword,
          username: userData.username,
          verified: false,
          updatedAt: new Date(),
        },
      });
  }

  async validatePendingUser(email: string): Promise<void> {
    const pendingUser = await this.drizzle.db.query.pendingUsers.findFirst({
      where: eq(pendingUsers.email, email),
    });

    if (!pendingUser) {
      throw new Error('Utilisateur en attente introuvable');
    }

    await this.drizzle.db.insert(users).values({
      email: pendingUser.email,
      username: pendingUser.username,
      password: pendingUser.password, // déjà hashé bcrypt
      role: 'USER',
    });

    await this.drizzle.db
      .delete(pendingUsers)
      .where(eq(pendingUsers.email, email));
  }

  async cleanupExpiredPendingUsers(): Promise<void> {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    await this.drizzle.db
      .delete(pendingUsers)
      .where(lt(pendingUsers.createdAt, yesterday));
  }

  async findPendingUser(email: string): Promise<boolean> {
    const pendingUser = await this.drizzle.db.query.pendingUsers.findFirst({
      where: eq(pendingUsers.email, email),
    });
    return !!pendingUser;
  }
}
```

> Note : l'original faisait `findUnique` puis `update`/`create`. On simplifie en `onConflictDoUpdate` (même effet, atomique). Comportement public identique.

- [ ] **Step 2 : Build** — Run `pnpm build` — Expected : OK.

- [ ] **Step 3 : Commit**

```
refactor(auth): migre PendingUserService de Prisma vers Drizzle
```

### Task 2.3 : `document.service.ts`

**Files:**
- Modify: `src/jobtrack/document.service.ts`

- [ ] **Step 1 : Remplacer le constructeur et les 4 appels Prisma**

Changer le constructeur :
```ts
constructor(
  private readonly drizzle: DrizzleService,
  private readonly storage: StorageService,
  private readonly config: ConfigService,
) {}
```
Imports à ajouter en tête :
```ts
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { jobTracks } from '../db/schema';
```
Retirer `import { PrismaService } ...`.

`verifyOwnership` :
```ts
const jobTrack = await this.drizzle.db.query.jobTracks.findFirst({
  where: eq(jobTracks.id, jobTrackId),
  columns: { userId: true },
});
```

`uploadDocument` — la mise à jour du nom de fichier (le champ est dynamique `cvFileName`/`lmFileName`) :
```ts
const field = this.getFileNameField(type);
await this.drizzle.db
  .update(jobTracks)
  .set({ [field]: file.originalname, updatedAt: new Date() })
  .where(eq(jobTracks.id, jobTrackId));
```

`downloadDocument` et `deleteDocument` — lecture des noms de fichiers :
```ts
const jobTrack = await this.drizzle.db.query.jobTracks.findFirst({
  where: eq(jobTracks.id, jobTrackId),
  columns: { cvFileName: true, lmFileName: true },
});
```
`deleteDocument` — remise à null :
```ts
await this.drizzle.db
  .update(jobTracks)
  .set({ [this.getFileNameField(type)]: null, updatedAt: new Date() })
  .where(eq(jobTracks.id, jobTrackId));
```

- [ ] **Step 2 : Build** — Run `pnpm build` — Expected : OK.

- [ ] **Step 3 : Commit**

```
refactor(jobtrack): migre DocumentService de Prisma vers Drizzle
```

### Task 2.4 : Mappers + interfaces jobtrack (re-typage Drizzle)

**Files:**
- Modify: `src/jobtrack/mappers/jobtrack.mapper.ts`
- Modify: `src/jobtrack/interfaces/jobtrack.interface.ts`
- Modify: `src/jobtrack/interfaces/reminder.interface.ts` (aucun import Prisma — vérifier, probablement inchangé)

- [ ] **Step 1 : `jobtrack.interface.ts` — repointer les enums**

Remplacer la 1re ligne :
```ts
import { JobStatus, ContractType } from '../../db/schema';
```
(Le reste du fichier est inchangé.)

- [ ] **Step 2 : `jobtrack.mapper.ts` — typer sur les lignes Drizzle**

```ts
import { JobTrackRow, ReminderRow } from '../../db/schema';
import { JobTrack } from '../interfaces';
import { ReminderMapper } from './reminder.mapper';

type JobTrackRowWithReminders = JobTrackRow & {
  reminders?: ReminderRow[];
};

export class JobTrackMapper {
  static mapJobTrackToJobTrack(
    row: JobTrackRowWithReminders,
  ): JobTrack {
    const reminder = row.reminders?.[0] ?? null;

    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      company: row.company ?? undefined,
      jobUrl: row.jobUrl ?? undefined,
      appliedAt: row.appliedAt ?? undefined,
      status: row.status,
      contractType: row.contractType ?? undefined,
      notes: row.notes ?? undefined,
      cvFileName: row.cvFileName ?? undefined,
      lmFileName: row.lmFileName ?? undefined,
      reminder: reminder
        ? ReminderMapper.mapReminderToReminder(reminder)
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
```

> Renommage `mapPrismaJobTrackToJobTrack` → `mapJobTrackToJobTrack`. **Tous les appelants (jobtrack.service) seront mis à jour en Task 2.5.**

- [ ] **Step 3 : `reminder.mapper.ts` — renommer la méthode**

Renommer `mapPrismaReminderToReminder` → `mapReminderToReminder` (corps inchangé, le type inline reste compatible avec `ReminderRow`).

- [ ] **Step 4 : Build** — Run `pnpm build` — Expected : échouera sur `jobtrack.service.ts` (appelle encore les anciens noms) — **attendu**, corrigé en 2.5. Ne pas committer seul ; enchaîner sur 2.5 puis committer ensemble.

### Task 2.5 : `jobtrack.service.ts` (transactions interactives — cœur du risque)

**Files:**
- Modify: `src/jobtrack/jobtrack.service.ts`

- [ ] **Step 1 : Réécrire le fichier complet**

```ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { jobTracks, reminders, JobStatus, ContractType } from '../db/schema';
import { CreateJobTrackDto } from './dto/create-jobtrack.dto';
import { UpdateJobTrackDto } from './dto/update-jobtrack.dto';
import {
  JobTrack,
  JobTrackCreateData,
  JobTrackUpdateData,
  Reminder,
  ReminderCreateData,
  ReminderUpdateData,
  JobTrackWithReminder,
  JobTrackWithOptionalReminder,
} from './interfaces';
import { JobTrackMapper, ReminderMapper } from './mappers';

@Injectable()
export class JobTrackService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(
    userId: string,
    dto: CreateJobTrackDto,
  ): Promise<JobTrack> {
    const [row] = await this.drizzle.db
      .insert(jobTracks)
      .values({
        userId,
        title: dto.title,
        company: dto.company,
        jobUrl: dto.jobUrl,
        appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
        status: dto.status ?? 'APPLIED',
        contractType: dto.contractType,
        notes: dto.notes,
      })
      .returning();

    return JobTrackMapper.mapJobTrackToJobTrack(row);
  }

  async findAllByUser(userId: string): Promise<JobTrack[]> {
    const rows = await this.drizzle.db.query.jobTracks.findMany({
      where: eq(jobTracks.userId, userId),
      with: { reminders: true },
      orderBy: [desc(jobTracks.createdAt)],
    });
    return rows.map((r) => JobTrackMapper.mapJobTrackToJobTrack(r));
  }

  async findOne(id: string, userId: string): Promise<JobTrack | null> {
    const row = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, id),
      with: { reminders: true },
    });

    if (!row) {
      return null;
    }
    if (row.userId !== userId) {
      throw new ForbiddenException(
        "Vous ne pouvez accéder qu'à vos propres annonces",
      );
    }
    return JobTrackMapper.mapJobTrackToJobTrack(row);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateJobTrackDto,
    upsert = false,
  ): Promise<JobTrack> {
    const existing = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, id),
      columns: { userId: true },
    });

    if (!existing) {
      if (upsert) {
        const [created] = await this.drizzle.db
          .insert(jobTracks)
          .values({
            id,
            userId,
            title: dto.title ?? 'New Job',
            company: dto.company,
            jobUrl: dto.jobUrl,
            appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
            status: dto.status ?? 'APPLIED',
            contractType: dto.contractType,
            notes: dto.notes,
          })
          .returning();
        return JobTrackMapper.mapJobTrackToJobTrack(created);
      }
      throw new NotFoundException('Annonce introuvable');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres annonces',
      );
    }

    const updateData: Partial<{
      title: string;
      company: string | null;
      jobUrl: string | null;
      appliedAt: Date | null;
      status: JobStatus;
      contractType: ContractType | null;
      notes: string | null;
    }> = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.company !== undefined) updateData.company = dto.company;
    if (dto.jobUrl !== undefined) updateData.jobUrl = dto.jobUrl;
    if (dto.appliedAt !== undefined)
      updateData.appliedAt = dto.appliedAt ? new Date(dto.appliedAt) : null;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.contractType !== undefined)
      updateData.contractType = dto.contractType;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const [updated] = await this.drizzle.db
      .update(jobTracks)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(jobTracks.id, id))
      .returning();

    return JobTrackMapper.mapJobTrackToJobTrack(updated);
  }

  async remove(id: string, userId: string): Promise<JobTrack> {
    const existing = await this.drizzle.db.query.jobTracks.findFirst({
      where: eq(jobTracks.id, id),
      columns: { userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Annonce introuvable');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres annonces',
      );
    }

    const [deleted] = await this.drizzle.db
      .delete(jobTracks)
      .where(eq(jobTracks.id, id))
      .returning();

    return JobTrackMapper.mapJobTrackToJobTrack(deleted);
  }

  async createWithReminder(
    userId: string,
    dto: JobTrackCreateData & ReminderCreateData,
  ): Promise<JobTrackWithReminder> {
    return this.drizzle.db.transaction(async (tx) => {
      const [createdJobTrack] = await tx
        .insert(jobTracks)
        .values({
          userId,
          title: dto.title,
          company: dto.company,
          jobUrl: dto.jobUrl,
          appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
          status: dto.status ?? 'APPLIED',
          contractType: dto.contractType,
          notes: dto.notes,
        })
        .returning();

      const [createdReminder] = await tx
        .insert(reminders)
        .values({
          jobTrackId: createdJobTrack.id,
          frequency: dto.frequency,
          nextReminderAt: new Date(dto.nextReminderAt),
          isActive: dto.isActive ?? true,
        })
        .returning();

      return {
        jobTrack: JobTrackMapper.mapJobTrackToJobTrack(createdJobTrack),
        reminder: ReminderMapper.mapReminderToReminder(createdReminder),
      };
    });
  }

  async updateWithReminder(
    id: string,
    userId: string,
    dto: JobTrackUpdateData & ReminderUpdateData,
    upsert = false,
  ): Promise<JobTrackWithOptionalReminder> {
    return this.drizzle.db.transaction(async (tx) => {
      const existing = await tx.query.jobTracks.findFirst({
        where: eq(jobTracks.id, id),
      });

      if (!existing) {
        if (!upsert) throw new NotFoundException('Annonce introuvable');

        const [createdJob] = await tx
          .insert(jobTracks)
          .values({
            id,
            userId,
            title: dto.title ?? 'New Job',
            company: dto.company,
            jobUrl: dto.jobUrl,
            appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
            status: dto.status ?? 'APPLIED',
            contractType: dto.contractType,
            notes: dto.notes,
          })
          .returning();

        let reminder: Reminder | null = null;
        if (dto.frequency !== undefined && dto.nextReminderAt) {
          const [createdRem] = await tx
            .insert(reminders)
            .values({
              jobTrackId: createdJob.id,
              frequency: dto.frequency,
              nextReminderAt: new Date(dto.nextReminderAt),
              isActive: dto.isActive ?? true,
            })
            .returning();
          reminder = ReminderMapper.mapReminderToReminder(createdRem);
        }

        return {
          jobTrack: JobTrackMapper.mapJobTrackToJobTrack(createdJob),
          reminder,
        };
      }

      if (existing.userId !== userId) {
        throw new ForbiddenException(
          'Vous ne pouvez modifier que vos propres annonces',
        );
      }

      const updateData: Partial<{
        title: string;
        company: string | null;
        jobUrl: string | null;
        appliedAt: Date | null;
        status: JobStatus;
        contractType: ContractType | null;
        notes: string | null;
      }> = {};

      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.company !== undefined) updateData.company = dto.company;
      if (dto.jobUrl !== undefined) updateData.jobUrl = dto.jobUrl;
      if (dto.appliedAt !== undefined)
        updateData.appliedAt = dto.appliedAt ? new Date(dto.appliedAt) : null;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.contractType !== undefined)
        updateData.contractType = dto.contractType;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      const updated = Object.keys(updateData).length
        ? (
            await tx
              .update(jobTracks)
              .set({ ...updateData, updatedAt: new Date() })
              .where(eq(jobTracks.id, id))
              .returning()
          )[0]
        : existing;

      const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
        'ACCEPTED',
        'REJECTED',
      ]);
      const effectiveStatus = dto.status ?? existing.status;
      const isTerminal = TERMINAL_STATUSES.has(effectiveStatus);

      let reminderEntity = await tx.query.reminders.findFirst({
        where: eq(reminders.jobTrackId, id),
      });

      if (isTerminal && reminderEntity?.isActive) {
        [reminderEntity] = await tx
          .update(reminders)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(reminders.id, reminderEntity.id))
          .returning();
      }

      const hasReminderInput =
        dto.frequency !== undefined ||
        dto.nextReminderAt !== undefined ||
        dto.isActive !== undefined;

      if (hasReminderInput && !isTerminal) {
        if (reminderEntity) {
          const reminderUpdateData: Partial<{
            frequency: number;
            nextReminderAt: Date;
            isActive: boolean;
          }> = {};
          if (dto.frequency !== undefined)
            reminderUpdateData.frequency = dto.frequency;
          if (dto.nextReminderAt !== undefined)
            reminderUpdateData.nextReminderAt = new Date(dto.nextReminderAt);
          if (dto.isActive !== undefined)
            reminderUpdateData.isActive = dto.isActive;

          [reminderEntity] = await tx
            .update(reminders)
            .set({ ...reminderUpdateData, updatedAt: new Date() })
            .where(eq(reminders.id, reminderEntity.id))
            .returning();
        } else if (dto.frequency !== undefined && dto.nextReminderAt) {
          [reminderEntity] = await tx
            .insert(reminders)
            .values({
              jobTrackId: id,
              frequency: dto.frequency,
              nextReminderAt: new Date(dto.nextReminderAt),
              isActive: dto.isActive ?? true,
            })
            .returning();
        }
      }

      return {
        jobTrack: JobTrackMapper.mapJobTrackToJobTrack(updated),
        reminder: reminderEntity
          ? ReminderMapper.mapReminderToReminder(reminderEntity)
          : null,
      };
    });
  }

  async findByStatus(userId: string, status: JobStatus): Promise<JobTrack[]> {
    const rows = await this.drizzle.db.query.jobTracks.findMany({
      where: and(eq(jobTracks.userId, userId), eq(jobTracks.status, status)),
      with: { reminders: true },
      orderBy: [desc(jobTracks.createdAt)],
    });
    return rows.map((r) => JobTrackMapper.mapJobTrackToJobTrack(r));
  }
}
```

> Différence Prisma subtile préservée : dans `update`, l'original passait `appliedAt: undefined` quand la date était vide. En Drizzle, `undefined` dans `.set()` = champ ignoré ; on utilise donc `null` pour effacer explicitement (comportement conservé : une chaîne vide efface la date). Vérifier ce point au smoke-test.

- [ ] **Step 2 : Build** — Run `pnpm build` — Expected : OK (jobtrack.service + mappers cohérents).

- [ ] **Step 3 : Commit (mappers 2.4 + service 2.5 ensemble)**

```
refactor(jobtrack): migre JobTrackService et mappers de Prisma vers Drizzle
```

### Task 2.6 : `reminder-automation.service.ts` (jointure multi-tables)

**Files:**
- Modify: `src/scheduler/reminder-automation.service.ts`

- [ ] **Step 1 : Remplacer constructeur, `findDueReminders` et `rescheduleReminder`**

Imports en tête :
```ts
import { and, eq, lte, asc, notInArray } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { reminders, jobTracks, users } from '../db/schema';
```
Retirer `import { PrismaService } ...`. Constructeur :
```ts
constructor(
  private readonly drizzle: DrizzleService,
  private readonly mailService: MailService,
) {}
```

`findDueReminders` — le filtre porte sur une colonne de la table liée (`jobtrack.status`), donc on utilise le query builder avec jointures plutôt que l'API relationnelle :
```ts
private async findDueReminders(): Promise<ReminderWithJobTrackAndUser[]> {
  const now = new Date();
  const rows = await this.drizzle.db
    .select({
      id: reminders.id,
      jobTrackId: reminders.jobTrackId,
      frequency: reminders.frequency,
      nextReminderAt: reminders.nextReminderAt,
      lastSentAt: reminders.lastSentAt,
      isActive: reminders.isActive,
      createdAt: reminders.createdAt,
      updatedAt: reminders.updatedAt,
      jt_id: jobTracks.id,
      jt_userId: jobTracks.userId,
      jt_title: jobTracks.title,
      jt_company: jobTracks.company,
      jt_jobUrl: jobTracks.jobUrl,
      jt_appliedAt: jobTracks.appliedAt,
      jt_status: jobTracks.status,
      jt_notes: jobTracks.notes,
      jt_createdAt: jobTracks.createdAt,
      jt_updatedAt: jobTracks.updatedAt,
      u_id: users.id,
      u_email: users.email,
      u_username: users.username,
    })
    .from(reminders)
    .innerJoin(jobTracks, eq(reminders.jobTrackId, jobTracks.id))
    .innerJoin(users, eq(jobTracks.userId, users.id))
    .where(
      and(
        eq(reminders.isActive, true),
        lte(reminders.nextReminderAt, now),
        notInArray(jobTracks.status, ['ACCEPTED', 'REJECTED']),
      ),
    )
    .orderBy(asc(reminders.nextReminderAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    jobTrackId: r.jobTrackId,
    frequency: r.frequency,
    nextReminderAt: r.nextReminderAt,
    lastSentAt: r.lastSentAt,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobtrack: {
      id: r.jt_id,
      userId: r.jt_userId,
      title: r.jt_title,
      company: r.jt_company,
      jobUrl: r.jt_jobUrl,
      appliedAt: r.jt_appliedAt,
      status: r.jt_status,
      notes: r.jt_notes,
      createdAt: r.jt_createdAt,
      updatedAt: r.jt_updatedAt,
      user: { id: r.u_id, email: r.u_email, username: r.u_username },
    },
  }));
}
```

`rescheduleReminder` :
```ts
private async rescheduleReminder(reminder: {
  id: string;
  frequency: number;
}): Promise<void> {
  const next = new Date();
  next.setDate(next.getDate() + reminder.frequency);
  await this.drizzle.db
    .update(reminders)
    .set({ lastSentAt: new Date(), nextReminderAt: next, updatedAt: new Date() })
    .where(eq(reminders.id, reminder.id));
}
```

Le type helper `ReminderWithJobTrackAndUser` en bas de fichier reste valide (champs identiques). `buildEmailData` inchangé.

- [ ] **Step 2 : Build** — Run `pnpm build` — Expected : OK.

- [ ] **Step 3 : Commit**

```
refactor(scheduler): migre ReminderAutomationService de Prisma vers Drizzle
```

### Task 2.7 : `users.service.ts` + mapper + interface (le plus gros)

**Files:**
- Modify: `src/users/interfaces/user.interface.ts`
- Modify: `src/users/mappers/user.mapper.ts`
- Modify: `src/users/users.service.ts`

- [ ] **Step 1 : `user.interface.ts` — repointer l'enum**

Remplacer la 1re ligne par :
```ts
import { Role } from '../../db/schema';
```
(Reste inchangé.)

- [ ] **Step 2 : `user.mapper.ts` — typer sur `UserRow`**

Remplacer la 1re ligne :
```ts
import { UserRow } from '../../db/schema';
```
Et la signature + corps de `mapPrismaUserToUser` → renommer en `mapUserRowToUser` :
```ts
static mapUserRowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username ?? undefined,
    password: row.password,
    role: row.role,
    refreshToken: row.refreshToken ?? undefined,
    refreshTokenExpires: row.refreshTokenExpires ?? undefined,
    resetPasswordToken: row.resetPasswordToken ?? undefined,
    resetPasswordExpires: row.resetPasswordExpires ?? undefined,
    totpSecret: row.totpSecret ?? undefined,
    totpEnabled: row.totpEnabled,
    totpRecoveryCodes: row.totpRecoveryCodes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```
(Les autres méthodes statiques `mapUserToSafe`, `create*Response` sont inchangées.)

- [ ] **Step 3 : `users.service.ts` — réécrire**

```ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gte, desc } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { users } from '../db/schema';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, UserCreateData, UserUpdateData } from './interfaces';
import { UserMapper } from './mappers';

@Injectable()
export class UsersService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(createUserData: UserCreateData): Promise<User> {
    const existingUser = await this.drizzle.db.query.users.findFirst({
      where: eq(users.email, createUserData.email),
    });
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await this.hashPassword(createUserData.password);

    const [row] = await this.drizzle.db
      .insert(users)
      .values({
        email: createUserData.email,
        username: createUserData.username,
        password: hashedPassword,
        role: createUserData.role ?? 'USER',
      })
      .returning();

    return UserMapper.mapUserRowToUser(row);
  }

  async findAll(): Promise<User[]> {
    const rows = await this.drizzle.db.query.users.findMany({
      orderBy: [desc(users.createdAt)],
    });
    return rows.map((u) => UserMapper.mapUserRowToUser(u));
  }

  async findOne(id: string): Promise<User | null> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return row ? UserMapper.mapUserRowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    return row ? UserMapper.mapUserRowToUser(row) : null;
  }

  async update(updateUserData: UserUpdateData): Promise<User> {
    if (!updateUserData.id) {
      throw new NotFoundException(
        "L'identifiant utilisateur est requis pour la mise à jour",
      );
    }

    const user = await this.findOne(updateUserData.id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const updateData: Partial<{
      email: string;
      username: string;
      password: string;
      role: User['role'];
    }> = {};

    if (updateUserData.email) updateData.email = updateUserData.email;
    if (updateUserData.username !== undefined)
      updateData.username = updateUserData.username;
    if (updateUserData.password)
      updateData.password = await this.hashPassword(updateUserData.password);
    if (updateUserData.role) updateData.role = updateUserData.role;

    const [row] = await this.drizzle.db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, updateUserData.id))
      .returning();

    return UserMapper.mapUserRowToUser(row);
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    const [row] = await this.drizzle.db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    return UserMapper.mapUserRowToUser(row);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.password) return false;
    if (
      !user.password.startsWith('$2a$') &&
      !user.password.startsWith('$2b$')
    ) {
      const sha256Hash = crypto
        .createHash('sha256')
        .update(password)
        .digest('hex');
      if (sha256Hash === user.password) {
        const bcryptHash = await bcrypt.hash(password, 12);
        await this.drizzle.db
          .update(users)
          .set({ password: bcryptHash, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        return true;
      }
      return false;
    }
    return bcrypt.compare(password, user.password);
  }

  generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async setPasswordResetToken(email: string): Promise<string | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;

    const resetToken = this.generatePasswordResetToken();
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1);

    await this.drizzle.db
      .update(users)
      .set({
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return resetToken;
  }

  async resetPasswordWithToken(
    token: string,
    newPassword: string,
  ): Promise<boolean> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: and(
        eq(users.resetPasswordToken, token),
        gte(users.resetPasswordExpires, new Date()),
      ),
    });
    if (!row) return false;

    const hashedPassword = await this.hashPassword(newPassword);

    await this.drizzle.db
      .update(users)
      .set({
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.id));

    return true;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await this.findOne(userId);
    if (!user) return false;
    if (!(await this.validatePassword(user, currentPassword))) return false;

    const hashedPassword = await this.hashPassword(newPassword);
    await this.drizzle.db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return true;
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.drizzle.db
      .update(users)
      .set({
        refreshToken: hashedRefreshToken,
        refreshTokenExpires: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async validateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { refreshToken: true, refreshTokenExpires: true },
    });
    if (!row?.refreshToken || !row.refreshTokenExpires) return false;
    if (new Date() > row.refreshTokenExpires) return false;
    return bcrypt.compare(refreshToken, row.refreshToken);
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({ refreshToken: null, refreshTokenExpires: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateTotpSecret(
    userId: string,
    encryptedSecret: string,
  ): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({ totpSecret: encryptedSecret, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async enableTotp(
    userId: string,
    hashedRecoveryCodes: string[],
  ): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({
        totpEnabled: true,
        totpRecoveryCodes: hashedRecoveryCodes,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async disableTotp(userId: string): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({
        totpSecret: null,
        totpEnabled: false,
        totpRecoveryCodes: [],
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async removeRecoveryCode(userId: string, codeIndex: number): Promise<void> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { totpRecoveryCodes: true },
    });
    if (!row) return;

    const codes = [...row.totpRecoveryCodes];
    codes.splice(codeIndex, 1);

    await this.drizzle.db
      .update(users)
      .set({ totpRecoveryCodes: codes, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}
```

- [ ] **Step 4 : Vérifier qu'aucun autre appelant n'utilise les anciens noms de mapper**

Run :
```bash
grep -rn "mapPrismaUserToUser\|mapPrismaJobTrackToJobTrack\|mapPrismaReminderToReminder" src --include='*.ts'
```
Expected : aucun résultat. Sinon, corriger les appelants (ex. `auth.mapper.ts`).

- [ ] **Step 5 : Build** — Run `pnpm build` — Expected : OK.

- [ ] **Step 6 : Commit**

```
refactor(users): migre UsersService et UserMapper de Prisma vers Drizzle
```

### Task 2.8 : Bascule `app.module.ts` sur Drizzle + retrait de `PrismaModule`

**Files:**
- Modify: `src/app.module.ts`

- [ ] **Step 1 : Retirer `PrismaModule` des imports**

Supprimer `import { PrismaModule }` et son entrée dans `imports`. Garder `DrizzleModule`.

- [ ] **Step 2 : Vérifier qu'aucune référence à `PrismaService` ne subsiste**

Run :
```bash
grep -rn "PrismaService\|prisma.service\|this.prisma" src --include='*.ts'
```
Expected : aucun résultat (hors `src/prisma/` lui-même, supprimé en Phase 4).

- [ ] **Step 3 : Build + démarrage contre la base locale**

Run :
```bash
set -a; source .env.test.local; set +a
pnpm build && timeout 12 node dist/main.js || true
```
Expected : démarrage OK, aucune erreur d'injection (`DrizzleService` résolu partout).

- [ ] **Step 4 : Commit**

```
refactor(app): bascule l'injection sur DrizzleModule, retire PrismaModule
```

---

## PHASE 3 — Validation Zod (`nestjs-zod`)

### Task 3.1 : Installer nestjs-zod

**Files:**
- Modify: `package.json`

- [ ] **Step 1 : Installer**

Run :
```bash
pnpm add nestjs-zod zod
```
Expected : `nestjs-zod` (cible v4.x) + `zod` (v3.x) en dependencies.

- [ ] **Step 2 : Vérifier les exports disponibles**

Run :
```bash
node -e "const m=require('nestjs-zod'); console.log(Object.keys(m))"
```
Expected : contient `createZodDto`, `ZodValidationPipe`, `patchNestjsSwagger`. Si `patchNestjsSwagger` est absent (renommé selon la version), repérer l'équivalent (`cleanupOpenApiDoc`/import depuis `nestjs-zod`) et l'utiliser en Task 3.4. **Noter** la fonction exacte trouvée.

- [ ] **Step 3 : Commit**

```
build(validation): ajoute nestjs-zod + zod
```

### Task 3.2 : Convertir les DTOs auth + users

> Patron : `export class XxxDto extends createZodDto(z.object({...}).strict()) {}`. `.strict()` reproduit `forbidNonWhitelisted: true`. Reporter **fidèlement** messages FR et règles. Importer `import { createZodDto } from 'nestjs-zod';` et `import { z } from 'zod';`.

**Files:** `src/auth/dto/{login,refresh-token,register,totp}.dto.ts`, `src/users/dto/{create-user,update-user,change-password,forgot-password,reset-password}.dto.ts`

- [ ] **Step 1 : `auth/dto/login.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class LoginDto extends createZodDto(
  z
    .object({
      email: z
        .string()
        .email({ message: 'Veuillez fournir une adresse e-mail valide' }),
      password: z
        .string()
        .min(6, { message: 'Le mot de passe doit contenir au moins 6 caractères' }),
    })
    .strict(),
) {}
```

- [ ] **Step 2 : `auth/dto/refresh-token.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class RefreshTokenDto extends createZodDto(
  z
    .object({
      refresh_token: z
        .string({
          message: 'Le jeton de renouvellement doit être une chaîne de caractères',
        })
        .min(1, { message: 'Le jeton de renouvellement ne peut pas être vide' }),
    })
    .strict(),
) {}
```

- [ ] **Step 3 : `auth/dto/register.dto.ts` (3 classes)**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  .regex(/(?=.*[A-Z])/, {
    message: 'Le mot de passe doit contenir au moins une majuscule',
  })
  .regex(/(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins un chiffre',
  })
  .regex(/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message: 'Le mot de passe doit contenir au moins un caractère spécial',
  });

const usernameSchema = z
  .string()
  .min(3, { message: "Le nom d'utilisateur doit contenir au moins 3 caractères" })
  .regex(/^[a-zA-Z0-9_]+$/, {
    message:
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscores",
  });

export class RegisterDto extends createZodDto(
  z
    .object({
      email: z.string().email({ message: 'Email invalide' }),
      password: passwordSchema,
      username: usernameSchema.optional(),
    })
    .strict(),
) {}

export class VerifyRegistrationDto extends createZodDto(
  z
    .object({
      email: z.string().email({ message: 'Email invalide' }),
      verificationCode: z
        .string()
        .regex(/^\d{6}$/, {
          message: 'Le code de validation doit être composé de 6 chiffres',
        }),
    })
    .strict(),
) {}

export class ResendVerificationCodeDto extends createZodDto(
  z.object({ email: z.string().email({ message: 'Email invalide' }) }).strict(),
) {}
```

- [ ] **Step 4 : `auth/dto/totp.dto.ts` (4 classes)**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const totpToken = z
  .string()
  .length(6)
  .regex(/^\d{6}$/, { message: 'Le code TOTP doit contenir exactement 6 chiffres' });

export class VerifyTotpSetupDto extends createZodDto(
  z.object({ token: totpToken }).strict(),
) {}

export class ValidateTotpDto extends createZodDto(
  z.object({ tempToken: z.string().min(1), token: totpToken }).strict(),
) {}

export class DisableTotpDto extends createZodDto(
  z.object({ password: z.string().min(1) }).strict(),
) {}

export class TotpRecoveryDto extends createZodDto(
  z.object({ tempToken: z.string().min(1), recoveryCode: z.string().min(1) }).strict(),
) {}
```

- [ ] **Step 5 : `users/dto/create-user.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { roleEnum } from '../../db/schema';

export class CreateUserDto extends createZodDto(
  z
    .object({
      email: z
        .string()
        .email({ message: 'Veuillez fournir une adresse e-mail valide' }),
      username: z.string().optional(),
      password: z
        .string()
        .min(6, { message: 'Le mot de passe doit contenir au moins 6 caractères' }),
      role: z.enum(roleEnum.enumValues, { message: 'Le rôle doit être USER ou ADMIN' }).optional(),
    })
    .strict(),
) {}
```

- [ ] **Step 6 : `users/dto/update-user.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { roleEnum } from '../../db/schema';

export class UpdateUserDto extends createZodDto(
  z
    .object({
      id: z.string().optional(),
      email: z
        .string()
        .email({ message: 'Veuillez fournir une adresse e-mail valide' })
        .optional(),
      username: z.string().optional(),
      password: z
        .string()
        .min(6, { message: 'Le mot de passe doit contenir au moins 6 caractères' })
        .optional(),
      role: z.enum(roleEnum.enumValues, { message: 'Le rôle doit être USER ou ADMIN' }).optional(),
    })
    .strict(),
) {}
```

> Note : le controller fait `updateUserDto.id = userId` après validation — l'objet validé reste mutable, OK. `id` est dans le schéma (optionnel) donc non rejeté.

- [ ] **Step 7 : `users/dto/change-password.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ChangePasswordDto extends createZodDto(
  z
    .object({
      currentPassword: z
        .string({ message: 'Le mot de passe actuel doit être une chaîne de caractères' })
        .min(1, { message: 'Le mot de passe actuel est requis' }),
      newPassword: z
        .string({ message: 'Le nouveau mot de passe doit être une chaîne de caractères' })
        .min(8, { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
          message:
            'Le nouveau mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial',
        }),
    })
    .strict(),
) {}
```

- [ ] **Step 8 : `users/dto/forgot-password.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ForgotPasswordDto extends createZodDto(
  z
    .object({
      email: z
        .string()
        .min(1, { message: "L'e-mail est requis" })
        .email({ message: 'Veuillez fournir une adresse e-mail valide' }),
    })
    .strict(),
) {}
```

- [ ] **Step 9 : `users/dto/reset-password.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ResetPasswordDto extends createZodDto(
  z
    .object({
      token: z
        .string({ message: 'Le token doit être une chaîne de caractères' })
        .min(1, { message: 'Le token est requis' }),
      newPassword: z
        .string({ message: 'Le mot de passe doit être une chaîne de caractères' })
        .min(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
          message:
            'Le mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial',
        }),
    })
    .strict(),
) {}
```

- [ ] **Step 10 : Build** — Run `pnpm build` — Expected : OK.

- [ ] **Step 11 : Commit**

```
refactor(dto): convertit les DTOs auth et users en schémas Zod (nestjs-zod)
```

### Task 3.3 : Convertir les DTOs jobtrack

**Files:** `src/jobtrack/dto/{create-jobtrack,update-jobtrack,create-jobtrack-with-reminder,update-jobtrack-with-reminder}.dto.ts`

- [ ] **Step 1 : `create-jobtrack.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { jobStatusEnum, contractTypeEnum } from '../../db/schema';

export const createJobTrackSchema = z
  .object({
    title: z
      .string({ message: 'Le titre doit être une chaîne de caractères' })
      .min(1, { message: 'Le titre ne peut pas être vide' }),
    company: z
      .string({ message: 'Le nom de l’entreprise doit être une chaîne de caractères' })
      .optional(),
    jobUrl: z
      .string({ message: 'L’URL de l’offre doit être une chaîne de caractères' })
      .optional(),
    appliedAt: z
      .string()
      .datetime({ message: 'La date de candidature doit être une date ISO valide' })
      .optional(),
    status: z
      .enum(jobStatusEnum.enumValues, {
        message: 'Le statut doit être un statut de candidature valide',
      })
      .optional(),
    contractType: z
      .enum(contractTypeEnum.enumValues, {
        message: 'Le type de contrat doit être un type de contrat valide',
      })
      .optional(),
    notes: z
      .string({ message: 'Les notes doivent être une chaîne de caractères' })
      .optional(),
  })
  .strict();

export class CreateJobTrackDto extends createZodDto(createJobTrackSchema) {}
```

> Note : `z.string().datetime()` accepte l'ISO 8601 comme `IsDateString`. Vérifier au smoke-test qu'un exemple `2025-01-15T10:30:00Z` passe.

- [ ] **Step 2 : `update-jobtrack.dto.ts`**

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { jobStatusEnum, contractTypeEnum } from '../../db/schema';

export const updateJobTrackSchema = z
  .object({
    id: z.string().optional(),
    title: z
      .string({ message: 'Le titre doit être une chaîne de caractères' })
      .min(1, { message: 'Le titre ne peut pas être vide' })
      .optional(),
    company: z.string({ message: 'Le nom de l’entreprise doit être une chaîne de caractères' }).optional(),
    jobUrl: z.string({ message: 'L’URL de l’offre doit être une chaîne de caractères' }).optional(),
    appliedAt: z
      .string()
      .datetime({ message: 'La date de candidature doit être une date ISO valide' })
      .optional(),
    status: z
      .enum(jobStatusEnum.enumValues, { message: 'Le statut doit être un statut de candidature valide' })
      .optional(),
    contractType: z
      .enum(contractTypeEnum.enumValues, { message: 'Le type de contrat doit être un type de contrat valide' })
      .optional(),
    notes: z.string({ message: 'Les notes doivent être une chaîne de caractères' }).optional(),
  })
  .strict();

export class UpdateJobTrackDto extends createZodDto(updateJobTrackSchema) {}
```

- [ ] **Step 3 : `create-jobtrack-with-reminder.dto.ts`** (héritage → merge de schémas)

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createJobTrackSchema } from './create-jobtrack.dto';

export const createJobTrackWithReminderSchema = createJobTrackSchema
  .extend({
    frequency: z
      .number({ message: 'La fréquence doit être un entier' })
      .int({ message: 'La fréquence doit être un entier' })
      .min(1, { message: 'La fréquence doit être d’au moins 1 jour' }),
    nextReminderAt: z
      .string()
      .datetime({ message: 'La prochaine date de rappel doit être une date ISO valide' }),
    isActive: z
      .boolean({ message: 'Le champ isActive doit être un booléen' })
      .optional(),
  })
  .strict();

export class CreateJobTrackWithReminderDto extends createZodDto(
  createJobTrackWithReminderSchema,
) {}
```

> `.extend()` sur un schéma `.strict()` : appeler `.strict()` à nouveau après `.extend()` (comme ci-dessus) pour garder le rejet des clés inconnues.

- [ ] **Step 4 : `update-jobtrack-with-reminder.dto.ts`** (PartialType → `.partial()`)

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createJobTrackSchema } from './create-jobtrack.dto';

export const updateJobTrackWithReminderSchema = createJobTrackSchema
  .partial()
  .extend({
    frequency: z
      .number({ message: 'La fréquence doit être un entier' })
      .int({ message: 'La fréquence doit être un entier' })
      .min(1, { message: 'La fréquence doit être d’au moins 1 jour' })
      .optional(),
    nextReminderAt: z
      .string()
      .datetime({ message: 'La prochaine date de rappel doit être une date ISO valide' })
      .optional(),
    isActive: z
      .boolean({ message: 'Le champ isActive doit être un booléen' })
      .optional(),
  })
  .strict();

export class UpdateJobTrackWithReminderDto extends createZodDto(
  updateJobTrackWithReminderSchema,
) {}
```

- [ ] **Step 5 : Build** — Run `pnpm build` — Expected : OK.

- [ ] **Step 6 : Commit**

```
refactor(dto): convertit les DTOs jobtrack en schémas Zod (nestjs-zod)
```

### Task 3.4 : Brancher le pipe global + Swagger + nettoyer les controllers

**Files:**
- Modify: `src/main.ts`
- Modify: `src/jobtrack/jobtrack.controller.ts`, `src/users/users.controller.ts`
- Modify: DTOs de réponse important les enums : `src/jobtrack/dto/jobtrack-response.dto.ts`, `src/jobtrack/dto/jobtrack-with-reminder-response.dto.ts`, `src/auth/dto/auth-response.dto.ts`, `src/auth/interfaces/auth.interface.ts`, `src/auth/interfaces/response.interface.ts`

- [ ] **Step 1 : `main.ts` — remplacer le ValidationPipe global**

Retirer `import { ValidationPipe } from '@nestjs/common';` et le bloc `app.useGlobalPipes(new ValidationPipe({...}))`. Ajouter :
```ts
import { ZodValidationPipe, patchNestjsSwagger } from 'nestjs-zod';
// ...
app.useGlobalPipes(new ZodValidationPipe());
```
Et **avant** `new DocumentBuilder()` dans le bloc Swagger :
```ts
patchNestjsSwagger();
```
(Si Task 3.1/Step 2 a révélé un autre nom que `patchNestjsSwagger`, utiliser celui-là.)

- [ ] **Step 2 : Controllers — retirer `@Body(ValidationPipe)`**

Dans `jobtrack.controller.ts` et `users.controller.ts`, remplacer chaque `@Body(ValidationPipe) x: XxxDto` par `@Body() x: XxxDto`, et retirer l'import `ValidationPipe` de `@nestjs/common` s'il n'est plus utilisé. Le `ZodValidationPipe` global s'applique.

- [ ] **Step 3 : Repointer les enums dans les DTOs de réponse + interfaces auth**

Dans chacun des fichiers listés, remplacer l'import `from '../../generated/prisma/enums.js'` (ou `../generated/...`) par `from '../../db/schema'` (ajuster la profondeur relative). Ces fichiers n'utilisent les enums que pour le typage/Swagger ; aucune autre modification.

- [ ] **Step 4 : Vérifier qu'aucun import Prisma ne subsiste hors `src/generated` / `src/prisma`**

Run :
```bash
grep -rn "generated/prisma\|class-validator\|class-transformer" src --include='*.ts' | grep -v 'src/generated'
```
Expected : aucun résultat.

- [ ] **Step 5 : Build + démarrage + Swagger**

Run :
```bash
set -a; source .env.test.local; set +a
pnpm build && timeout 15 sh -c 'NODE_ENV=development node dist/main.js & sleep 8; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/docs-json; kill %1'
```
Expected : build OK, démarrage OK, `/api/docs-json` répond `200` (Swagger généré sans crash via patchNestjsSwagger).

- [ ] **Step 6 : Commit**

```
feat(validation): ZodValidationPipe global + patch Swagger, nettoie les controllers
```

---

## PHASE 4 — Nettoyage Prisma + migrations + déploiement

### Task 4.1 : Supprimer Prisma du code et des dépendances

**Files:**
- Delete: `src/prisma/`, `src/generated/`, `prisma/`, `prisma.config.ts`
- Modify: `package.json`

- [ ] **Step 1 : Supprimer les fichiers/dossiers Prisma**

Run :
```bash
rm -rf src/prisma src/generated prisma prisma.config.ts src/db/_introspected
```

- [ ] **Step 2 : Retirer les dépendances Prisma de `package.json`**

Run :
```bash
pnpm remove @prisma/client @prisma/adapter-pg prisma class-validator class-transformer
```
Puis retirer le bloc `"pnpm": { "onlyBuiltDependencies": ["prisma", "@prisma/engines", "@prisma/client"] }` de `package.json` (ou le vider). Retirer les scripts `prisma generate` / `prisma migrate` s'ils existent encore.

- [ ] **Step 3 : Build complet propre**

Run :
```bash
rm -rf dist
pnpm install
pnpm build
```
Expected : build OK, zéro référence Prisma.

- [ ] **Step 4 : Vérification finale d'absence de Prisma**

Run :
```bash
grep -rn "prisma\|Prisma" src --include='*.ts' || echo "CLEAN"
```
Expected : `CLEAN` (ou uniquement des occurrences sans rapport, à vérifier).

- [ ] **Step 5 : Commit**

```
chore(prisma): supprime Prisma, le client généré et class-validator
```

### Task 4.2 : Générer le baseline Drizzle et le marquer appliqué

**Files:**
- Create: `drizzle/0000_*.sql` (généré) + `drizzle/meta/`

- [ ] **Step 1 : Générer la migration baseline**

Run :
```bash
set -a; source .env.test.local; set +a
pnpm drizzle-kit generate --name=baseline
```
Expected : un fichier `drizzle/0000_baseline.sql` contenant les `CREATE TABLE ...` correspondant au schéma actuel, + `drizzle/meta/_journal.json`.

- [ ] **Step 2 : Vérifier que le baseline matche la base existante (pas de diff destructif)**

Inspecter `drizzle/0000_baseline.sql` : il doit décrire EXACTEMENT les tables existantes (noms FR, colonnes, enums). Il ne doit contenir AUCUN `DROP` ni `ALTER` inattendu. Si `drizzle-kit generate` propose des altérations, c'est un écart schema.ts ↔ base : revenir corriger `src/db/schema.ts` (Task 1.3) jusqu'à ce que le baseline soit un pur `CREATE` de l'état courant.

- [ ] **Step 3 : Marquer le baseline comme déjà appliqué sur la base locale (sans exécuter le DDL)**

> `drizzle-kit migrate` lit la table `__drizzle_migrations` (schéma `drizzle`). On y insère l'entrée du baseline SANS lancer les `CREATE TABLE` (les tables existent déjà). Script idempotent :

`scripts/mark-baseline-applied.sql` :
```sql
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
-- Insère l'entrée du baseline seulement si la table de migrations est vide.
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
SELECT :'hash', :created_at
WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations");
```

Récupérer le `hash` et le `created_at` (timestamp ms) depuis `drizzle/meta/_journal.json` (champ `entries[0]`), puis :
```bash
HASH=$(node -e "const j=require('./drizzle/meta/_journal.json'); console.log(j.entries[0].tag)")
WHEN=$(node -e "const j=require('./drizzle/meta/_journal.json'); console.log(j.entries[0].when)")
DOCKER="$(command -v docker || command -v podman)"
"$DOCKER" exec -i candidash-migr-test psql -U djoudj -d candidash_db \
  -v hash="$HASH" -v created_at="$WHEN" < scripts/mark-baseline-applied.sql
```

> ⚠️ Le `hash` attendu par drizzle-kit est le SHA256 du contenu du fichier `.sql`, pas le `tag`. **Vérifier** la version de drizzle-kit : selon les versions, `__drizzle_migrations.hash` = hash du fichier SQL. Approche robuste et recommandée : voir Step 4 (laisser `drizzle-kit migrate` gérer lui-même contre une base où le DDL est rendu idempotent).

- [ ] **Step 4 : Valider le no-op de `drizzle-kit migrate` (méthode robuste)**

> Méthode privilégiée pour éviter tout calcul de hash manuel : rendre le baseline ré-exécutable sans erreur. Éditer `drizzle/0000_baseline.sql` pour rendre chaque instruction idempotente :
> - `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
> - `CREATE TYPE "X" AS ENUM(...)` → encadrer d'un bloc `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`
> - `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS` ; `CREATE UNIQUE INDEX` → idem
> - contraintes FK ajoutées via `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;`
>
> Ainsi `drizzle-kit migrate` sur une base **déjà au schéma courant** n'échoue pas (tout existe déjà → ignoré) et marque le baseline appliqué ; sur une base **vierge**, il crée tout. Cela neutralise le risque « crash au boot = 502 ».

Run (contre la base locale déjà peuplée) :
```bash
set -a; source .env.test.local; set +a
pnpm drizzle-kit migrate
```
Expected : succès, aucune table modifiée (tout existait déjà), entrée ajoutée dans `drizzle.__drizzle_migrations`.

- [ ] **Step 5 : Re-run idempotence**

Run : `pnpm drizzle-kit migrate`
Expected : « No migrations to apply » / no-op. Confirme l'idempotence au boot.

- [ ] **Step 6 : Commit**

```
feat(db): migration baseline Drizzle idempotente (no-op sur base existante)
```

### Task 4.3 : Mettre à jour le Dockerfile

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1 : Retirer Prisma, ajouter Drizzle**

- Stage builder : supprimer la ligne `RUN pnpm prisma generate`.
- Stage production : remplacer `RUN pnpm install --frozen-lockfile --prod && pnpm add -D prisma @prisma/engines` par `RUN pnpm install --frozen-lockfile --prod && pnpm add -D drizzle-kit drizzle-orm`.
- Remplacer les `COPY ... prisma ...` / `prisma.config.ts` par :
```dockerfile
COPY --chown=node:node --from=builder /app/drizzle ./drizzle
COPY --chown=node:node --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --chown=node:node --from=builder /app/src/db/schema.ts ./src/db/schema.ts
```
> `drizzle-kit migrate` lit `drizzle.config.ts` qui référence `./src/db/schema.ts` ; copier ce fichier source dans l'image prod. (Alternative : config pointant sur `out` seul — mais garder le schema.ts est le plus sûr.)
- Remplacer le `CMD` :
```dockerfile
CMD ["sh", "-c", "pnpm drizzle-kit migrate && node dist/main.js"]
```

- [ ] **Step 2 : Build de l'image en local (validation)**

Run :
```bash
DOCKER="$(command -v docker || command -v podman)"
"$DOCKER" build -t candidash-backend-test .
```
Expected : build d'image OK (les deux stages passent, plus aucune étape Prisma).

- [ ] **Step 3 : Test conteneur contre la base locale (réseau host)**

Run :
```bash
DOCKER="$(command -v docker || command -v podman)"
"$DOCKER" run --rm --network host \
  -e DATABASE_URL="postgresql://djoudj:testpass@localhost:5456/candidash_db?schema=public" \
  -e JWT_SECRET=test -e TOTP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef \
  -e MAIL_HOST=localhost -e MAIL_PORT=1025 -e MAIL_USER=x -e MAIL_PASSWORD=x \
  -e MAIL_FROM_NAME=x -e MAIL_FROM_ADDRESS=x@x.fr \
  candidash-backend-test &
sleep 12
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/health || true
```
Expected : `drizzle-kit migrate` au démarrage = no-op (base déjà au schéma), app démarre, health répond. **C'est la validation directe du scénario de déploiement.**

- [ ] **Step 4 : Commit**

```
build(docker): remplace prisma migrate deploy par drizzle-kit migrate au boot
```

---

## PHASE 5 — Vérification de non-régression

### Task 5.1 : Suite de tests + smoke-test fonctionnel

**Files:** (aucun — exécution)

- [ ] **Step 1 : Restaurer une base locale fraîche (état prod propre)**

Run : `./scripts/restore-local-db.sh`
Expected : base remise à l'état du dump.

- [ ] **Step 2 : Appliquer la migration baseline**

Run :
```bash
set -a; source .env.test.local; set +a
pnpm drizzle-kit migrate
```
Expected : no-op, baseline marqué appliqué.

- [ ] **Step 3 : Lancer les tests e2e existants**

Run :
```bash
set -a; source .env.test.local; set +a
pnpm test:e2e
```
Expected : suite verte. Comparer avec l'état de référence noté en Task 0.1/Step 4. Tout test qui passait avant doit passer après. (Si un test nécessitait Prisma directement, l'adapter ; ne pas affaiblir les assertions.)

- [ ] **Step 4 : Smoke-test manuel des parcours critiques**

Démarrer l'app (`pnpm build && node dist/main.js` avec `.env.test.local`), puis vérifier au moins :
- `POST /api/v1/auth/register` (validation Zod mdp/username), `verify`, `login`, `refresh` (cookie), `logout`.
- `GET/POST/PUT/DELETE /api/v1/jobtrack` (CRUD), création **with-reminder** (transaction), passage en statut `ACCEPTED`/`REJECTED` → rappel désactivé.
- Upload/download/delete document (PDF, > 5 Mo rejeté).
- Une requête avec un champ inconnu → rejet (parité `forbidNonWhitelisted`).
- Une date `appliedAt` ISO valide acceptée, une invalide rejetée avec le message FR.

Documenter le résultat de chaque parcours.

- [ ] **Step 5 : Vérifier que la base n'a pas été altérée structurellement**

Run :
```bash
DOCKER="$(command -v docker || command -v podman)"
"$DOCKER" exec candidash-migr-test psql -U djoudj -d candidash_db -c '\d "Annonces"'
```
Expected : structure identique à l'origine (mêmes colonnes/types).

- [ ] **Step 6 : Bilan de vérification (pas de commit)**

Récapituler : build vert, e2e vert, smoke-tests OK, schéma intact, `migrate` idempotent. **Tant que ce bilan n'est pas vert, ne pas déployer en prod.**

### Task 5.2 : Préparation du déploiement prod (hors périmètre code — checklist)

- [ ] **Step 1 :** Sauvegarde fraîche de la prod avant déploiement (re-dump, cf. procédure du 2026-05-30).
- [ ] **Step 2 :** Sur une **copie restaurée** de la prod, exécuter `drizzle-kit migrate` et confirmer le no-op + app qui démarre, **avant** de pousser l'image.
- [ ] **Step 3 :** Déployer ; surveiller les logs de démarrage (le `drizzle-kit migrate` ne doit rien modifier). En cas d'erreur de migrate au boot → rollback image (le baseline idempotent doit l'éviter).
- [ ] **Step 4 :** Vérifier `api.*` répond (pas de 502), parcours auth + jobtrack OK en prod.
- [ ] **Step 5 (optionnel ultérieur) :** supprimer la table `_prisma_migrations` devenue inerte.

---

## Self-Review (effectué)

**Couverture du spec :** ✓ Couche db (Phase 1) ; réécriture 6 services (Phase 2) ; Zod/nestjs-zod + Swagger (Phase 3) ; migrations baseline idempotentes + Dockerfile (Phase 4) ; vérification base locale restaurée + e2e + smoke (Phase 0 & 5). Décisions actées respectées (nestjs-zod remplace class-validator ; introspection ; driver node-postgres + DB locale jetable).

**Placeholders :** aucun « TODO/TBD » ; code complet fourni pour infra, 6 services, 16 DTOs, main.ts, Dockerfile.

**Cohérence des types/noms :** mappers renommés (`mapUserRowToUser`, `mapJobTrackToJobTrack`, `mapReminderToReminder`) et appelants alignés (Task 2.5/2.7 + grep de contrôle 2.7/Step 4) ; enums réexportés depuis `src/db/schema` et tous les importeurs repointés (Task 3.4/Step 3) ; tables `users/jobTracks/reminders/userTracking/verificationCodes/pendingUsers` cohérentes entre schéma, services et relations.

**Risque clé (anti-502) :** traité explicitement par le baseline idempotent + validation conteneur (Task 4.2/4.3) avant prod.
