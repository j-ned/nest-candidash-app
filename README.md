<div align="center">

# 🛠️ Candidash — Backend

### API NestJS pour le **suivi de candidatures d'emploi**

**JWT + 2FA TOTP · CRON relances · Prisma 7 · PostgreSQL · Swagger**

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Swagger](https://img.shields.io/badge/Swagger-Docs-85EA2D?style=for-the-badge&logo=swagger&logoColor=black)](https://swagger.io)
[![License](https://img.shields.io/badge/License-Private-333?style=for-the-badge)]()

[**🔗 API live**](https://api.candidash.j-ned.dev) · [**📚 Docs Swagger**](https://api.candidash.j-ned.dev/api/docs) · [**🖥️ Frontend Angular**](https://github.com/djoudj-dev/ng-candidash-app) · [**🏗️ Architecture**](#-architecture-modulaire)

</div>

---

## 📖 Sommaire

- [🎯 Mission](#-mission)
- [🧩 Architecture modulaire](#-architecture-modulaire)
- [🔐 Authentification](#-authentification)
- [⏰ Système de relances automatiques](#-système-de-relances-automatiques)
- [🗃️ Modèle de données](#️-modèle-de-données)
- [🛡️ Sécurité](#️-sécurité)
- [🧰 Stack technique](#-stack-technique)
- [🚀 Installation](#-installation)
- [🗺️ Roadmap](#️-roadmap)

---

## 🎯 Mission

Backend REST pour [Candidash](https://github.com/djoudj-dev/ng-candidash-app), le tracker de candidatures. Responsabilités :

- 🔐 **Authentification complète** — JWT + refresh rotation + 2FA TOTP + email verification + password reset
- 📝 **CRUD candidatures** (`JobTrack`) avec rappels liés et documents joints (CV/LM)
- 📧 **Relances automatisées** par email via CRON horaire
- 📦 **Stockage S3** — CV et lettres de motivation par candidature
- 📚 **Documentation API Swagger** auto-générée à `/api/docs`
- 📊 **Tracking utilisateur** — stats d'usage par compte (candidatures totales, taux de réponse, temps de réponse moyen)

---

## 🧩 Architecture modulaire

### Graphe des modules

```mermaid
graph TD
  Main[main.ts] --> App[AppModule]
  App --> Prisma[PrismaModule - Global]
  App --> Auth[AuthModule]
  App --> Users[UsersModule]
  App --> JobTrack[JobTrackModule]
  App --> Scheduler[SchedulerModule]
  App --> Mail[MailModule]
  App --> Storage[StorageModule]

  Auth -->|uses| Prisma
  Auth -->|sends| Mail
  Users -->|uses| Prisma
  JobTrack -->|uses| Prisma
  JobTrack -->|upload| Storage
  Scheduler -->|reads due| JobTrack
  Scheduler -->|sends| Mail
```

### Responsabilités par module

| Module | Rôle |
|--------|------|
| **AuthModule** | Signin, signup, email verification, password reset, 2FA TOTP, refresh rotation |
| **UsersModule** | Profil, changement mot de passe, suppression de compte (cascade) |
| **JobTrackModule** | CRUD candidatures + création relances + upload documents (CV/LM) |
| **SchedulerModule** | `@Cron(EVERY_HOUR)` → `ReminderAutomationService` envoie les relances dues |
| **MailModule** | `MailService` Nodemailer + templates HTML (verification, reset, relance) |
| **StorageModule** | `StorageService` S3-compatible (CV, LM PDF par candidature) |
| **PrismaModule** | Provider global de `PrismaService` (étend `PrismaClient`) |

### Patterns appliqués

- **Mappers statiques** — transformation Prisma → DTO de réponse dans chaque module (`AuthMapper`, `UserMapper`, `JobTrackMapper`)
- **DTOs validés** — `class-validator` sur tous les inputs, `ValidationPipe` global avec `whitelist: true` + `forbidNonWhitelisted: true`
- **Guards** — `JwtAuthGuard` protège les endpoints authentifiés, `LocalAuthGuard` pour le signin
- **Préfixe global** — toutes les routes sous `/api/v1/*`
- **Swagger** — décorateurs `@ApiTags`, `@ApiOperation`, `@ApiResponse` sur chaque controller

---

## 🔐 Authentification

### Flow complet signup + signin

```mermaid
sequenceDiagram
  participant U as User
  participant API as NestJS
  participant DB as PostgreSQL
  participant M as Mail

  rect rgb(40,40,60)
  Note over U,M: Signup
  U->>API: POST /auth/signup {email, password}
  API->>DB: Création PendingUser + VerificationCode
  API->>M: Envoi code vérification
  M-->>U: Email avec code 6 chiffres
  U->>API: POST /auth/verify-registration {email, code}
  API->>DB: PendingUser → User (bcrypt hash)
  end

  rect rgb(40,60,40)
  Note over U,API: Signin
  U->>API: POST /auth/signin {email, password}
  API->>DB: Vérif bcrypt
  alt 2FA activé
    API-->>U: {requires2FA: true, tempToken}
    U->>API: POST /auth/2fa/validate {tempToken, code}
  end
  API-->>U: {accessToken} + Set-Cookie refreshToken (HttpOnly)
  end

  Note over U,API: Access token 24h · Refresh 7j

  rect rgb(60,40,40)
  Note over U,API: Refresh rotation
  U->>API: POST /auth/refresh (cookie)
  API->>DB: Verif refreshToken + rotation
  API-->>U: {newAccessToken} + Set-Cookie (nouveau refresh)
  end
```

### Couches de sécurité

| Couche | Implémentation |
|--------|----------------|
| **Hash mots de passe** | `bcryptjs` 10 rounds |
| **Access token** | JWT HS256, 24h, retourné JSON (client en mémoire) |
| **Refresh token** | JWT 7j, cookie **HttpOnly** + rotation à chaque usage |
| **2FA TOTP** | `otpauth` + QR code via `qrcode`, secret chiffré (`TOTP_ENCRYPTION_KEY`) |
| **Codes de récupération** | Générés au setup 2FA, stockés hashés, usage unique |
| **Email verification** | Code 6 chiffres expirant + compteur `attempts` anti brute-force |
| **Password reset** | Token temporaire en DB (`resetPasswordToken` + `resetPasswordExpires`) |
| **Rate limiting** | `@nestjs/throttler` sur routes sensibles |

### Endpoints Auth

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/auth/signup` | Inscription → crée `PendingUser` + email de vérification |
| POST | `/auth/verify-registration` | Valide le code → crée le `User` définitif |
| POST | `/auth/resend-verification` | Renvoie un nouveau code |
| POST | `/auth/signin` | Connexion (gère le flag 2FA si activé) |
| POST | `/auth/refresh` | Rotation refresh token |
| POST | `/auth/signout` | Invalide refresh + cookie |
| POST | `/auth/forgot-password` | Envoie email avec token de reset |
| POST | `/auth/reset-password` | Nouveau mot de passe via token |
| POST | `/auth/totp/setup` | Génère secret + QR code |
| POST | `/auth/totp/verify-setup` | Active le 2FA après validation du premier code |
| POST | `/auth/totp/validate` | Valide le code TOTP à la connexion |
| POST | `/auth/totp/disable` | Désactive le 2FA (confirmation mot de passe) |
| POST | `/auth/totp/recovery` | Connexion via code de récupération |

---

## ⏰ Système de relances automatiques

Chaque candidature peut être associée à une `Reminder` (fréquence en jours : 3, 7, 14…). Un CRON horaire scanne les relances dues et envoie un email via le `MailService`.

```typescript
@Cron(CronExpression.EVERY_HOUR)
async handleReminders() {
  const due = await this.reminderService.findDue();
  for (const reminder of due) {
    await this.mailService.sendReminder(reminder.user.email, reminder.jobTrack);
    await this.reminderService.markAsSent(reminder.id);
  }
}
```

### Pourquoi horaire et pas quotidien ?

Déclencher toutes les heures permet à l'utilisateur de **choisir l'heure d'envoi** à la création. Une relance programmée à 9h UTC arrive à 9h UTC — pas à 3h du matin dans le fuseau du user.

### Schéma — une relance

```
Reminder {
  frequency: Int            // en jours (ex: 7)
  nextReminderAt: DateTime  // prochaine échéance
  lastSentAt: DateTime?     // dernière relance envoyée
  isActive: Boolean         // on/off
}
```

Après envoi : `lastSentAt = now()`, `nextReminderAt = now() + frequency days`.

---

## 🗃️ Modèle de données

### Schéma relationnel (Prisma)

```mermaid
erDiagram
  User ||--o{ JobTrack : creates
  User ||--|| UserTracking : stats
  User ||--o{ VerificationCode : "email verif"
  JobTrack ||--o{ Reminder : "relances"
  PendingUser }o--o{ VerificationCode : "pending verif"

  User {
    uuid id PK
    string email UK
    string password "bcrypt hash"
    enum role "ADMIN|USER"
    string totpSecret "chiffré"
    bool totpEnabled
    array totpRecoveryCodes
    string refreshToken
    string resetPasswordToken
  }

  JobTrack {
    uuid id PK
    string title
    string company
    string jobUrl
    enum status "APPLIED|INTERVIEW|REJECTED|ACCEPTED"
    enum contractType "CDI|CDD|INTERIM|STAGE|ALTERNANCE|FREELANCE"
    string cvFileName "S3"
    string lmFileName "S3"
    string notes
  }

  Reminder {
    uuid id PK
    int frequency "jours"
    datetime nextReminderAt
    datetime lastSentAt
    bool isActive
  }

  UserTracking {
    int totalApplications
    int totalRemindersSent
    json applicationsPerStatus
    float responseRate
    float remindersEffectiveness
    float avgResponseTime
  }
```

### Tables (nommage français)

| Model | Table | Contenu |
|-------|-------|---------|
| `User` | `Utilisateurs` | Comptes actifs |
| `JobTrack` | `Annonces` | Candidatures |
| `Reminder` | `Relance` | Rappels programmés |
| `UserTracking` | — | Stats utilisateur agrégées |
| `VerificationCode` | `CodesVerification` | Codes email 6 chiffres |
| `PendingUser` | `UtilisateursEnAttente` | Pré-inscription non vérifiée |

### Énumérations

| Enum | Valeurs |
|------|---------|
| `Role` | `ADMIN`, `USER` |
| `JobStatus` | `APPLIED`, `INTERVIEW`, `REJECTED`, `ACCEPTED` |
| `ContractType` | `CDI`, `CDD`, `INTERIM`, `STAGE`, `ALTERNANCE`, `FREELANCE` |

**Cascade** : toutes les relations enfants utilisent `onDelete: Cascade` → supprimer un `User` purge ses `JobTrack` → qui purgent leurs `Reminder`.

---

## 🛡️ Sécurité

### Checklist appliquée

- ✅ **Bcryptjs** pour les mots de passe (10 rounds)
- ✅ **Refresh token = cookie HttpOnly** — inaccessible au JS, protégé XSS
- ✅ **Rotation refresh** à chaque usage — un token ne sert qu'une fois
- ✅ **Access token court** (24h) — révocation naturelle
- ✅ **2FA TOTP** optionnel avec secret chiffré en base
- ✅ **Codes de récupération** hashés + usage unique
- ✅ **Rate limiting** par IP (`@nestjs/throttler`) sur endpoints critiques
- ✅ **Helmet** — headers HTTP (CSP, HSTS, X-Frame-Options, Referrer-Policy…)
- ✅ **ValidationPipe global** — `whitelist: true` + `forbidNonWhitelisted: true` (DTOs stricts)
- ✅ **CORS** restreint via `ALLOWED_ORIGINS` (liste blanche)
- ✅ **Compression gzip** sur toutes les réponses
- ✅ **Email verification obligatoire** avant activation du compte
- ✅ **Cookie parser** signé

### Variables d'environnement

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/candidash

# JWT (openssl rand -hex 64)
JWT_SECRET=...

# 2FA (openssl rand -hex 32)
TOTP_ENCRYPTION_KEY=...

# SMTP
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=...
MAIL_PASSWORD=...
MAIL_FROM_NAME=Candidash
MAIL_FROM_ADDRESS=noreply@candidash.j-ned.dev

# CORS
ALLOWED_ORIGINS=https://candidash.j-ned.dev,http://localhost:4200

# S3
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=candidash-documents

# Optionnel
PORT=3000
NODE_ENV=production
```

---

## 🧰 Stack technique

### Core

- **NestJS 11** — modules, controllers, guards, pipes, interceptors
- **TypeScript 5.7** — strict
- **Builder SWC** — compatible Prisma 7 ESM client (pas de webpack)
- **Express** (via `@nestjs/platform-express`)

### Data

- **Prisma 7** + `@prisma/adapter-pg`
- **PostgreSQL 17** (via `pg` 8.18)
- Migrations SQL versionnées dans `prisma/migrations/`
- Client généré dans `src/generated/prisma/` (gitignored)

### Auth & Sécurité

- `@nestjs/jwt` + `@nestjs/passport` + `passport` + `passport-jwt` + `passport-local`
- `bcryptjs` — hash mots de passe
- `otpauth` + `qrcode` — 2FA TOTP
- `helmet` — headers HTTP sécurisés
- `@nestjs/throttler` — rate limiting
- `cookie-parser` — cookies HttpOnly

### Stockage & Email

- `@aws-sdk/client-s3` — CV et LM par candidature
- `multer` — upload multipart/form-data
- `nodemailer` — envoi SMTP avec templates HTML

### Documentation & DX

- `@nestjs/swagger` — OpenAPI 3 auto-généré à `/api/docs`
- `class-validator` + `class-transformer` — DTOs typés
- `compression` — gzip middleware
- `@nestjs/schedule` — CRON jobs (`@Cron` decorator)

### Tests

- **Jest 30** + `ts-jest`
- **Supertest** pour les E2E
- Coverage : `pnpm test:cov`

---

## 🚀 Installation

> Pré-requis : Node.js ≥ 20, pnpm, PostgreSQL 17, Docker (optionnel)

```bash
# 1. Cloner
git clone https://github.com/djoudj-dev/nest-candidash-app.git
cd nest-candidash-app

# 2. Installer
pnpm install

# 3. Configurer
cp .env.example .env
# → remplir DATABASE_URL, JWT_SECRET, TOTP_ENCRYPTION_KEY, MAIL_*, S3_*

# 4. Base de données
pnpm prisma generate           # Client Prisma
pnpm prisma migrate dev        # Migrations

# 5. Lancer en dev
pnpm start:dev
# → API        : http://localhost:3000/api/v1
# → Swagger    : http://localhost:3000/api/docs
# → Health     : http://localhost:3000/api/v1/
```

### Scripts disponibles

| Commande | Action |
|----------|--------|
| `pnpm start:dev` | NestJS en watch mode |
| `pnpm build` | Build production (`nest build`) |
| `pnpm start:prod` | Lance `dist/main` |
| `pnpm lint` | ESLint --fix |
| `pnpm format` | Prettier |
| `pnpm test` | Tests unitaires (Jest) |
| `pnpm test:watch` | Tests watch |
| `pnpm test:cov` | Coverage |
| `pnpm test:e2e` | Tests E2E (supertest) |
| `pnpm prisma generate` | Regen client Prisma |
| `pnpm prisma migrate dev` | Nouvelle migration |

### Docker

```bash
docker build -t candidash-backend .
docker run --env-file .env -p 3000:3000 candidash-backend
```

---

## 🗺️ Roadmap

- [x] Auth JWT + refresh rotation + 2FA TOTP
- [x] Email verification + password reset
- [x] CRUD candidatures avec statuts et types de contrat
- [x] CRON horaire pour relances
- [x] Upload CV/LM sur S3
- [x] Swagger auto-généré
- [x] Helmet + Throttler + CORS strict
- [x] Mappers Prisma → DTOs
- [ ] Webhooks sortants (Discord, Slack) sur changement de statut
- [ ] Import batch de candidatures (CSV)
- [ ] Stats avancées par canal (Indeed, LinkedIn, WelcomeToTheJungle…)
- [ ] Export GDPR (bundle ZIP des données utilisateur)
- [ ] Rate limiting adaptatif (Redis backend)

---

## 🔗 Écosystème Candidash

- **Backend (ce dépôt)** — NestJS 11 + Prisma 7 + PostgreSQL
- **Frontend** — [ng-candidash-app](https://github.com/djoudj-dev/ng-candidash-app) · Angular 21 + Signals + Clean Architecture

---

<div align="center">

**Développé par [Julien Nédellec](https://j-ned.dev)**

[![Portfolio](https://img.shields.io/badge/Portfolio-j--ned.dev-4f46e5?style=for-the-badge)](https://j-ned.dev)
[![GitHub](https://img.shields.io/badge/GitHub-djoudj--dev-181717?style=for-the-badge&logo=github)](https://github.com/j-ned)

</div>
