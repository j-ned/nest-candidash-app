import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import type { ContactMessageDto } from './dto/contact-message.dto';

const UNAVAILABLE_MESSAGE =
  "Le message n'a pas pu être envoyé, réessayez plus tard.";

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async send(dto: ContactMessageDto): Promise<void> {
    if (dto.website) {
      this.logger.warn('Message de contact ignoré (honeypot rempli)');
      return;
    }

    const recipient = this.configService.get<string>('CONTACT_RECIPIENT');
    if (!recipient) {
      this.logger.error(
        'CONTACT_RECIPIENT absent : formulaire de contact inactif',
      );
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }

    const sent = await this.mailService.sendContactMessage({
      to: recipient,
      name: dto.name,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
    });
    if (!sent) {
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
