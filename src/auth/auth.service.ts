import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import {
  User,
  UserSafe,
  LoginCredentials,
  AuthResult,
  JwtRefreshPayload,
  JwtTwoFactorPayload,
  TwoFactorPendingResponse,
  LogoutResponse,
} from './interfaces';
import { AuthMapper } from './mappers';
import { TotpService } from './services/totp.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private totpService: TotpService,
  ) {}

  async login(
    loginCredentials: LoginCredentials,
  ): Promise<AuthResult | TwoFactorPendingResponse> {
    const user = await this.usersService.findByEmail(loginCredentials.email);
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      loginCredentials.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.totpEnabled) {
      const tempToken = await this.jwtService.signAsync(
        { sub: user.id, type: '2fa-pending' },
        { expiresIn: '5m' },
      );
      return AuthMapper.mapToTwoFactorPendingResponse(tempToken);
    }

    return this.generateFullAuthTokens(user as User);
  }

  async loginAfterRegistration(email: string): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.generateFullAuthTokens(user as User);
  }

  async validateUser(userId: string): Promise<UserSafe | null> {
    const user = await this.usersService.findOne(userId);
    return user ? AuthMapper.mapUserToSafe(user as User) : null;
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    let decoded: JwtRefreshPayload;
    try {
      decoded =
        await this.jwtService.verifyAsync<JwtRefreshPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Jeton de renouvellement invalide');
    }

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedException('Type de jeton invalide');
    }

    const isValid = await this.usersService.validateRefreshToken(
      decoded.sub,
      refreshToken,
    );

    if (!isValid) {
      throw new UnauthorizedException('Jeton de renouvellement invalide');
    }

    const user = await this.usersService.findOne(decoded.sub);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.generateFullAuthTokens(user as User);
  }

  async logout(userId: string): Promise<LogoutResponse> {
    await this.usersService.clearRefreshToken(userId);
    return AuthMapper.createLogoutResponse('Déconnexion réussie');
  }

  async setupTotp(
    userId: string,
  ): Promise<{ qrCodeDataUri: string; otpauthUri: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const setup = await this.totpService.generateSetup(user.email);
    await this.usersService.updateTotpSecret(userId, setup.encryptedSecret);

    return {
      qrCodeDataUri: setup.qrCodeDataUri,
      otpauthUri: setup.otpauthUri,
    };
  }

  async verifyTotpSetup(
    userId: string,
    token: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.usersService.findOne(userId);
    if (!user?.totpSecret) {
      throw new BadRequestException(
        'Aucun secret TOTP configuré. Veuillez relancer la configuration.',
      );
    }

    const isValid = this.totpService.verifyToken(user.totpSecret, token);
    if (!isValid) {
      throw new BadRequestException('Code TOTP invalide');
    }

    const recoveryCodes = this.totpService.generateRecoveryCodes();
    const hashedCodes = await this.totpService.hashRecoveryCodes(recoveryCodes);
    await this.usersService.enableTotp(userId, hashedCodes);

    return { recoveryCodes };
  }

  async validateTotp(tempToken: string, token: string): Promise<AuthResult> {
    const decoded = await this.verifyTempToken(tempToken);

    const user = await this.usersService.findOne(decoded.sub);
    if (!user?.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA non activée pour cet utilisateur');
    }

    const isValid = this.totpService.verifyToken(user.totpSecret, token);
    if (!isValid) {
      throw new UnauthorizedException('Code TOTP invalide');
    }

    return this.generateFullAuthTokens(user as User);
  }

  async useRecoveryCode(
    tempToken: string,
    recoveryCode: string,
  ): Promise<AuthResult> {
    const decoded = await this.verifyTempToken(tempToken);

    const user = await this.usersService.findOne(decoded.sub);
    if (!user?.totpEnabled) {
      throw new UnauthorizedException('2FA non activée pour cet utilisateur');
    }

    const codeIndex = await this.totpService.verifyRecoveryCode(
      recoveryCode,
      user.totpRecoveryCodes,
    );
    if (codeIndex === -1) {
      throw new UnauthorizedException('Code de récupération invalide');
    }

    await this.usersService.removeRecoveryCode(user.id, codeIndex);

    return this.generateFullAuthTokens(user as User);
  }

  async disableTotp(userId: string, password: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mot de passe invalide');
    }

    await this.usersService.disableTotp(userId);
  }

  private async generateFullAuthTokens(user: User): Promise<AuthResult> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload);

    const refreshPayload = { sub: user.id, type: 'refresh' };
    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      expiresIn: '7d',
    });

    const refreshTokenExpires = new Date();
    refreshTokenExpires.setDate(refreshTokenExpires.getDate() + 7);

    await this.usersService.updateRefreshToken(
      user.id,
      refresh_token,
      refreshTokenExpires,
    );

    const expires_in = 86400;
    const userSafe = AuthMapper.mapUserToSafe(user);

    return {
      access_token,
      refresh_token,
      expires_in,
      token_type: 'Bearer',
      user: userSafe,
    };
  }

  private async verifyTempToken(
    tempToken: string,
  ): Promise<JwtTwoFactorPayload> {
    let decoded: JwtTwoFactorPayload;
    try {
      decoded =
        await this.jwtService.verifyAsync<JwtTwoFactorPayload>(tempToken);
    } catch {
      throw new UnauthorizedException('Jeton temporaire invalide ou expiré');
    }

    if (decoded.type !== '2fa-pending') {
      throw new UnauthorizedException('Type de jeton invalide');
    }

    return decoded;
  }
}
