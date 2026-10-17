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
