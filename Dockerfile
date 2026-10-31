# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app
RUN corepack enable

# Installer les dépendances
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copier le reste du code
COPY . .

# Construction du projet NestJS
RUN pnpm build


# Stage 2: Production
FROM node:24-alpine AS production

WORKDIR /app
RUN corepack enable

# Copier les fichiers de dépendances
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Dépendances de prod uniquement (drizzle-kit reste un outil de dev)
RUN pnpm install --frozen-lockfile --prod

# Migrations SQL, appliquées au démarrage par dist/db/migrate.js
COPY --chown=node:node --from=builder /app/drizzle ./drizzle

# Copier le build depuis le stage précédent
COPY --chown=node:node --from=builder /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>{if(!r.ok)throw r.status})"

# Migrations (no-op si la base est déjà au schéma courant) puis démarrage.
# `exec` : rend explicite que node devient le processus n° 1 et reçoit SIGTERM (le shell le fait
# déjà par optimisation de dernière commande, mais on ne veut pas en dépendre).
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/main.js"]
