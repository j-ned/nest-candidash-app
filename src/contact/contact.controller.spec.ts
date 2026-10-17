import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { App } from 'supertest/types';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

describe('ContactController', () => {
  let app: INestApplication<App>;
  const contactService = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [{ provide: ContactService, useValue: contactService }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => contactService.send.mockClear());

  const valid = {
    name: 'Camille',
    email: 'camille@example.com',
    subject: 'Question sur Candidash',
    message: 'Bonjour, une question sur l’extension.',
  };

  it('accepts a valid message with 204', async () => {
    await request(app.getHttpServer()).post('/contact').send(valid).expect(204);

    expect(contactService.send).toHaveBeenCalledWith(valid);
  });

  it.each([
    ['an invalid email', { ...valid, email: 'pas-un-email' }],
    ['a too short message', { ...valid, message: 'court' }],
    ['an unknown field', { ...valid, admin: true }],
  ])('rejects %s with 400', async (_case, body) => {
    await request(app.getHttpServer()).post('/contact').send(body).expect(400);

    expect(contactService.send).not.toHaveBeenCalled();
  });
});
