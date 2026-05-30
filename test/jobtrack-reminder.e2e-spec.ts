import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../src/app.module';

interface LoginDto {
  email: string;
  password: string;
}

interface AuthResponseDto {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    username?: string | null;
    role: string;
  };
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
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api/v1');
  await app.init();
}

// Credentials provided by the user
const TEST_EMAIL = 'contact@djoudj.dev';
const TEST_PASSWORD = 'a4R!y5euSPf#8Vx4wRqMf6!B';

// Supertest helper with prefix
function api(server: Parameters<typeof request>[0]) {
  return request(server);
}

describe('JobTrack & Reminder CRUD (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let authToken: string;
  let createdJobTrack: JobTrackResponseDto;
  let createdReminder: ReminderResponseDto;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await configureApp(app);
    httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];

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
    const auth: AuthResponseDto = loginRes.body as AuthResponseDto;
    expect(auth.access_token).toBeDefined();
    authToken = auth.access_token;
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
      .set('Authorization', `Bearer ${authToken}`)
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
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const list: JobTrackResponseDto[] = res.body as JobTrackResponseDto[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.find((j) => j.id === createdJobTrack.id)).toBeTruthy();
  });

  it('should get jobtracks by status', async () => {
    const res = await api(httpServer)
      .get(`/api/v1/jobtrack/status/${JobStatus.APPLIED}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const list: JobTrackResponseDto[] = res.body as JobTrackResponseDto[];
    expect(list.every((j) => j.status === JobStatus.APPLIED)).toBe(true);
  });

  it('should get jobtrack by id', async () => {
    const res = await api(httpServer)
      .get(`/api/v1/jobtrack/${createdJobTrack.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const jt: JobTrackResponseDto = res.body as JobTrackResponseDto;
    expect(jt.id).toBe(createdJobTrack.id);
  });

  it('should update jobtrack', async () => {
    const update: UpdateJobTrackDto = {
      title: 'Développeur Backend Node.js Senior',
      notes: 'Relancé par email',
      status: JobStatus.INTERVIEW,
    };

    const res = await api(httpServer)
      .put(`/api/v1/jobtrack/${createdJobTrack.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(update);
    expect(res.status).toBe(200);
    const jt: JobTrackResponseDto = res.body as JobTrackResponseDto;
    expect(jt.title).toBe(update.title);
    expect(jt.status).toBe(update.status);
  });

  it('should list reminders for the jobtrack', async () => {
    const res = await api(httpServer)
      .get(`/api/v1/reminder/jobtrack/${createdJobTrack.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const list: ReminderResponseDto[] = res.body as ReminderResponseDto[];
    expect(list.find((r) => r.id === createdReminder.id)).toBeTruthy();
  });

  it('should update reminder', async () => {
    const next = new Date();
    next.setDate(next.getDate() + 2);
    const update: UpdateReminderDto = {
      frequency: 10,
      nextReminderAt: next.toISOString(),
      isActive: true,
    };
    const res = await api(httpServer)
      .put(`/api/v1/reminder/${createdReminder.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(update);
    expect(res.status).toBe(200);
    const r: ReminderResponseDto = res.body as ReminderResponseDto;
    expect(r.frequency).toBe(update.frequency);
  });

  it('should mark reminder as sent', async () => {
    const res = await api(httpServer)
      .put(`/api/v1/reminder/${createdReminder.id}/mark-sent`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const r: ReminderResponseDto = res.body as ReminderResponseDto;
    expect(r.lastSentAt).toBeTruthy();
  });

  it('should delete reminder', async () => {
    const res = await api(httpServer)
      .delete(`/api/v1/reminder/${createdReminder.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
  });

  it('should delete jobtrack', async () => {
    const res = await api(httpServer)
      .delete(`/api/v1/jobtrack/${createdJobTrack.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
  });
});
