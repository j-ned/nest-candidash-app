import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { ApiTokenGuard } from '../auth/guard/api-token.guard';
import { ApiTokensService } from './api-tokens.service';
import { CreateApiTokenDto } from './dto/create-api-token.dto';
import { LoginApiTokenDto } from './dto/login-api-token.dto';
import { Login2faApiTokenDto } from './dto/login-2fa-api-token.dto';
import { ApiTokenLoginResponseDto } from './dto/api-token-login-response.dto';
import { ApiTokenResponseDto } from './dto/api-token-response.dto';
import { ApiTokenCreatedResponseDto } from './dto/api-token-created-response.dto';
import type { AuthenticatedUser } from '../auth/interfaces';
import type { TwoFactorPendingResponse } from '../auth/interfaces';

interface RequestWithApiToken extends AuthenticatedUser {
  apiTokenId: string;
}

@ApiTags('ApiTokens')
@Controller('api-tokens')
export class ApiTokensController {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  @Post()
  @ApiOperation({
    summary: "Générer un nouveau jeton d'API (ex. extension navigateur)",
  })
  @ApiResponse({
    status: 201,
    description: 'Jeton créé, secret affiché une seule fois',
    type: ApiTokenCreatedResponseDto,
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: CreateApiTokenDto,
    @Request() req: AuthenticatedUser,
  ): Promise<ApiTokenCreatedResponseDto> {
    return this.apiTokensService.create(req.user.sub, body.nomAffiche);
  }

  @Get()
  @ApiOperation({ summary: "Lister les jetons d'API actifs" })
  @ApiResponse({
    status: 200,
    description: 'Liste des jetons actifs (sans le secret)',
    type: [ApiTokenResponseDto],
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Request() req: AuthenticatedUser,
  ): Promise<ApiTokenResponseDto[]> {
    return this.apiTokensService.findAllActiveByUser(req.user.sub);
  }

  @Delete('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'Révoque le jeton utilisé pour cette requête' })
  @UseGuards(ApiTokenGuard)
  async revokeSelf(
    @Request() req: RequestWithApiToken,
  ): Promise<{ message: string }> {
    await this.apiTokensService.revoke(req.apiTokenId, req.user.sub);
    return { message: 'Jeton révoqué' };
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: "Révoquer un jeton d'API" })
  @ApiParam({ name: 'id', description: 'Identifiant du jeton' })
  @ApiResponse({ status: 200, description: 'Jeton révoqué' })
  @ApiResponse({ status: 403, description: 'Accès refusé à ce jeton' })
  @ApiResponse({ status: 404, description: 'Jeton introuvable' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async revoke(
    @Param('id') id: string,
    @Request() req: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.apiTokensService.revoke(id, req.user.sub);
    return { message: 'Jeton révoqué' };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary:
      "Connexion + génération automatique d'un jeton (extension navigateur)",
  })
  async login(
    @Body() body: LoginApiTokenDto,
  ): Promise<ApiTokenLoginResponseDto | TwoFactorPendingResponse> {
    return this.apiTokensService.loginAndCreate(
      { email: body.email, password: body.password },
      body.nomAffiche,
    );
  }

  @Post('login/2fa')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Complète la connexion 2FA + génère un jeton (extension navigateur)',
  })
  async loginTwoFactor(
    @Body() body: Login2faApiTokenDto,
  ): Promise<ApiTokenLoginResponseDto> {
    return this.apiTokensService.loginWithTotpAndCreate(
      body.tempToken,
      body.token,
      body.nomAffiche,
    );
  }
}
