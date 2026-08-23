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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { ApiTokensService } from './api-tokens.service';
import { CreateApiTokenDto } from './dto/create-api-token.dto';
import { ApiTokenResponseDto } from './dto/api-token-response.dto';
import { ApiTokenCreatedResponseDto } from './dto/api-token-created-response.dto';
import type { AuthenticatedUser } from '../auth/interfaces';

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
}
