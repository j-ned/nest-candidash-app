import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  HttpCode,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  RegisterDto,
  VerifyRegistrationDto,
  ResendVerificationCodeDto,
} from './dto/register.dto';
import { AuthResponseDto, RefreshResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import type { RequestWithCookies, AuthenticatedRequest } from './interfaces';
import type { TwoFactorPendingResponse } from './interfaces';
import { AuthMapper } from './mappers';
import { VerificationService } from './services/verification.service';
import { PendingUserService } from './services/pending-user.service';
import {
  ApiAuthOperation,
  ApiAuthenticatedOperation,
  ApiLoginResponse,
  ApiRefreshResponse,
  ApiLogoutResponse,
} from './decorators/api-decorators';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly verificationService: VerificationService,
    private readonly pendingUserService: PendingUserService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @ApiAuthOperation("Authentifier l'utilisateur et obtenir un jeton d'accès")
  @ApiLoginResponse()
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<AuthResponseDto | TwoFactorPendingResponse> {
    const result = await this.authService.login(loginDto);

    if ('requires2FA' in result) {
      return result;
    }

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    response.cookie('refresh_token', result.refresh_token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    response.cookie('access_token', result.access_token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    });

    return AuthMapper.mapAuthResultToLoginResponse(result);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiAuthOperation(
    "Renouveler le jeton d'accès avec un jeton de renouvellement",
  )
  @ApiRefreshResponse()
  async refresh(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<RefreshResponseDto> {
    const refreshToken = req.cookies?.refresh_token;

    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new UnauthorizedException(
        'Jeton de renouvellement introuvable ou invalide dans les cookies',
      );
    }

    const authResult = await this.authService.refreshToken(refreshToken);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    response.cookie('refresh_token', authResult.refresh_token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    response.cookie('access_token', authResult.access_token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    });

    return AuthMapper.mapAuthResultToRefreshResponse(authResult);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiAuthenticatedOperation(
    "Déconnecter l'utilisateur et invalider le jeton de renouvellement",
  )
  @ApiLogoutResponse()
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<{ message: string }> {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    response.clearCookie('refresh_token', cookieOptions);
    response.clearCookie('access_token', cookieOptions);

    return this.authService.logout(req.user.sub);
  }

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(201)
  @ApiAuthOperation(
    "Initier le processus d'inscription et envoyer un code de validation",
  )
  async register(
    @Body(ValidationPipe) registerDto: RegisterDto,
  ): Promise<{ message: string; email: string }> {
    let hasEmailSendError: boolean = false;
    try {
      await this.pendingUserService.createPendingUser({
        email: registerDto.email,
        password: registerDto.password,
        username: registerDto.username,
      });
      const verificationCode: string =
        this.verificationService.generateVerificationCode();
      await this.verificationService.saveVerificationCode(
        registerDto.email,
        verificationCode,
      );
      const emailSent: boolean =
        await this.verificationService.sendVerificationEmail(
          registerDto.email,
          verificationCode,
        );
      if (emailSent) {
        return {
          message:
            'Code de validation envoyé par email. Veuillez vérifier votre boîte de réception.',
          email: registerDto.email,
        };
      }
      hasEmailSendError = true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Erreur register:', error);
      throw new BadRequestException("Erreur lors du processus d'inscription");
    }
    if (hasEmailSendError) {
      throw new BadRequestException(
        "Erreur lors de l'envoi du code de validation",
      );
    }
    // Fallback par sécurité, ne devrait pas être atteint
    throw new BadRequestException("Erreur lors du processus d'inscription");
  }

  @Post('verify-registration')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @ApiAuthOperation(
    "Valider le code de vérification et finaliser l'inscription",
  )
  async verifyRegistration(
    @Body(ValidationPipe) verifyDto: VerifyRegistrationDto,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<AuthResponseDto> {
    const isValidCode = await this.verificationService.verifyCode(
      verifyDto.email,
      verifyDto.verificationCode,
    );

    if (!isValidCode) {
      throw new BadRequestException('Code de validation invalide ou expiré');
    }

    const pendingUserExists = await this.pendingUserService.findPendingUser(
      verifyDto.email,
    );
    if (!pendingUserExists) {
      throw new BadRequestException(
        'Aucune inscription en attente pour cet email',
      );
    }

    await this.pendingUserService.validatePendingUser(verifyDto.email);

    // Generate tokens directly for the newly created user
    const authResult = await this.authService.loginAfterRegistration(
      verifyDto.email,
    );

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    response.cookie('refresh_token', authResult.refresh_token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    });

    response.cookie('access_token', authResult.access_token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000, // 24 heures
    });

    return AuthMapper.mapAuthResultToLoginResponse(authResult);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(200)
  @ApiAuthOperation('Renvoyer un code de validation')
  async resendVerificationCode(
    @Body(ValidationPipe) resendDto: ResendVerificationCodeDto,
  ): Promise<{ message: string }> {
    const canResend = await this.verificationService.canResendCode(
      resendDto.email,
    );
    if (!canResend) {
      throw new BadRequestException(
        'Veuillez attendre au moins une minute avant de demander un nouveau code',
      );
    }

    const pendingUserExists = await this.pendingUserService.findPendingUser(
      resendDto.email,
    );
    if (!pendingUserExists) {
      throw new BadRequestException(
        'Aucune inscription en attente pour cet email',
      );
    }

    const verificationCode =
      this.verificationService.generateVerificationCode();
    await this.verificationService.saveVerificationCode(
      resendDto.email,
      verificationCode,
    );

    const emailSent = await this.verificationService.sendVerificationEmail(
      resendDto.email,
      verificationCode,
    );

    if (!emailSent) {
      throw new BadRequestException(
        "Erreur lors de l'envoi du code de validation",
      );
    }

    return {
      message: 'Nouveau code de validation envoyé par email',
    };
  }
}
