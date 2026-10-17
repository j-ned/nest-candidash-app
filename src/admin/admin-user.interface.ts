import type { Role } from '../db/schema';

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  role: Role;
  totpEnabled: boolean;
  createdAt: Date;
  applicationsCount: number;
  lastActivityAt: Date | null;
}
