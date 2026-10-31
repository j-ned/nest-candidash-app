import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { apiTokens, users } from '../db/schema';
import * as crypto from 'crypto';
import { User, UserCreateData, UserUpdateData } from './interfaces';
import { UserMapper } from './mappers';
import { hashPassword, verifyPassword } from './password-hashing';

// Hachage rapide pour des jetons aléatoires à forte entropie (refresh JWT,
// token de reset) : bcrypt n'apporte rien ici et tronque à 72 octets.
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class UsersService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(createUserData: UserCreateData): Promise<User> {
    const existingUser = await this.drizzle.db.query.users.findFirst({
      where: eq(users.email, createUserData.email),
    });

    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    const hashedPassword = await this.hashPassword(createUserData.password);

    const [row] = await this.drizzle.db
      .insert(users)
      .values({
        email: createUserData.email,
        username: createUserData.username,
        password: hashedPassword,
        role: createUserData.role ?? 'USER',
      })
      .returning();

    return UserMapper.mapUserRowToUser(row);
  }

  async findOne(id: string): Promise<User | null> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    return row ? UserMapper.mapUserRowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    return row ? UserMapper.mapUserRowToUser(row) : null;
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
      role: User['role'];
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

    const [row] = await this.drizzle.db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, updateUserData.id))
      .returning();

    return UserMapper.mapUserRowToUser(row);
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const [row] = await this.drizzle.db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    return UserMapper.mapUserRowToUser(row);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.password) return false;
    const { valid, needsRehash } = await verifyPassword(
      user.password,
      password,
    );
    if (valid && needsRehash) {
      // Migration progressive : l'ancien hachage (bcrypt, SHA-256) est remplacé à la connexion
      await this.drizzle.db
        .update(users)
        .set({ password: await hashPassword(password), updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }
    return valid;
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

    await this.drizzle.db
      .update(users)
      .set({
        resetPasswordToken: sha256(resetToken),
        resetPasswordExpires: resetExpires,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return resetToken;
  }

  async resetPasswordWithToken(
    token: string,
    newPassword: string,
  ): Promise<boolean> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: and(
        eq(users.resetPasswordToken, sha256(token)),
        gte(users.resetPasswordExpires, new Date()),
      ),
    });

    if (!row) {
      return false;
    }

    const hashedPassword = await this.hashPassword(newPassword);

    await this.drizzle.db
      .update(users)
      .set({
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.id));
    await this.revokeSessions(row.id);

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

    await this.drizzle.db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await this.revokeSessions(userId);

    return true;
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const hashedRefreshToken = sha256(refreshToken);

    await this.drizzle.db
      .update(users)
      .set({
        refreshToken: hashedRefreshToken,
        refreshTokenExpires: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async validateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { refreshToken: true, refreshTokenExpires: true },
    });

    if (!row?.refreshToken || !row.refreshTokenExpires) {
      return false;
    }

    if (new Date() > row.refreshTokenExpires) {
      return false;
    }

    const expected = Buffer.from(row.refreshToken);
    const actual = Buffer.from(sha256(refreshToken));
    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  }

  // Après un changement ou une réinitialisation du mot de passe, toute session
  // ouverte avec l'ancien (refresh token, jetons de l'extension) est coupée.
  private async revokeSessions(userId: string): Promise<void> {
    await this.clearRefreshToken(userId);
    await this.drizzle.db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({
        refreshToken: null,
        refreshTokenExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateTotpSecret(
    userId: string,
    encryptedSecret: string,
  ): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({ totpSecret: encryptedSecret, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async enableTotp(
    userId: string,
    hashedRecoveryCodes: string[],
  ): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({
        totpEnabled: true,
        totpRecoveryCodes: hashedRecoveryCodes,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async disableTotp(userId: string): Promise<void> {
    await this.drizzle.db
      .update(users)
      .set({
        totpSecret: null,
        totpEnabled: false,
        totpRecoveryCodes: [],
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async removeRecoveryCode(userId: string, codeIndex: number): Promise<void> {
    const row = await this.drizzle.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { totpRecoveryCodes: true },
    });
    if (!row) return;

    const codes = [...row.totpRecoveryCodes];
    codes.splice(codeIndex, 1);

    await this.drizzle.db
      .update(users)
      .set({ totpRecoveryCodes: codes, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }
}
