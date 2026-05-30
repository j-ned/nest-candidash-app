# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

# Installer les dépendances
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copier le reste du code
COPY . .

# Construction du projet NestJS
RUN pnpm build


# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app
RUN corepack enable

# Copier les fichiers de dépendances
COPY --chown=node:node package.json pnpm-lock.yaml ./

# Installer les dépendances de prod + drizzle-kit (pour `drizzle-kit migrate` au boot)
RUN pnpm install --frozen-lockfile --prod && pnpm add -D drizzle-kit drizzle-orm

# Copier les migrations Drizzle, la config et le schéma (requis par drizzle-kit migrate)
COPY --chown=node:node --from=builder /app/drizzle ./drizzle
COPY --chown=node:node --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --chown=node:node --from=builder /app/src/db/schema.ts ./src/db/schema.ts

# Copier le build depuis le stage précédent
COPY --chown=node:node --from=builder /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>{if(!r.ok)throw r.status})"

# Migration baseline idempotente (no-op si la base est déjà au schéma courant) puis démarrage.
CMD ["sh", "-c", "pnpm drizzle-kit migrate && node dist/main.js"]
