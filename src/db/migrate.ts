import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Migrations appliquées au démarrage du conteneur, avant l'API (cf. Dockerfile).
// Même dossier et même table de suivi (drizzle.__drizzle_migrations) que
// `drizzle-kit migrate`, sans embarquer drizzle-kit dans l'image de prod.
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Échec des migrations', error);
  process.exit(1);
});
