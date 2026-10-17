import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { DrizzleService } from '../../db/drizzle.service';
import type { Role } from '../../db/schema';

describe('RolesGuard', () => {
  function setup(required: Role[] | undefined, dbRole: Role | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    };
    const findFirst = jest
      .fn()
      .mockResolvedValue(dbRole ? { role: dbRole } : undefined);
    const drizzle = { db: { query: { users: { findFirst } } } };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      drizzle as unknown as DrizzleService,
    );
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        // The JWT claim says ADMIN on purpose: the guard must trust the database
        getRequest: () => ({ user: { sub: 'user-1', role: 'ADMIN' } }),
      }),
    } as unknown as ExecutionContext;
    return { guard, context, findFirst };
  }

  it('lets the request through when the route requires no role', async () => {
    const { guard, context, findFirst } = setup(undefined, 'USER');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('allows a user whose stored role matches', async () => {
    const { guard, context } = setup(['ADMIN'], 'ADMIN');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a user demoted in the database even if the JWT still says ADMIN', async () => {
    const { guard, context } = setup(['ADMIN'], 'USER');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a deleted user', async () => {
    const { guard, context } = setup(['ADMIN'], undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
