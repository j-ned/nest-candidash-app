import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactService } from './contact.service';
import { MailService } from '../mail/mail.service';
import type { ContactMessageDto } from './dto/contact-message.dto';

describe('ContactService', () => {
  const message: ContactMessageDto = {
    name: 'Camille',
    email: 'camille@example.com',
    subject: 'Question sur Candidash',
    message: 'Bonjour, une question sur l’extension.',
  };

  function setup(recipient: string | undefined, sent = true) {
    const mail = { sendContactMessage: jest.fn().mockResolvedValue(sent) };
    const config = { get: jest.fn().mockReturnValue(recipient) };
    const service = new ContactService(
      mail as unknown as MailService,
      config as unknown as ConfigService,
    );
    return { service, mail };
  }

  it('forwards the message to CONTACT_RECIPIENT', async () => {
    const { service, mail } = setup('owner@example.com');

    await service.send(message);

    expect(mail.sendContactMessage).toHaveBeenCalledWith({
      to: 'owner@example.com',
      name: 'Camille',
      email: 'camille@example.com',
      subject: 'Question sur Candidash',
      message: 'Bonjour, une question sur l’extension.',
    });
  });

  it('silently drops a message whose honeypot is filled', async () => {
    const { service, mail } = setup('owner@example.com');

    await service.send({ ...message, website: 'https://spam.example' });

    expect(mail.sendContactMessage).not.toHaveBeenCalled();
  });

  it('is unavailable when CONTACT_RECIPIENT is not configured', async () => {
    const { service, mail } = setup(undefined);

    await expect(service.send(message)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mail.sendContactMessage).not.toHaveBeenCalled();
  });

  it('is unavailable when the SMTP send fails', async () => {
    const { service } = setup('owner@example.com', false);

    await expect(service.send(message)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
