import { Injectable, ConflictException } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle.service';
import { pendingUsers, users } from '../../db/schema';
import { UsersService } from '../../users/users.service';
import * as bcrypt from 'bcryptjs';

export interface PendingUserData {
  email: string;
  password: string;
  username?: string;
}
@Injectable()
export class PendingUserService {
  constructor(
    private readonly drizzle: DrizzleService,
    private usersService: UsersService,
  ) {}

  async createPendingUser(userData: PendingUserData): Promise<void> {
    const existingUser = await this.usersService.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);

    await this.drizzle.db
      .insert(pendingUsers)
      .values({
        email: userData.email,
        password: hashedPassword,
        username: userData.username,
        verified: false,
      })
      .onConflictDoUpdate({
        target: pendingUsers.email,
        set: {
          password: hashedPassword,
          username: userData.username,
          verified: false,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Validates the pending user and creates the real User with the pre-hashed password.
   * The password is already hashed in PendingUser, so we insert it directly.
   */
  async validatePendingUser(email: string): Promise<void> {
    const pendingUser = await this.drizzle.db.query.pendingUsers.findFirst({
      where: eq(pendingUsers.email, email),
    });

    if (!pendingUser) {
      throw new Error('Utilisateur en attente introuvable');
    }

    // Create user directly with the already-hashed password
    await this.drizzle.db.insert(users).values({
      email: pendingUser.email,
      username: pendingUser.username,
      password: pendingUser.password, // Already bcrypt-hashed
      role: 'USER',
    });

    await this.drizzle.db
      .delete(pendingUsers)
      .where(eq(pendingUsers.email, email));
  }

  async cleanupExpiredPendingUsers(): Promise<void> {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    await this.drizzle.db
      .delete(pendingUsers)
      .where(lt(pendingUsers.createdAt, yesterday));
  }

  async findPendingUser(email: string): Promise<boolean> {
    const pendingUser = await this.drizzle.db.query.pendingUsers.findFirst({
      where: eq(pendingUsers.email, email),
    });

    return !!pendingUser;
  }
}
