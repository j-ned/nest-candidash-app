# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Candidash is a NestJS backend for tracking job applications (candidatures). It provides JWT authentication, CRUD for job applications with automated email reminders, and user management. The codebase uses French for comments, table names, and commit messages.

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build for production (nest build)
pnpm start:dev            # Development with watch mode
pnpm start:prod           # Run compiled build (node dist/main)
pnpm lint                 # ESLint with auto-fix
pnpm format               # Prettier formatting
pnpm test                 # Unit tests (Jest)
pnpm test:watch           # Unit tests in watch mode
pnpm test:cov             # Tests with coverage
pnpm test:e2e             # End-to-end tests
pnpm drizzle-kit generate # Generate a migration from src/db/schema.ts
pnpm drizzle-kit migrate  # Apply pending migrations
```

Run a single test: `pnpm jest -- --testPathPattern=<pattern>`

## Architecture

**NestJS 11 + TypeScript 5.7 (strict) + Drizzle ORM + PostgreSQL + SWC**

### Module Structure

- **DrizzleModule** — Global module providing `DrizzleService` (`node-postgres` pool + `db`) to all modules
- **AuthModule** — JWT authentication (access token 24h, refresh token 7d in HttpOnly cookie), email verification for registration, password reset flow
- **UsersModule** — User CRUD, password management
- **JobTrackModule** — Job application CRUD with reminder creation (`createWithReminder`)
- **SchedulerModule** — CRON job (`@Cron(EVERY_HOUR)`) in `ReminderAutomationService` that sends email reminders via `MailService`
- **MailModule** — Nodemailer-based email service with HTML templates

### Key Patterns

- **Mappers**: Each module has a `mappers/` directory with static mapper classes that transform Drizzle rows into domain types / response shapes (e.g., `AuthMapper`, `UserMapper`, `JobTrackMapper`) — no Drizzle row ever leaks over HTTP
- **DTOs with validation**: Request DTOs are Zod schemas via `nestjs-zod` (`createZodDto` + `.strict()`). Global `ZodValidationPipe`; Swagger doc post-processed with `cleanupOpenApiDoc`
- **Guards**: `JwtAuthGuard` protects authenticated endpoints
- **API prefix**: All routes prefixed with `/api/v1`
- **Swagger**: Available at `/api/docs`

### Database

Drizzle schema at `src/db/schema.ts`, config at `drizzle.config.ts`, migrations in `drizzle/`. Driver: `drizzle-orm/node-postgres` (pg `Pool`). Migrations are drizzle-kit generated; the `0000_baseline` migration is idempotent (`CREATE … IF NOT EXISTS` + `duplicate_object` guards) so `drizzle-kit migrate` at boot is a no-op on an already-provisioned DB. Table names are French via `pgTable('Utilisateurs', …)` etc. (`Utilisateurs`, `Annonces`, `Relance`, `CodesVerification`, `UtilisateursEnAttente`, `UserTracking`).

Key models: `User` → `JobTrack[]` → `Reminder[]`, `UserTracking`, `VerificationCode`, `PendingUser`. All child relations use `onDelete: Cascade`.

### Enums

- `Role`: ADMIN, USER
- `JobStatus`: APPLIED, INTERVIEW, REJECTED, ACCEPTED
- `ContractType`: CDI, CDD, INTERIM, STAGE, ALTERNANCE, FREELANCE

## Environment Variables

Required: `DATABASE_URL`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS`

Storage (Cloudflare R2, S3-compatible): `S3_ENDPOINT` (`https://<accountId>.r2.cloudflarestorage.com`), `S3_REGION` (`auto`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` (`candidash-app`, single bucket — CV/LM distinguished by key prefix `<userId>/<jobTrackId>/{cv,lm}.pdf`)

Optional: `PORT` (default 3000), `NODE_ENV`, `ALLOWED_ORIGINS` (comma-separated)

## Code Style

- Prettier: single quotes, trailing commas
- TypeScript `strict: true` (only `strictPropertyInitialization` off, for Swagger DTO classes)
- ESLint: `@typescript-eslint/no-explicit-any`, `no-floating-promises`, `no-unsafe-argument` are all `error`
- Commit messages: French, conventional commit format (e.g., `refactor(prisma): simplifie la gestion des erreurs`)