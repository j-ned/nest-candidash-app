import { Role } from '../../generated/prisma/enums.js';

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    username?: string;
    role: Role;
    totpEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface RefreshResponse {
  access_token: string;
}

export interface LogoutResponse {
  message: string;
}

export interface ServiceResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
