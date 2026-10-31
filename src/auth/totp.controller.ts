import {
  Controller,
  Post,
  Body,
  HttpCode,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { setAuthCookies } from './auth-cookies';
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
    @Body() dto: VerifyTotpSetupDto,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.authService.verifyTotpSetup(req.user.sub, dto.token);
  }

  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async disable(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DisableTotpDto,
  ): Promise<{ message: string }> {
    await this.authService.disableTotp(req.user.sub, dto.password);
    return { message: '2FA désactivée avec succès' };
  }

  @Post('validate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  async validate(
    @Body() dto: ValidateTotpDto,
    @Res({ passthrough: true }) response: ExpressResponse,
  ) {
    const authResult = await this.authService.validateTotp(
      dto.tempToken,
      dto.token,
    );

    setAuthCookies(response, authResult);

    return AuthMapper.mapAuthResultToLoginResponse(authResult);
  }

  @Post('recovery')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  async recovery(
    @Body() dto: TotpRecoveryDto,
    @Res({ passthrough: true }) response: ExpressResponse,
  ) {
    const authResult = await this.authService.useRecoveryCode(
      dto.tempToken,
      dto.recoveryCode,
    );

    setAuthCookies(response, authResult);

    return AuthMapper.mapAuthResultToLoginResponse(authResult);
  }
}
