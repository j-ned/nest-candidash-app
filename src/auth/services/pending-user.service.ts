import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  async createPendingUser(userData: PendingUserData): Promise<void> {
    const existingUser = await this.usersService.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);

    const existingPendingUser = await this.prisma.pendingUser.findUnique({
      where: { email: userData.email },
    });

    if (existingPendingUser) {
      await this.prisma.pendingUser.update({
        where: { email: userData.email },
        data: {
          password: hashedPassword,
          username: userData.username,
          verified: false,
        },
      });
    } else {
      await this.prisma.pendingUser.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          username: userData.username,
          verified: false,
        },
      });
    }
  }

  /**
   * Validates the pending user and creates the real User with the pre-hashed password.
   * The password is already hashed in PendingUser, so we insert it directly.
   */
  async validatePendingUser(email: string): Promise<void> {
    const pendingUser = await this.prisma.pendingUser.findUnique({
      where: { email },
    });

    if (!pendingUser) {
      throw new Error('Utilisateur en attente introuvable');
    }

    // Create user directly with the already-hashed password
    await this.prisma.user.create({
      data: {
        email: pendingUser.email,
        username: pendingUser.username,
        password: pendingUser.password, // Already bcrypt-hashed
        role: 'USER',
      },
    });

    await this.prisma.pendingUser.delete({
      where: { email },
    });
  }

  async cleanupExpiredPendingUsers(): Promise<void> {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    await this.prisma.pendingUser.deleteMany({
      where: {
        createdAt: {
          lt: yesterday,
        },
      },
    });
  }

  async findPendingUser(email: string): Promise<boolean> {
    const pendingUser = await this.prisma.pendingUser.findUnique({
      where: { email },
    });

    return !!pendingUser;
  }
}
