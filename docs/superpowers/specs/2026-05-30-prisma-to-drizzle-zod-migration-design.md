# Migration Prisma → Drizzle + validation Zod — Design

- **Date** : 2026-05-30
- **Repo** : `nest-candidash-app` (backend NestJS uniquement ; `ng-candidash-app` non touché)
- **Objectif** : remplacer Prisma par Drizzle ORM et class-validator par Zod, **sans perte de données ni régression d'API**, sur une base de production déjà en ligne.

## Contexte de départ

- NestJS 11 + TypeScript 5.7 + **Prisma 7.4.1** avec l'adapter `@prisma/adapter-pg` (driver `pg`), client généré dans `src/generated/prisma/`.
- **~166 appels Prisma** sur 6 fichiers de services. Surface réelle utilisée : `findUnique/findFirst/findMany (+ include)`, `create/update/delete`, `upsert` (×1 réel, code de vérif), `createMany/updateMany/deleteMany`, `count`, et **2 transactions interactives** (`createWithReminder`, `updateWithReminder`).
  - Note : `groupBy`/`aggregate` n'apparaissent QUE dans les fichiers générés — **non utilisés** dans le code réel.
- DTOs en **class-validator** + décorateurs `@nestjs/swagger`, messages en français.
- `ValidationPipe` global : `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- 8 tables (noms FR via `@@map` : `Utilisateurs`, `Annonces`, `Relance`, `CodesVerification`, `UtilisateursEnAttente` + `UserTracking`, et tables sans map), 3 enums (`Role`, `JobStatus`, `ContractType`), relations `onDelete: Cascade`.
- Base de prod sauvegardée le 2026-05-30 : `~/Bureau/candidash_db_2026-05-30_102657.dump` (format custom `-Fc`).
- Déploiement : Dockerfile fait `pnpm prisma generate` au build et `pnpm prisma migrate deploy && node dist/main.js` au boot.

## Décisions actées (brainstorming)

1. **Validation** : `nestjs-zod` (createZodDto + ZodValidationPipe), **remplace** class-validator. Swagger préservé.
2. **Schéma Drizzle** : généré par **introspection** (`drizzle-kit pull`) sur une copie locale restaurée du dump.
3. **Driver** : `drizzle-orm/node-postgres` réutilisant le `pg` déjà présent. **DB locale jetable** (Docker) pour introspection + tests.

## Architecture cible

### 1. Couche base de données — `src/db/`

- `schema.ts` — issu de `drizzle-kit pull`, matche exactement les tables existantes (noms FR conservés au niveau SQL). Nettoyage léger : identifiants TS lisibles, `relations()` pour remplacer les `include` Prisma.
- `enums.ts` — `pgEnum` pour `Role`, `JobStatus`, `ContractType` + types TS dérivés. **Remplacent** tous les imports `src/generated/prisma/enums.js`.
- `drizzle.service.ts` — `@Injectable()` créant un `Pool` `pg` à partir de `DATABASE_URL` et exposant `db = drizzle(pool, { schema })`. Lève une erreur si `DATABASE_URL` absent (parité avec `PrismaService` actuel). Ferme le pool sur `OnModuleDestroy`.
- `drizzle.module.ts` — `@Global()`, providers/exports `DrizzleService`. Remplace `PrismaModule`/`PrismaService`.
- `drizzle.config.ts` (racine) — dialect `postgresql`, `schema: './src/db/schema.ts'`, `out: './drizzle'`, credentials via `DATABASE_URL`.

**Suppressions** : `prisma/` (schema + migrations), `prisma.config.ts`, `src/generated/`, `src/prisma/`, deps `@prisma/client`, `@prisma/adapter-pg`, `prisma`, bloc `pnpm.onlyBuiltDependencies`.

### 2. Réécriture des services (6 fichiers)

Traduction méthode par méthode, **signatures publiques et exceptions Nest inchangées** :

| Fichier | Points clés |
|---|---|
| `users/users.service.ts` (20) | CRUD user, gestion tokens reset, champs TOTP. |
| `jobtrack/jobtrack.service.ts` (11) | `include:{reminders:true}` → `with`; **2 transactions interactives** → `db.transaction`; upsert manuel par `id`. |
| `jobtrack/document.service.ts` (5) | Métadonnées fichiers CV/LM. |
| `auth/services/pending-user.service.ts` (8) | `deleteMany`, création/maj pending user. |
| `auth/services/verification.service.ts` (7) | `upsert` code de vérif → `.onConflictDoUpdate()`; `deleteMany`. |
| `scheduler/reminder-automation.service.ts` (2) | Sélection des rappels dus, maj `lastSentAt`/`nextReminderAt`. |

Correspondances :
- `findUnique/findFirst` → `db.query.<t>.findFirst({ where: eq(...) })`
- `findMany + include` → `db.query.<t>.findMany({ where, with, orderBy })`
- `create` → `db.insert(t).values(...).returning()` (prendre `[0]`)
- `update` → `db.update(t).set(...).where(eq(id)).returning()`
- `delete` → `db.delete(t).where(eq(id)).returning()`
- `upsert` → `db.insert(t).values(...).onConflictDoUpdate({ target, set })`
- `deleteMany/updateMany` → `db.delete/update(t).where(<conditions>)`
- `$transaction(async (tx)=>…)` → `db.transaction(async (tx)=>…)` (API identique)

**Mappers / interfaces** (`JobTrackMapper`, `ReminderMapper`, `UserMapper`, `AuthMapper`) : conservés, re-typés sur les lignes Drizzle (`InferSelectModel`). Les types `Prisma.XxxUpdateInput` remplacés par types inférés Drizzle. Les ~16 fichiers important `generated/prisma` (enums + types) repointés vers `src/db/`.

**Dates** : rappel mémoire — pour tout SQL brut Drizzle avec une `Date`, utiliser `.toISOString()`. Ici on reste sur l'API typée (colonnes `timestamp`), donc passage d'objets `Date` natifs ; pas de SQL brut prévu.

### 3. Validation Zod (`nestjs-zod`)

- Ajout `nestjs-zod` + `zod` ; retrait `class-validator` + `class-transformer`.
- ~13 DTOs → `class XxxDto extends createZodDto(zSchema)`. Report **fidèle** des règles et messages FR existants :
  - `register` : email, password (min 8 + 1 majuscule + 1 chiffre + 1 spécial via regex), username optionnel (min 3, `^[a-zA-Z0-9_]+$`).
  - `verify` : code `^\d{6}$`.
  - `create/update jobtrack` : title non vide, champs optionnels, `appliedAt` date ISO, enums `JobStatus`/`ContractType`.
  - reset/forgot password, change-password, login, refresh-token, totp, create-user, etc.
- `.strict()` sur les schémas d'entrée = parité avec `forbidNonWhitelisted`.
- `main.ts` : `app.useGlobalPipes(new ZodValidationPipe())` ; appel `patchNestjsSwagger()` avant `DocumentBuilder` pour préserver `/api/docs`.
- Enums partagés : les schémas Zod référencent les valeurs d'enum exportées par `src/db/enums.ts` (source unique).

### 4. Migrations & déploiement

- `drizzle-kit generate` produit un **baseline** = état actuel du schéma.
- Sur la base de prod ET la base locale, le baseline est **marqué comme déjà appliqué** : créer la table `__drizzle_migrations` et y insérer l'entrée du baseline **sans exécuter le DDL** (les tables existent déjà). → `drizzle-kit migrate` au boot ne re-créera rien.
  - ⚠️ Risque connu (mémoire « Drizzle migrate crash au boot = 502 ») : si le baseline n'est pas marqué appliqué, `migrate` rejoue le `CREATE TABLE` et crashe au démarrage. Le baselining est donc une étape **obligatoire et vérifiée** avant tout déploiement.
- `_prisma_migrations` laissée en place (inerte). Suppression optionnelle ultérieure.
- Dockerfile :
  - Stage build : retirer `pnpm prisma generate`.
  - Stage prod : retirer l'install de `prisma`/`@prisma/engines` ; ajouter `drizzle-kit` + `drizzle-orm` côté run, copier `drizzle/` (migrations) + `drizzle.config.ts`.
  - `CMD` : `pnpm drizzle-kit migrate && node dist/main.js`.

### 5. Plan de vérification (non-régression)

1. Restaurer le dump dans un **Postgres local jetable** (Docker, port dédié, ex. 5456) :
   `pg_restore --clean --if-exists -d <localdb> candidash_db_2026-05-30_102657.dump`.
2. **Baseline avant migration** : `pnpm build` + suite e2e existante (`test/`) contre cette base → état de référence vert.
3. Migration appliquée étape par étape ; après chaque étape : `pnpm build` + tests verts.
4. Smoke-test manuel de l'app locale : auth (register/verify/login/refresh), CRUD jobtrack, create/update with reminder, scheduler.
5. **Aucun déploiement prod** tant que la suite locale n'est pas verte ET le baselining vérifié sur une copie de prod.

## Stratégie d'exécution

Commits atomiques (l'utilisateur committe lui-même — convention J-Ned, pas de `git add`/`commit` auto) :

1. Couche `src/db/` (schema introspecté + enums + DrizzleService/Module + config) ; app démarre encore avec Prisma en parallèle si besoin de transition.
2. Service par service (users → jobtrack → document → pending-user → verification → scheduler), build + tests verts à chaque fois.
3. DTOs Zod + `main.ts` + Swagger.
4. Nettoyage Prisma (suppression deps/fichiers générés) + Dockerfile + migrations baseline.

## Hors périmètre (YAGNI)

- Pas de refactor non lié, pas de changement de comportement d'API, pas de durcissement des règles de validation.
- Pas de migration de schéma de données (structure identique).
- `ng-candidash-app` non touché.
- `groupBy`/`aggregate` Drizzle non implémentés (inutilisés).

## Critères de succès

- `pnpm build` OK, suite e2e existante verte contre la base restaurée.
- Plus aucune référence à `@prisma/*` / `src/generated/prisma` dans le code.
- Endpoints identiques (mêmes routes, payloads, codes d'erreur, doc Swagger).
- `drizzle-kit migrate` au boot ne modifie pas une base déjà au schéma courant (no-op vérifié).
