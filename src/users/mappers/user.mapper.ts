import { UserRow } from '../../db/schema';
import {
  User,
  UserSafe,
  PasswordResetRequestResponse,
  PasswordResetResponse,
  PasswordChangeResponse,
} from '../interfaces';

export class UserMapper {
  /**
   * Convertit une ligne Drizzle en interface User
   */
  static mapUserRowToUser(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      username: row.username ?? undefined,
      password: row.password,
      role: row.role,
      refreshToken: row.refreshToken ?? undefined,
      refreshTokenExpires: row.refreshTokenExpires ?? undefined,
      resetPasswordToken: row.resetPasswordToken ?? undefined,
      resetPasswordExpires: row.resetPasswordExpires ?? undefined,
      totpSecret: row.totpSecret ?? undefined,
      totpEnabled: row.totpEnabled,
      totpRecoveryCodes: row.totpRecoveryCodes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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
