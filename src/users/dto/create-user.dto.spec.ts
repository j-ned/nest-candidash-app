import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  const valid = { email: 'a@b.fr', password: 'secret1' };

  it('accepts a plain registration', () => {
    expect(CreateUserDto.schema.safeParse(valid).success).toBe(true);
  });

  it('refuses a self-assigned role', () => {
    expect(
      CreateUserDto.schema.safeParse({ ...valid, role: 'ADMIN' }).success,
    ).toBe(false);
  });
});
