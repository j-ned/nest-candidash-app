import {
  User,
  UserSafe,
  AuthResult,
  LoginResponse,
  RefreshResponse,
  TwoFactorPendingResponse,
} from '../interfaces';

export class AuthMapper {
  /**
   * Supprime le mot de passe et les informations sensibles de l'objet utilisateur
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
   * Crée une réponse 2FA en attente
   */
  static mapToTwoFactorPendingResponse(
    tempToken: string,
  ): TwoFactorPendingResponse {
    return {
      requires2FA: true,
      tempToken,
      message: 'Vérification 2FA requise',
    };
  }

  /**
   * Convertit une AuthResult complète en LoginResponse (pour l'API)
   */
  static mapAuthResultToLoginResponse(authResult: AuthResult): LoginResponse {
    // Token volontairement absent du body : il est posé en cookie HttpOnly.
    return {
      user: authResult.user,
    };
  }

  /**
   * Réponse de refresh : token renouvelé via cookie HttpOnly, pas dans le body.
   */
  static mapAuthResultToRefreshResponse(
    _authResult: AuthResult,
  ): RefreshResponse {
    return {
      message: 'Jeton renouvelé',
    };
  }

  /**
   * Crée une réponse de déconnexion standardisée
   */
  static createLogoutResponse(message: string): { message: string } {
    return { message };
  }
}
