import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  HttpCode,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import {
  VerifyTotpSetupDto,
  ValidateTotpDto,
  DisableTotpDto,
  TotpRecoveryDto,
} from './dto/totp.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import type { AuthenticatedRequest } from './interfaces';
import { AuthMapper } from './mappers';

@ApiTags('Authentification 2FA')
@Controller('auth/2fa')
export class TotpController {
  constructor(private readonly authService: AuthService) {}

  @Post('setup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async setup(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ qrCodeDataUri: string; otpauthUri: string }> {
    return this.authService.setupTotp(req.user.sub);
  }

  @Post('verify-setup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async verifySetup(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: VerifyTotpSetupDto,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.authService.verifyTotpSetup(req.user.sub, dto.token);
  }

  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async disable(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: DisableTotpDto,
  ): Promise<{ message: string }> {
    await this.authService.disableTotp(req.user.sub, dto.password);
    return { message: '2FA désactivée avec succès' };
  }

  @Post('validate')
  @HttpCode(200)
  async validate(
    @Body(ValidationPipe) dto: ValidateTotpDto,
    @Res({ passthrough: true }) response: ExpressResponse,
  ) {
    const authResult = await this.authService.validateTotp(
      dto.tempToken,
      dto.token,
    );

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

    return AuthMapper.mapAuthResultToLoginResponse(authResult);
  }

  @Post('recovery')
  @HttpCode(200)
  async recovery(
    @Body(ValidationPipe) dto: TotpRecoveryDto,
    @Res({ passthrough: true }) response: ExpressResponse,
  ) {
    const authResult = await this.authService.useRecoveryCode(
      dto.tempToken,
      dto.recoveryCode,
    );

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

    return AuthMapper.mapAuthResultToLoginResponse(authResult);
  }
}
