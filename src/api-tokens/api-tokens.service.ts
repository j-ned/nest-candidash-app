import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { apiTokens } from '../db/schema';
import { ApiToken, ApiTokenCreated } from './interfaces';
import { ApiTokenMapper } from './mappers/api-token.mapper';
import { AuthService } from '../auth/auth.service';
import type {
  LoginCredentials,
  TwoFactorPendingResponse,
} from '../auth/interfaces';

const TOKEN_PREFIX = 'ctok_';

export type ApiTokenLoginResult = ApiTokenCreated & { user: { email: string } };

@Injectable()
export class ApiTokensService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly authService: AuthService,
  ) {}

  async create(userId: string, nomAffiche: string): Promise<ApiTokenCreated> {
    const secret = TOKEN_PREFIX + randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(secret).digest('hex');

    const [row] = await this.drizzle.db
      .insert(apiTokens)
      .values({ userId, nomAffiche, tokenHash })
      .returning();

    return { ...ApiTokenMapper.mapApiTokenToApiToken(row), token: secret };
  }

  async findAllActiveByUser(userId: string): Promise<ApiToken[]> {
    const rows = await this.drizzle.db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .orderBy(desc(apiTokens.createdAt));

    return rows.map((r) => ApiTokenMapper.mapApiTokenToApiToken(r));
  }

  async revoke(id: string, userId: string): Promise<void> {
    const [row] = await this.drizzle.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, id));

    if (!row) {
      throw new NotFoundException("Jeton d'API introuvable");
    }
    if (row.userId !== userId) {
      throw new ForbiddenException("Accès refusé à ce jeton d'API");
    }

    await this.drizzle.db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(apiTokens.id, id));
  }

  async loginAndCreate(
    credentials: LoginCredentials,
    nomAffiche: string,
  ): Promise<ApiTokenLoginResult | TwoFactorPendingResponse> {
    const result = await this.authService.authenticateForApiToken(credentials);
    if ('requires2FA' in result) return result;
    const created = await this.create(result.id, nomAffiche);
    return { ...created, user: { email: result.email } };
  }

  async loginWithTotpAndCreate(
    tempToken: string,
    token: string,
    nomAffiche: string,
  ): Promise<ApiTokenLoginResult> {
    const result = await this.authService.verifyTotpForApiToken(
      tempToken,
      token,
    );
    const created = await this.create(result.id, nomAffiche);
    return { ...created, user: { email: result.email } };
  }
}
