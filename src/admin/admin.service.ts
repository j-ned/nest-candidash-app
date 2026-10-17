import { Injectable } from '@nestjs/common';
import { count, desc, eq, max } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { jobTracks, users } from '../db/schema';
import type { AdminUser } from './admin-user.interface';

@Injectable()
export class AdminService {
  constructor(private readonly drizzle: DrizzleService) {}

  async listUsers(): Promise<AdminUser[]> {
    const rows = await this.drizzle.db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        totpEnabled: users.totpEnabled,
        createdAt: users.createdAt,
        applicationsCount: count(jobTracks.id),
        lastActivityAt: max(jobTracks.updatedAt),
      })
      .from(users)
      .leftJoin(jobTracks, eq(jobTracks.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt));

    return rows.map((row) => ({
      ...row,
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt) : null,
    }));
  }
}
