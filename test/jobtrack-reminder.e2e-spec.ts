import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { e2eCredentialsFromEnv } from './e2e-credentials';

interface LoginDto {
  email: string;
  password: string;
}

interface CreateUserDto {
  email: string;
  password: string;
  username?: string;
}

// JobTrack
import { JobStatus } from '../src/db/schema';

interface CreateJobTrackDto {
  title: string;
  company?: string;
  status?: JobStatus;
  jobUrl?: string;
  notes?: string;
}

interface UpdateJobTrackDto extends Partial<CreateJobTrackDto> {
  id?: string;
}

interface JobTrackResponseDto extends CreateJobTrackDto {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// Reminder
interface CreateReminderDto {
  jobTrackId: string;
  frequency: number;
  nextReminderAt: string; // ISO
  isActive?: boolean;
}

interface UpdateReminderDto extends Partial<CreateReminderDto> {
  id?: string;
}

interface ReminderResponseDto {
  id: string;
  jobTrackId: string;
  frequency: number;
  nextReminderAt: string;
  lastSentAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface JobTrackWithReminderResponseDto extends JobTrackResponseDto {
  reminder: ReminderResponseDto;
}

// Helper to configure the app similarly to main.ts
async function configureApp(app: INestApplication): Promise<void> {
  // cookie-parser : indispensable pour que le JwtAuthGuard lise le cookie
  // HttpOnly `access_token` (parité avec main.ts, auth cookie-only).
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api/v1');
  await app.init();
}

const { email: TEST_EMAIL, password: TEST_PASSWORD } =
  e2eCredentialsFromEnv('jobtrack-reminder');

// Supertest helper with prefix
function api(server: Parameters<typeof request>[0]) {
  return request(server);
}

describe('JobTrack & Reminder CRUD (e2e)', () => {
  let app: INestApplication<Parameters<typeof request>[0]>;
  let httpServer: Parameters<typeof request>[0];
  let authCookies: string[];
  let createdJobTrack: JobTrackResponseDto;
  let createdReminder: ReminderResponseDto;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await configureApp(app);
    httpServer = app.getHttpServer();

    // Try login first
    const loginBody: LoginDto = { email: TEST_EMAIL, password: TEST_PASSWORD };
    let loginRes = await api(httpServer)
      .post('/api/v1/auth/login')
      .send(loginBody);

    if (loginRes.status === 401) {
      // Create user then login
      const createUserBody: CreateUserDto = {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        username: 'e2e-user',
      };
      // user creation is public in UsersController
      const createUserRes = await api(httpServer)
        .post('/api/v1/accounts/registration')
        .send(createUserBody);
      expect(createUserRes.status).toBeLessThan(400);
      // Retry login
      loginRes = await api(httpServer)
        .post('/api/v1/auth/login')
        .send(loginBody);
    }

    expect(loginRes.status).toBe(200);
    // Cookie-only : on capture les cookies HttpOnly (access_token + refresh_token)
    // pour les rejouer sur les requêtes authentifiées (plus de Bearer / token dans le body).
    const setCookie = loginRes.headers['set-cookie'] as unknown as
      string[] | string | undefined;
    authCookies = Array.isArray(setCookie)
      ? setCookie
      : setCookie
        ? [setCookie]
        : [];
    expect(authCookies.some((c) => c.startsWith('access_token='))).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a jobtrack with initial reminder (single POST)', async () => {
    const nextAt = new Date();
    nextAt.setDate(nextAt.getDate() + 1);
    const payload = {
      title: 'Développeur Backend Node.js',
      company: 'ACME Corp',
      status: JobStatus.APPLIED,
      jobUrl: 'https://example.com/jobs/123',
      notes: 'Envoyé via le site carrière',
      frequency: 7,
      nextReminderAt: nextAt.toISOString(),
      isActive: true,
    };

    const res = await api(httpServer)
      .post('/api/v1/jobtrack/with-reminder')
      .set('Cookie', authCookies)
      .send(payload);
    expect(res.status).toBe(201);
    const created = res.body as unknown as JobTrackWithReminderResponseDto;
    expect(created.id).toBeDefined();
    expect(created.title).toBe(payload.title);
    createdJobTrack = {
      id: created.id,
      userId: created.userId,
      title: created.title,
      company: created.company,
      status: created.status,
      jobUrl: created.jobUrl,
      notes: created.notes,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
    createdReminder = created.reminder;
    expect(createdReminder).toBeDefined();
    expect(createdReminder.jobTrackId).toBe(createdJobTrack.id);
  });

  it('should list user jobtracks', async () => {
    const res = await api(httpServer)
      .get('/api/v1/jobtrack')
      .set('Cookie', authCookies);
    expect(res.status).toBe(200);
    const list: JobTrackResponseDto[] = res.body as JobTrackResponseDto[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.find((j) => j.id === createdJobTrack.id)).toBeTruthy();
  });

  it('should get jobtracks by status', async () => {
    const res = await api(httpServer)
      .get(`/api/v1/jobtrack/status/${JobStatus.APPLIED}`)
      .set('Cookie', authCookies);
    expect(res.status).toBe(200);
    const list: JobTrackResponseDto[] = res.body as JobTrackResponseDto[];
    expect(list.every((j) => j.status === JobStatus.APPLIED)).toBe(true);
  });

  it('should get jobtrack by id', async () => {
    const res = await api(httpServer)
      .get(`/api/v1/jobtrack/${createdJobTrack.id}`)
      .set('Cookie', authCookies);
    expect(res.status).toBe(200);
    const jt: JobTrackResponseDto = res.body as JobTrackResponseDto;
    expect(jt.id).toBe(createdJobTrack.id);
  });

  it('should update the jobtrack and its reminder in a single with-reminder PUT', async () => {
    const next = new Date();
    next.setDate(next.getDate() + 2);
    // L'annonce et son rappel se mettent à jour ensemble : il n'existe pas de
    // contrôleur `reminder` autonome, tout passe par l'endpoint with-reminder.
    const update: UpdateJobTrackDto & UpdateReminderDto = {
      title: 'Développeur Backend Node.js Senior',
      notes: 'Relancé par email',
      status: JobStatus.INTERVIEW,
      frequency: 10,
      nextReminderAt: next.toISOString(),
      isActive: true,
    };

    const res = await api(httpServer)
      .put(`/api/v1/jobtrack/${createdJobTrack.id}/with-reminder`)
      .set('Cookie', authCookies)
      .send(update);
    expect(res.status).toBe(200);
    const updated = res.body as unknown as JobTrackWithReminderResponseDto;
    expect(updated.title).toBe(update.title);
    expect(updated.status).toBe(update.status);
    expect(updated.reminder).toBeDefined();
    expect(updated.reminder.frequency).toBe(update.frequency);
  });

  describe('passage au statut « Envoyée » sans réglage de relance', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    async function putStatus(
      id: string,
      body: Record<string, unknown>,
      upsert = false,
    ): Promise<JobTrackWithReminderResponseDto> {
      const res = await api(httpServer)
        .put(`/api/v1/jobtrack/${id}/with-reminder?upsert=${upsert}`)
        .set('Cookie', authCookies)
        .send(body);
      expect(res.status).toBe(200);
      const json: unknown = res.body;
      return json as JobTrackWithReminderResponseDto;
    }

    async function spotted(): Promise<string> {
      const id = randomUUID();
      const created = await putStatus(
        id,
        { title: 'Offre repérée', status: JobStatus.TO_APPLY },
        true,
      );
      expect(created.reminder).toBeUndefined();
      return id;
    }

    it('programme un rappel à 7 jours pour relancer', async () => {
      const id = await spotted();
      const before = Date.now();

      const moved = await putStatus(id, { status: JobStatus.APPLIED });

      expect(moved.reminder.isActive).toBe(true);
      expect(moved.reminder.frequency).toBe(7);
      const nextAt = new Date(moved.reminder.nextReminderAt).getTime();
      expect(nextAt).toBeGreaterThanOrEqual(before + 7 * DAY_MS - 1000);
      expect(nextAt).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS + 1000);
    });

    it('ne reprogramme pas un rappel déjà actif', async () => {
      const id = await spotted();
      const first = await putStatus(id, { status: JobStatus.APPLIED });

      const again = await putStatus(id, {
        title: 'Offre renommée',
        status: JobStatus.APPLIED,
      });

      expect(again.reminder.id).toBe(first.reminder.id);
      expect(again.reminder.nextReminderAt).toBe(first.reminder.nextReminderAt);
    });

    it('réactive le rappel coupé par un refus, avec sa fréquence', async () => {
      const id = await spotted();
      await putStatus(id, {
        status: JobStatus.APPLIED,
        frequency: 14,
        nextReminderAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
      });
      const rejected = await putStatus(id, { status: JobStatus.REJECTED });
      expect(rejected.reminder.isActive).toBe(false);

      const back = await putStatus(id, { status: JobStatus.APPLIED });

      expect(back.reminder.id).toBe(rejected.reminder.id);
      expect(back.reminder.isActive).toBe(true);
      expect(back.reminder.frequency).toBe(14);
    });

    it('respecte un rappel explicitement désactivé', async () => {
      const id = await spotted();

      const moved = await putStatus(id, {
        status: JobStatus.APPLIED,
        isActive: false,
      });

      expect(moved.reminder).toBeUndefined();
    });
  });

  it('should delete jobtrack', async () => {
    const res = await api(httpServer)
      .delete(`/api/v1/jobtrack/${createdJobTrack.id}`)
      .set('Cookie', authCookies);
    expect(res.status).toBe(200);
  });
});
