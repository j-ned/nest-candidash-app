import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { hashPassword } from './password-hashing';
import type { DrizzleService } from '../db/drizzle.service';
import type { User } from './interfaces';

describe('UsersService.validatePassword', () => {
  function setup() {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const service = new UsersService({
      db: { update },
    } as unknown as DrizzleService);
    return { service, set };
  }

  const user = (password: string) => ({ id: 'u1', password }) as User;

  it('re-hashes a correct legacy bcrypt password into argon2id', async () => {
    const { service, set } = setup();

    await expect(
      service.validatePassword(user(bcrypt.hashSync('ancien', 4)), 'ancien'),
    ).resolves.toBe(true);

    const [[values]] = set.mock.calls as [[{ password: string }]];
    expect(values.password).toMatch(/^\$argon2id\$/);
  });

  it('leaves an argon2id hash untouched', async () => {
    const { service, set } = setup();

    await expect(
      service.validatePassword(user(await hashPassword('neuf')), 'neuf'),
    ).resolves.toBe(true);

    expect(set).not.toHaveBeenCalled();
  });

  it('never rewrites the hash after a wrong password', async () => {
    const { service, set } = setup();

    await expect(
      service.validatePassword(user(bcrypt.hashSync('ancien', 4)), 'faux'),
    ).resolves.toBe(false);

    expect(set).not.toHaveBeenCalled();
  });
});

describe('UsersService refresh token', () => {
  function setup() {
    let stored: string | undefined;
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn((values: { refreshToken: string }) => {
      stored = values.refreshToken;
      return { where };
    });
    const findFirst = jest.fn(() =>
      Promise.resolve({
        refreshToken: stored,
        refreshTokenExpires: new Date(Date.now() + 60_000),
      }),
    );
    const service = new UsersService({
      db: { update: () => ({ set }), query: { users: { findFirst } } },
    } as unknown as DrizzleService);
    return { service, stored: () => stored };
  }

  // Deux refresh JWT d'un même utilisateur partagent leurs 72 premiers octets
  // (en-tête + début du payload) : bcrypt les aurait confondus.
  const prefix = 'A'.repeat(72);

  it('accepts the latest refresh token', async () => {
    const { service } = setup();
    await service.updateRefreshToken('u1', `${prefix}.nouveau`, new Date());

    await expect(
      service.validateRefreshToken('u1', `${prefix}.nouveau`),
    ).resolves.toBe(true);
  });

  it('rejects an older token sharing the same 72-byte prefix', async () => {
    const { service } = setup();
    await service.updateRefreshToken('u1', `${prefix}.nouveau`, new Date());

    await expect(
      service.validateRefreshToken('u1', `${prefix}.ancien`),
    ).resolves.toBe(false);
  });

  it('never stores the token in clear', async () => {
    const { service, stored } = setup();
    await service.updateRefreshToken('u1', `${prefix}.nouveau`, new Date());

    expect(stored()).not.toContain(prefix);
  });
});
