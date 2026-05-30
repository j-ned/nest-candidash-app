import { UserSafe } from './user.interface';

export interface UserListResponse {
  users: UserSafe[];
  total?: number;
}

export interface UserResponse {
  user: UserSafe;
}


export interface PasswordResetRequestResponse {
  message: string;
}

export interface PasswordResetResponse {
  message: string;
}

export interface PasswordChangeResponse {
  message: string;
}

export interface UserDeletionResponse {
  user: UserSafe;
  message: string;
}

export interface ServiceResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
