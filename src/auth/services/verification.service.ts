import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, lt } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle.service';
import { verificationCodes } from '../../db/schema';
import { MailService } from '../../mail/mail.service';
import * as crypto from 'crypto';

@Injectable()
export class VerificationService {
  constructor(
    private readonly drizzle: DrizzleService,
    private mailService: MailService,
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

  // Purge quotidienne : sans elle la table grossit indéfiniment
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredCodes(): Promise<void> {
    await this.drizzle.db
      .delete(verificationCodes)
      .where(lt(verificationCodes.expiresAt, new Date()));
  }

  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    return this.mailService.sendVerificationEmail(email, code);
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
