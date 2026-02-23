import { User as PrismaUser } from '../../../generated/prisma';
import {
  User,
  UserSafe,
  RegistrationResponse,
  PasswordResetRequestResponse,
  PasswordResetResponse,
  PasswordChangeResponse,
} from '../interfaces';

export class UserMapper {
  /**
   * Convertit un utilisateur Prisma en interface User
   */
  static mapPrismaUserToUser(prismaUser: PrismaUser): User {
    return {
      id: prismaUser.id,
      email: prismaUser.email,
      username: prismaUser.username ?? undefined,
      password: prismaUser.password,
      role: prismaUser.role,
      refreshToken: prismaUser.refreshToken ?? undefined,
      refreshTokenExpires: prismaUser.refreshTokenExpires ?? undefined,
      resetPasswordToken: prismaUser.resetPasswordToken ?? undefined,
      resetPasswordExpires: prismaUser.resetPasswordExpires ?? undefined,
      totpSecret: prismaUser.totpSecret ?? undefined,
      totpEnabled: prismaUser.totpEnabled,
      totpRecoveryCodes: prismaUser.totpRecoveryCodes,
      createdAt: prismaUser.createdAt,
      updatedAt: prismaUser.updatedAt,
    };
  }

  /**
   * Supprime les informations sensibles de l'utilisateur
   */
  static mapUserToSafe(user: User): UserSafe {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Crée une réponse d'enregistrement
   */
  static createRegistrationResponse(
    access_token: string,
    user: UserSafe,
  ): RegistrationResponse {
    return {
      access_token,
      user,
    };
  }

  /**
   * Crée une réponse de demande de réinitialisation de mot de passe
   */
  static createPasswordResetRequestResponse(): PasswordResetRequestResponse {
    return {
      message:
        'Si votre email existe, vous recevrez les instructions de réinitialisation',
    };
  }

  /**
   * Crée une réponse de réinitialisation de mot de passe
   */
  static createPasswordResetResponse(): PasswordResetResponse {
    return {
      message: 'Mot de passe réinitialisé avec succès',
    };
  }

  /**
   * Crée une réponse de changement de mot de passe
   */
  static createPasswordChangeResponse(): PasswordChangeResponse {
    return {
      message: 'Mot de passe modifié avec succès',
    };
  }
}
