import { UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';
import type { MailService } from '../mail/mail.service';
import { UpdateUserDto } from './dto/update-user.dto';

describe('UsersController.updateUser', () => {
  const current = { id: 'u1', email: 'old@example.com', role: 'USER' };

  function setup(passwordOk = true) {
    const usersService = {
      findOne: jest.fn().mockResolvedValue(current),
      validatePassword: jest.fn().mockResolvedValue(passwordOk),
      update: jest.fn((data: object) =>
        Promise.resolve({ ...current, ...data }),
      ),
    };
    const controller = new UsersController(
      usersService as unknown as UsersService,
      {} as MailService,
    );
    const req = { user: { sub: 'u1' } };
    return { controller, usersService, req };
  }

  it('changes the username without asking for the password', async () => {
    const { controller, usersService, req } = setup();

    await controller.updateUser('u1', { username: 'neo' }, req);

    expect(usersService.validatePassword).not.toHaveBeenCalled();
    expect(usersService.update).toHaveBeenCalledWith({
      id: 'u1',
      email: undefined,
      username: 'neo',
    });
  });

  it('refuses an email change without the current password', async () => {
    const { controller, usersService, req } = setup();

    await expect(
      controller.updateUser('u1', { email: 'new@example.com' }, req),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.update).not.toHaveBeenCalled();
  });

  it('refuses an email change with a wrong password', async () => {
    const { controller, usersService, req } = setup(false);

    await expect(
      controller.updateUser(
        'u1',
        { email: 'new@example.com', currentPassword: 'faux' },
        req,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.update).not.toHaveBeenCalled();
  });

  it('changes the email once the password is confirmed', async () => {
    const { controller, usersService, req } = setup();

    await controller.updateUser(
      'u1',
      { email: 'new@example.com', currentPassword: 'bon' },
      req,
    );

    expect(usersService.update).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    );
  });

  it.each([['password'], ['id'], ['role']])(
    'rejects a %s field in the payload',
    (field) => {
      expect(
        UpdateUserDto.schema.safeParse({ username: 'neo', [field]: 'x' })
          .success,
      ).toBe(false);
    },
  );
});
