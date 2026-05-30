import { Role } from '../../db/schema';

// Cookie-only : le token n'est jamais renvoyé dans le body (uniquement cookie HttpOnly).
export interface LoginResponse {
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
  message: string;
}

export interface LogoutResponse {
  message: string;
}

export interface ServiceResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
