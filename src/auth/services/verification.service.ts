import { Injectable } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle.service';
import { verificationCodes } from '../../db/schema';
import { EmailService } from './email.service';
import * as crypto from 'crypto';

@Injectable()
export class VerificationService {
  constructor(
    private readonly drizzle: DrizzleService,
    private emailService: EmailService,
  ) {}

  generateVerificationCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  async saveVerificationCode(email: string, code: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Code expire dans 10 minutes

    await this.drizzle.db
      .insert(verificationCodes)
      .values({ email, code, expiresAt, attempts: 0 })
      .onConflictDoUpdate({
        target: verificationCodes.email,
        set: { code, expiresAt, attempts: 0, updatedAt: new Date() },
      });
  }

  async verifyCode(email: string, code: string): Promise<boolean> {
    const verification =
      await this.drizzle.db.query.verificationCodes.findFirst({
        where: eq(verificationCodes.email, email),
      });

    if (!verification) {
      return false;
    }

    if (new Date() > verification.expiresAt) {
      await this.drizzle.db
        .delete(verificationCodes)
        .where(eq(verificationCodes.email, email));
      return false;
    }

    if (verification.attempts >= 5) {
      return false;
    }

    await this.drizzle.db
      .update(verificationCodes)
      .set({ attempts: verification.attempts + 1, updatedAt: new Date() })
      .where(eq(verificationCodes.email, email));

    if (verification.code === code) {
      await this.drizzle.db
        .delete(verificationCodes)
        .where(eq(verificationCodes.email, email));
      return true;
    }

    return false;
  }

  async cleanupExpiredCodes(): Promise<void> {
    await this.drizzle.db
      .delete(verificationCodes)
      .where(lt(verificationCodes.expiresAt, new Date()));
  }

  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    return this.emailService.sendVerificationEmail(email, code);
  }

  async canResendCode(email: string): Promise<boolean> {
    const verification =
      await this.drizzle.db.query.verificationCodes.findFirst({
        where: eq(verificationCodes.email, email),
      });

    if (!verification) {
      return true;
    }

    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

    return verification.updatedAt <= oneMinuteAgo;
  }
}
