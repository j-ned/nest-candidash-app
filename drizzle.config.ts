import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// `.env` local uniquement : absent de l'image (variables injectées par Dokploy). Comme
// `dotenv/config`, n'écrase pas une variable déjà définie, sans dépendre d'un paquet non déclaré.
if (existsSync('.env')) process.loadEnvFile('.env');

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
