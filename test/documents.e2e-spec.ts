import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createE2eUser, generateE2eCredentials } from './e2e-credentials';

type Server = Parameters<typeof request>[0];

interface DocumentDto {
  id: string;
  kind: 'CV' | 'LETTER';
  title: string;
  markdown?: string;
  template: string;
  baseDocumentId: string | null;
  jobTrackId: string | null;
  updatedAt: string;
}

async function signUpAndLogin(
  app: INestApplication<Server>,
  label: string,
): Promise<string[]> {
  const server = app.getHttpServer();
  const { email, password } = generateE2eCredentials(label);
  await createE2eUser(app, { email, password, username: `e2e_${label}` });
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(login.status).toBe(200);
  const setCookie = login.headers['set-cookie'] as unknown as string[] | string;
  return Array.isArray(setCookie) ? setCookie : [setCookie];
}

describe('Documents (e2e)', () => {
  let app: INestApplication<Parameters<typeof request>[0]>;
  let server: Server;
  let alice: string[];
  let bob: string[];
  let cv: DocumentDto;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ZodValidationPipe());
    app.setGlobalPrefix('api/v1');
    await app.init();
    server = app.getHttpServer();
    alice = await signUpAndLogin(app, 'docs-alice');
    bob = await signUpAndLogin(app, 'docs-bob');
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses anonymous access', async () => {
    await request(server).get('/api/v1/documents').expect(401);
  });

  it('creates a CV with the default template', async () => {
    const res = await request(server)
      .post('/api/v1/documents')
      .set('Cookie', alice)
      .send({
        kind: 'CV',
        title: 'CV développeur',
        markdown: '# Camille\n\n## Expérience',
      })
      .expect(201);
    cv = res.body as DocumentDto;
    expect(cv).toMatchObject({
      kind: 'CV',
      title: 'CV développeur',
      markdown: '# Camille\n\n## Expérience',
      template: 'sobre',
      baseDocumentId: null,
      jobTrackId: null,
    });
  });

  it('rejects an invalid kind or an empty title', async () => {
    await request(server)
      .post('/api/v1/documents')
      .set('Cookie', alice)
      .send({ kind: 'RESUME', title: 'x' })
      .expect(400);
    await request(server)
      .post('/api/v1/documents')
      .set('Cookie', alice)
      .send({ kind: 'CV', title: '' })
      .expect(400);
  });

  it('lists the documents of the user without their content', async () => {
    const res = await request(server)
      .get('/api/v1/documents')
      .set('Cookie', alice)
      .expect(200);
    const list = res.body as DocumentDto[];
    expect(list.map((d) => d.id)).toContain(cv.id);
    expect(list[0].markdown).toBeUndefined();
  });

  it('updates the content and the title', async () => {
    const res = await request(server)
      .put(`/api/v1/documents/${cv.id}`)
      .set('Cookie', alice)
      .send({ title: 'CV Angular', markdown: '# Camille\n\n- Angular 22' })
      .expect(200);
    expect(res.body).toMatchObject({
      title: 'CV Angular',
      markdown: '# Camille\n\n- Angular 22',
    });
  });

  it('duplicates a document as an independent variant', async () => {
    const res = await request(server)
      .post(`/api/v1/documents/${cv.id}/duplicate`)
      .set('Cookie', alice)
      .send({ title: 'CV Angular — Acme' })
      .expect(201);
    const copy = res.body as DocumentDto;
    expect(copy).toMatchObject({
      kind: 'CV',
      title: 'CV Angular — Acme',
      markdown: '# Camille\n\n- Angular 22',
      baseDocumentId: cv.id,
    });
    expect(copy.id).not.toBe(cv.id);
  });

  it("never exposes or changes another user's document", async () => {
    await request(server)
      .get(`/api/v1/documents/${cv.id}`)
      .set('Cookie', bob)
      .expect(404);
    await request(server)
      .put(`/api/v1/documents/${cv.id}`)
      .set('Cookie', bob)
      .send({ title: 'piraté' })
      .expect(404);
    await request(server)
      .delete(`/api/v1/documents/${cv.id}`)
      .set('Cookie', bob)
      .expect(404);
    await request(server)
      .post(`/api/v1/documents/${cv.id}/duplicate`)
      .set('Cookie', bob)
      .send({})
      .expect(404);
    const list = await request(server)
      .get('/api/v1/documents')
      .set('Cookie', bob)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('refuses to attach a document to an application of another user', async () => {
    await request(server)
      .post('/api/v1/documents')
      .set('Cookie', bob)
      .send({
        kind: 'LETTER',
        title: 'Lettre',
        jobTrackId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(404);
  });

  it('exports the document as a PDF with selectable text', async () => {
    const res = await request(server)
      .get(`/api/v1/documents/${cv.id}/pdf`)
      .set('Cookie', alice)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="cv-angular.pdf"',
    );
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("never exports another user's document", async () => {
    await request(server)
      .get(`/api/v1/documents/${cv.id}/pdf`)
      .set('Cookie', bob)
      .expect(404);
  });

  it('refuses to attach a document linked to no application', async () => {
    const res = await request(server)
      .post(`/api/v1/documents/${cv.id}/attach`)
      .set('Cookie', alice)
      .expect(400);
    expect((res.body as { message: string }).message).toBe(
      'Ce document n’est rattaché à aucune candidature',
    );
  });

  it('deletes a document', async () => {
    await request(server)
      .delete(`/api/v1/documents/${cv.id}`)
      .set('Cookie', alice)
      .expect(204);
    await request(server)
      .get(`/api/v1/documents/${cv.id}`)
      .set('Cookie', alice)
      .expect(404);
  });
});
