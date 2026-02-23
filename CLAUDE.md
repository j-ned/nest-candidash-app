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
pnpm prisma generate      # Generate Prisma client
pnpm prisma migrate dev   # Run database migrations (development)
```

Run a single test: `pnpm jest -- --testPathPattern=<pattern>`

## Architecture

**NestJS 11 + TypeScript 5.7 + Prisma 7 + PostgreSQL + SWC**

### Module Structure

- **PrismaModule** — Global module providing `PrismaService` (extends `PrismaClient`) to all modules
- **AuthModule** — JWT authentication (access token 24h, refresh token 7d in HttpOnly cookie), email verification for registration, password reset flow
- **UsersModule** — User CRUD, password management
- **JobTrackModule** — Job application CRUD with reminder creation (`createWithReminder`)
- **SchedulerModule** — CRON job (`@Cron(EVERY_HOUR)`) in `ReminderAutomationService` that sends email reminders via `MailService`
- **MailModule** — Nodemailer-based email service with HTML templates

### Key Patterns

- **Mappers**: Each module has a `mappers/` directory with static mapper classes that transform between Prisma models and response DTOs (e.g., `AuthMapper`, `UserMapper`, `JobTrackMapper`)
- **DTOs with validation**: Request DTOs use `class-validator` decorators. Global `ValidationPipe` is configured with `whitelist: true` and `forbidNonWhitelisted: true`
- **Guards**: `JwtAuthGuard` protects authenticated endpoints
- **API prefix**: All routes prefixed with `/api/v1`
- **Swagger**: Available at `/api/docs`

### Database

Prisma schema at `prisma/schema.prisma`, config at `prisma.config.ts`. Prisma client output: `src/generated/prisma/`. Uses PrismaPg adapter with `@prisma/adapter-pg`. Builder is SWC (handles Prisma 7 ESM client). Table names are French (e.g., `Utilisateurs`, `Annonces`, `Relance`, `CodesVerification`, `UtilisateursEnAttente`).

Key models: `User` → `JobTrack[]` → `Reminder[]`, `UserTracking`, `VerificationCode`, `PendingUser`. All child relations use `onDelete: Cascade`.

### Enums

- `Role`: ADMIN, USER
- `JobStatus`: APPLIED, PENDING, INTERVIEW, REJECTED, ACCEPTED
- `ContractType`: CDI, CDD, INTERIM, STAGE, ALTERNANCE, FREELANCE

## Environment Variables

Required: `DATABASE_URL`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS`

Optional: `PORT` (default 3000), `NODE_ENV`, `ALLOWED_ORIGINS` (comma-separated)

## Code Style

- Prettier: single quotes, trailing commas
- ESLint: `@typescript-eslint/no-explicit-any` is off; `no-floating-promises` and `no-unsafe-argument` are warnings
- Commit messages: French, conventional commit format (e.g., `refactor(prisma): simplifie la gestion des erreurs`)