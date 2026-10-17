import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle.service';
import { users } from '../../db/schema';
import { Roles } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../interfaces/request.interface';

/**
 * À placer après JwtAuthGuard. Le rôle est relu en base à chaque requête : le claim du JWT
 * peut dater d'avant une promotion ou une rétrogradation, il ne fait pas foi.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly drizzle: DrizzleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.drizzle.db.query.users.findFirst({
      columns: { role: true },
      where: eq(users.id, request.user.sub),
    });
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }
    return true;
  }
}
