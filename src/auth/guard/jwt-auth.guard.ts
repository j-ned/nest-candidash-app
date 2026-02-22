import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { CanActivate } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../interfaces';

interface RequestWithUser extends Request {
  user?: JwtPayload;
  cookies?: Record<string, string>;
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
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET || 'secret',
      });
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
