import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request as ExpressRequest } from 'express';
import { DrizzleService } from '../../db/drizzle.service';
import { apiTokens } from '../../db/schema';

interface RequestWithUser extends ExpressRequest {
  user?: { sub: string };
  apiTokenId?: string;
}

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly drizzle: DrizzleService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("Jeton d'API manquant");
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const [row] = await this.drizzle.db
      .select()
      .from(apiTokens)
      .where(
        and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)),
      )
      .limit(1);

    if (!row) {
      throw new UnauthorizedException("Jeton d'API invalide ou révoqué");
    }

    await this.drizzle.db
      .update(apiTokens)
      .set({ derniereUtilisation: new Date() })
      .where(eq(apiTokens.id, row.id));

    request.user = { sub: row.userId };
    request.apiTokenId = row.id;
    return true;
  }

  private extractBearerToken(request: RequestWithUser): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : undefined;
  }
}
