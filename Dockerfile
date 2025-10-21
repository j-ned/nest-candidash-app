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
COPY package.json pnpm-lock.yaml ./

# Installer uniquement les dépendances de prod
RUN pnpm install --prod --frozen-lockfile

# Copier le schéma Prisma et corriger les permissions
COPY prisma ./prisma
RUN mkdir -p /app/generated/prisma && chown -R node:node /app/generated

# Régénérer Prisma client en tant que root (avant de passer à node)
RUN npx prisma generate

# Copier le build depuis le stage précédent
COPY --from=builder /app/dist ./dist

# Assurer que l’utilisateur final a les droits nécessaires
RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
