import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const guard = new JwtAuthGuard(jwtService);

  function contextWith(token: string) {
    const request: { cookies: Record<string, string>; user?: unknown } = {
      cookies: { access_token: token },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('accepts an access token and exposes its payload', async () => {
    const token = await jwtService.signAsync({
      sub: 'u1',
      email: 'a@b.fr',
      role: 'USER',
    });
    const { context, request } = contextWith(token);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 'u1' });
  });

  it.each(['2fa-pending', 'refresh'])(
    'rejects a %s token used as an access token',
    async (type) => {
      const token = await jwtService.signAsync({ sub: 'u1', type });
      const { context, request } = contextWith(token);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    },
  );
});
