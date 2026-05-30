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

    const token =
      this.extractTokenFromCookie(request) ??
      this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException("Jeton d'authentification manquant");
    }

    try {
      // Secret issu de la config globale JwtModule (getOrThrow JWT_SECRET) ;
      // aucun fallback en dur, pour éviter toute forge de token.
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Jeton d'authentification invalide");
    }
    return true;
  }

  private extractTokenFromCookie(request: RequestWithUser): string | undefined {
    const token = request.cookies?.['access_token'];
    return token && token.length > 0 ? token : undefined;
  }

  private extractTokenFromHeader(request: RequestWithUser): string | undefined {
    const authHeader = request.headers['authorization'] as string | undefined;
    const [type, token] = authHeader?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
