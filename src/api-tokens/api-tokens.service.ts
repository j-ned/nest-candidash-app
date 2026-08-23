import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { apiTokens } from '../db/schema';
import { ApiToken, ApiTokenCreated } from './interfaces';
import { ApiTokenMapper } from './mappers/api-token.mapper';

const TOKEN_PREFIX = 'ctok_';

@Injectable()
export class ApiTokensService {
  constructor(private readonly drizzle: DrizzleService) {}

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
}
