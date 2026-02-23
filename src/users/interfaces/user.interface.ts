import { Role } from '../../../generated/prisma';

export interface User {
  id: string;
  email: string;
  username?: string;
  password: string;
  role: Role;
  refreshToken?: string;
  refreshTokenExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  totpSecret?: string;
  totpEnabled: boolean;
  totpRecoveryCodes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSafe {
  id: string;
  email: string;
  username?: string;
  role: Role;
  totpEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateData {
  email: string;
  username?: string;
  password: string;
  role?: Role;
}

export interface UserUpdateData {
  id?: string;
  email?: string;
  username?: string;
  password?: string;
  role?: Role;
}
