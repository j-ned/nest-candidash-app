/**
 * Seed de démonstration — compte fictif + douzaine de candidatures réalistes.
 *
 * Usage : `pnpm db:seed:demo` (lit `.env`, cf. `.env.example`).
 *
 * - Réservé à une base LOCALE : refuse de tourner si `NODE_ENV=production`
 *   ou si l'hôte de `DATABASE_URL` n'est pas local.
 * - Idempotent : supprime le compte de démo (cascade sur annonces et relances)
 *   puis le recrée. Aucune autre donnée n'est touchée.
 * - Dates relatives au jour d'exécution : les relances restent « à venir »
 *   quel que soit le jour où le seed est rejoué.
 * - Entreprises inventées, URLs sur le domaine réservé `example.com`.
 */
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { jobTracks, reminders, users } from '../src/db/schema';
import type { ContractType, JobStatus } from '../src/db/schema';

// Identifiants du compte de démo — fictifs, valables uniquement en local.
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo@candidash.test';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo-Candidash-2026!';
const DEMO_USERNAME = 'Camille Demo';

const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);
const DAY_MS = 24 * 60 * 60 * 1000;

type DemoReminder = {
  readonly frequency: number;
  readonly nextInDays: number;
  readonly lastSentDaysAgo?: number;
  readonly isActive?: boolean;
};

type DemoApplication = {
  readonly title: string;
  readonly company: string;
  readonly slug: string;
  readonly status: JobStatus;
  readonly contractType: ContractType;
  readonly appliedDaysAgo?: number;
  readonly createdDaysAgo: number;
  readonly notes: string;
  readonly reminder?: DemoReminder;
};

const DEMO_APPLICATIONS: readonly DemoApplication[] = [
  {
    title: 'Développeur Angular confirmé',
    company: 'Kerlivio',
    slug: 'kerlivio-angular-confirme',
    status: 'INTERVIEW',
    contractType: 'CDI',
    appliedDaysAgo: 12,
    createdDaysAgo: 14,
    notes:
      'Entretien technique jeudi 10 h avec la lead front. Revoir signals, SSR et tests Vitest. Équipe de 6, télétravail 3 j/semaine.',
    reminder: { frequency: 7, nextInDays: 3, lastSentDaysAgo: 4 },
  },
  {
    title: 'Développeur full-stack Angular / NestJS',
    company: 'Ostrelle Santé',
    slug: 'ostrelle-fullstack',
    status: 'INTERVIEW',
    contractType: 'CDI',
    appliedDaysAgo: 18,
    createdDaysAgo: 20,
    notes:
      'Premier échange RH positif. Deuxième entretien avec le CTO : étude de cas sur une API de prise de rendez-vous.',
    reminder: { frequency: 5, nextInDays: 2, lastSentDaysAgo: 3 },
  },
  {
    title: 'Développeur front-end TypeScript',
    company: 'Pavaro Mobilité',
    slug: 'pavaro-front-typescript',
    status: 'APPLIED',
    contractType: 'CDI',
    appliedDaysAgo: 6,
    createdDaysAgo: 7,
    notes:
      'Candidature envoyée via le formulaire carrière. Stack Angular + Tailwind, produit B2B de gestion de flotte.',
    reminder: { frequency: 7, nextInDays: 1 },
  },
  {
    title: 'Ingénieur front-end Angular',
    company: 'Lisandre Énergie',
    slug: 'lisandre-ingenieur-front',
    status: 'APPLIED',
    contractType: 'CDD',
    appliedDaysAgo: 9,
    createdDaysAgo: 10,
    notes:
      'CDD de 12 mois, refonte du portail client. Contact : responsable du recrutement tech.',
    reminder: { frequency: 10, nextInDays: 4 },
  },
  {
    title: 'Développeur full-stack JavaScript',
    company: 'Brumaline',
    slug: 'brumaline-fullstack-js',
    status: 'APPLIED',
    contractType: 'FREELANCE',
    appliedDaysAgo: 3,
    createdDaysAgo: 3,
    notes:
      'Mission de 6 mois, TJM proposé dans la fourchette. Démarrage souhaité sous un mois.',
    reminder: { frequency: 5, nextInDays: 5 },
  },
  {
    title: 'Développeur Angular — design system',
    company: 'Talmeo Logistique',
    slug: 'talmeo-design-system',
    status: 'APPLIED',
    contractType: 'CDI',
    appliedDaysAgo: 15,
    createdDaysAgo: 16,
    notes:
      'Création et maintenance de la bibliothèque de composants. Relance envoyée la semaine dernière, sans réponse.',
    reminder: { frequency: 7, nextInDays: 6, lastSentDaysAgo: 1 },
  },
  {
    title: 'Développeur front-end React / Angular',
    company: 'Quillon Assurances',
    slug: 'quillon-front',
    status: 'INTERVIEW',
    contractType: 'CDI',
    appliedDaysAgo: 22,
    createdDaysAgo: 23,
    notes:
      'Test technique à rendre avant vendredi : tableau de bord accessible, critères WCAG AA.',
    reminder: { frequency: 3, nextInDays: 2 },
  },
  {
    title: 'Lead développeur front-end',
    company: 'Halbrane Numérique',
    slug: 'halbrane-lead-front',
    status: 'ACCEPTED',
    contractType: 'CDI',
    appliedDaysAgo: 35,
    createdDaysAgo: 38,
    notes:
      'Proposition reçue et acceptée. Arrivée prévue le mois prochain, onboarding d’une semaine.',
  },
  {
    title: 'Développeur full-stack Node.js',
    company: 'Corvelle Studio',
    slug: 'corvelle-fullstack-node',
    status: 'REJECTED',
    contractType: 'CDI',
    appliedDaysAgo: 28,
    createdDaysAgo: 30,
    notes:
      'Retour négatif après l’entretien final : profil plus orienté back recherché. Retour constructif.',
  },
  {
    title: 'Développeur Angular en alternance',
    company: 'Ambrelune Éditions',
    slug: 'ambrelune-alternance',
    status: 'REJECTED',
    contractType: 'ALTERNANCE',
    appliedDaysAgo: 40,
    createdDaysAgo: 41,
    notes: 'Poste pourvu en interne.',
  },
  {
    title: 'Développeur front-end Angular / Ionic',
    company: 'Marévia',
    slug: 'marevia-angular-ionic',
    status: 'TO_APPLY',
    contractType: 'CDI',
    createdDaysAgo: 2,
    notes:
      'Annonce repérée sur un job board. Adapter la lettre : application mobile de réservation nautique.',
  },
  {
    title: 'Développeur full-stack TypeScript',
    company: 'Orvalis Data',
    slug: 'orvalis-fullstack-ts',
    status: 'TO_APPLY',
    contractType: 'CDI',
    createdDaysAgo: 1,
    notes:
      'Recommandation d’un ancien collègue. Préparer un exemple de projet NestJS + Drizzle.',
  },
];

function assertLocalDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL est requis (cf. .env.example).');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed de démo interdit avec NODE_ENV=production.');
  }
  const { hostname } = new URL(databaseUrl);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `Seed de démo réservé à une base locale (hôte reçu : ${hostname}).`,
    );
  }
  return databaseUrl;
}

const daysFromNow = (now: Date, days: number): Date =>
  new Date(now.getTime() + days * DAY_MS);

async function seedDemo(): Promise<void> {
  const pool = new Pool({
    connectionString: assertLocalDatabase(process.env.DATABASE_URL),
  });
  const db = drizzle(pool, { schema });
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // Cascade : annonces et relances du compte de démo partent avec lui.
      await tx.delete(users).where(eq(users.email, DEMO_EMAIL));

      const [demoUser] = await tx
        .insert(users)
        .values({
          email: DEMO_EMAIL,
          username: DEMO_USERNAME,
          password: await bcrypt.hash(DEMO_PASSWORD, 12),
          role: 'USER',
          createdAt: daysFromNow(now, -60),
        })
        .returning();

      for (const application of DEMO_APPLICATIONS) {
        const createdAt = daysFromNow(now, -application.createdDaysAgo);
        const [jobTrack] = await tx
          .insert(jobTracks)
          .values({
            userId: demoUser.id,
            title: application.title,
            company: application.company,
            jobUrl: `https://emplois.example.com/offres/${application.slug}`,
            appliedAt:
              application.appliedDaysAgo === undefined
                ? null
                : daysFromNow(now, -application.appliedDaysAgo),
            status: application.status,
            contractType: application.contractType,
            notes: application.notes,
            createdAt,
            updatedAt: createdAt,
          })
          .returning();

        if (application.reminder) {
          const { frequency, nextInDays, lastSentDaysAgo, isActive } =
            application.reminder;
          await tx.insert(reminders).values({
            jobTrackId: jobTrack.id,
            frequency,
            nextReminderAt: daysFromNow(now, nextInDays),
            lastSentAt:
              lastSentDaysAgo === undefined
                ? null
                : daysFromNow(now, -lastSentDaysAgo),
            isActive: isActive ?? true,
          });
        }
      }
    });

    console.log(
      `Seed de démo appliqué : ${DEMO_APPLICATIONS.length} candidatures pour ${DEMO_EMAIL}.`,
    );
  } finally {
    await pool.end();
  }
}

seedDemo().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
