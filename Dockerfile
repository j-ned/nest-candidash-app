# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

# Installer les dépendances
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copier le reste du code
COPY . .

# Génération du client Prisma
RUN pnpm prisma generate

# Construction du projet NestJS
RUN pnpm build


# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app
RUN corepack enable

# Copier les fichiers de dépendances
COPY --chown=node:node package.json pnpm-lock.yaml ./

# Installer uniquement les dépendances de prod
RUN pnpm install --prod --frozen-lockfile

# Copier le schema Prisma, les migrations et le CLI (pour prisma migrate deploy)
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --chown=node:node --from=builder /app/node_modules/dotenv ./node_modules/dotenv

# Copier le build depuis le stage précédent (inclut le client Prisma compilé dans dist/generated/)
COPY --chown=node:node --from=builder /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
