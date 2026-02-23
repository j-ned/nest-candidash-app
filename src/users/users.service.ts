import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, UserCreateData, UserUpdateData } from './interfaces';
import { UserMapper } from './mappers';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserData: UserCreateData): Promise<User> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserData.email },
    });

    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await this.hashPassword(createUserData.password);

    const prismaUser = await this.prisma.user.create({
      data: {
        email: createUserData.email,
        username: createUserData.username,
        password: hashedPassword,
        role: createUserData.role || 'USER',
      },
    });

    return UserMapper.mapPrismaUserToUser(prismaUser);
  }

  async findAll(): Promise<User[]> {
    const prismaUsers = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return prismaUsers.map((user) => UserMapper.mapPrismaUserToUser(user));
  }

  async findOne(id: string): Promise<User | null> {
    const prismaUser = await this.prisma.user.findUnique({
      where: { id },
    });

    return prismaUser ? UserMapper.mapPrismaUserToUser(prismaUser) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const prismaUser = await this.prisma.user.findUnique({
      where: { email },
    });

    return prismaUser ? UserMapper.mapPrismaUserToUser(prismaUser) : null;
  }

  async update(updateUserData: UserUpdateData): Promise<User> {
    if (!updateUserData.id) {
      throw new NotFoundException(
        "L'identifiant utilisateur est requis pour la mise à jour",
      );
    }

    const user = await this.findOne(updateUserData.id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const updateData: Partial<{
      email: string;
      username: string;
      password: string;
      role: typeof updateUserData.role;
    }> = {};

    if (updateUserData.email) {
      updateData.email = updateUserData.email;
    }
    if (updateUserData.username !== undefined) {
      updateData.username = updateUserData.username;
    }
    if (updateUserData.password) {
      updateData.password = await this.hashPassword(updateUserData.password);
    }
    if (updateUserData.role) {
      updateData.role = updateUserData.role;
    }

    const prismaUser = await this.prisma.user.update({
      where: { id: updateUserData.id },
      data: updateData,
    });

    return UserMapper.mapPrismaUserToUser(prismaUser);
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const prismaUser = await this.prisma.user.delete({
      where: { id },
    });

    return UserMapper.mapPrismaUserToUser(prismaUser);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.password) return false;
    // Support legacy SHA256 hashes (migration) + bcrypt
    if (
      !user.password.startsWith('$2a$') &&
      !user.password.startsWith('$2b$')
    ) {
      const sha256Hash = crypto
        .createHash('sha256')
        .update(password)
        .digest('hex');
      if (sha256Hash === user.password) {
        // Migrate to bcrypt on successful login
        const bcryptHash = await bcrypt.hash(password, 12);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { password: bcryptHash },
        });
        return true;
      }
      return false;
    }
    return bcrypt.compare(password, user.password);
  }

  generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async setPasswordResetToken(email: string): Promise<string | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const resetToken = this.generatePasswordResetToken();
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1); // Token expires in 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires,
      },
    });

    return resetToken;
  }

  async resetPasswordWithToken(
    token: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          gte: new Date(),
        },
      },
    });

    if (!user) {
      return false;
    }

    const hashedPassword = await this.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    return true;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await this.findOne(userId);
    if (!user) {
      return false;
    }

    if (!(await this.validatePassword(user, currentPassword))) {
      return false;
    }

    const hashedPassword = await this.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    return true;
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: hashedRefreshToken,
        refreshTokenExpires: expiresAt,
      },
    });
  }

  async validateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { refreshToken: true, refreshTokenExpires: true },
    });

    if (!user?.refreshToken || !user.refreshTokenExpires) {
      return false;
    }

    if (new Date() > user.refreshTokenExpires) {
      return false;
    }

    return bcrypt.compare(refreshToken, user.refreshToken);
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExpires: null,
      },
    });
  }

  async updateTotpSecret(
    userId: string,
    encryptedSecret: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret },
    });
  }

  async enableTotp(
    userId: string,
    hashedRecoveryCodes: string[],
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: true,
        totpRecoveryCodes: hashedRecoveryCodes,
      },
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpEnabled: false,
        totpRecoveryCodes: [],
      },
    });
  }

  async removeRecoveryCode(userId: string, codeIndex: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpRecoveryCodes: true },
    });
    if (!user) return;

    const codes = [...user.totpRecoveryCodes];
    codes.splice(codeIndex, 1);

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpRecoveryCodes: codes },
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}
