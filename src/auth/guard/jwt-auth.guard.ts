import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { CanActivate } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request as ExpressRequest } from 'express';
import { JwtPayload } from '../interfaces';

interface RequestWithUser extends ExpressRequest {
  user?: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    // Cookie-only : le token vit exclusivement dans le cookie HttpOnly
    // `access_token`. Aucun fallback header Bearer (token jamais exposé au JS).
    const token = this.extractTokenFromCookie(request);
    if (!token) {
      throw new UnauthorizedException("Jeton d'authentification manquant");
    }

    let payload: JwtPayload & { type?: unknown };
    try {
      // Secret issu de la config globale JwtModule (getOrThrow JWT_SECRET) ;
      // aucun fallback en dur, pour éviter toute forge de token.
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Jeton d'authentification invalide");
    }

    // Refresh et `2fa-pending` partagent le secret mais portent un `type` :
    // seul un access token (sans `type`) ouvre une route protégée, sinon le
    // jeton temporaire 2FA suffirait à contourner la double authentification.
    if (payload.type !== undefined) {
      throw new UnauthorizedException("Jeton d'authentification invalide");
    }

    request.user = payload;
    return true;
  }

  private extractTokenFromCookie(request: RequestWithUser): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.['access_token'];
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }
}
