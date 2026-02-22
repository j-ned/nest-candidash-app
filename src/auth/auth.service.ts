import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import {
  User,
  UserSafe,
  LoginCredentials,
  AuthResult,
  JwtRefreshPayload,
  LogoutResponse,
} from './interfaces';
import { AuthMapper } from './mappers';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(loginCredentials: LoginCredentials): Promise<AuthResult> {
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

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload);

    // Generate refresh token with longer expiration
    const refreshPayload = { sub: user.id, type: 'refresh' };
    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      expiresIn: '7d',
    });

    // Calculate refresh token expiration date (7 days)
    const refreshTokenExpires = new Date();
    refreshTokenExpires.setDate(refreshTokenExpires.getDate() + 7);

    // Save refresh token in database
    await this.usersService.updateRefreshToken(
      user.id,
      refresh_token,
      refreshTokenExpires,
    );

    // Token expires in 24 hours (24 * 60 * 60 = 86400 seconds)
    const expires_in = 86400;

    const userSafe = AuthMapper.mapUserToSafe(user as User);

    return {
      access_token,
      refresh_token,
      expires_in,
      token_type: 'Bearer',
      user: userSafe,
    };
  }

  async loginAfterRegistration(email: string): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

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
    const userSafe = AuthMapper.mapUserToSafe(user as User);

    return {
      access_token,
      refresh_token,
      expires_in,
      token_type: 'Bearer',
      user: userSafe,
    };
  }

  async validateUser(userId: string): Promise<UserSafe | null> {
    const user = await this.usersService.findOne(userId);
    return user ? AuthMapper.mapUserToSafe(user as User) : null;
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    // Vérifier et décoder le refresh token en isolant les erreurs JWT
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

    // Validate refresh token in database
    const isValid = await this.usersService.validateRefreshToken(
      decoded.sub,
      refreshToken,
    );

    if (!isValid) {
      throw new UnauthorizedException('Jeton de renouvellement invalide');
    }

    // Get user details
    const user = await this.usersService.findOne(decoded.sub);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    // Generate new tokens
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload);

    const refreshPayload = { sub: user.id, type: 'refresh' };
    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      expiresIn: '7d',
    });

    // Update refresh token in database
    const refreshTokenExpires = new Date();
    refreshTokenExpires.setDate(refreshTokenExpires.getDate() + 7);

    await this.usersService.updateRefreshToken(
      user.id,
      refresh_token,
      refreshTokenExpires,
    );

    const expires_in = 86400;
    const userSafe = AuthMapper.mapUserToSafe(user as User);

    return {
      access_token,
      refresh_token,
      expires_in,
      token_type: 'Bearer',
      user: userSafe,
    };
  }

  async logout(userId: string): Promise<LogoutResponse> {
    await this.usersService.clearRefreshToken(userId);
    return AuthMapper.createLogoutResponse('Déconnexion réussie');
  }
}
