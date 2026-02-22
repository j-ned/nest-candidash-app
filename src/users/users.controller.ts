import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  Request,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { UserMapper } from './mappers';
import type { UserSafe } from './interfaces';
import {
  ApiUserOperation,
  ApiAuthenticatedUserOperation,
  ApiUserListResponse,
  ApiUserResponse,
  ApiRegistrationResponse,
  ApiUserUpdateResponse,
  ApiUserDeleteResponse,
  ApiPasswordResetRequestResponse,
  ApiPasswordResetResponse,
  ApiPasswordChangeResponse,
  ApiUserIdParam,
} from './decorators/api-decorators';

@ApiTags('Users')
@Controller('accounts')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
  ) {}

  @Get('directory')
  @ApiAuthenticatedUserOperation('Récupérer tous les comptes utilisateur')
  @ApiUserListResponse()
  @UseGuards(JwtAuthGuard)
  async getUsers(): Promise<UserSafe[]> {
    const users = await this.usersService.findAll();
    return users.map((user) => UserMapper.mapUserToSafe(user));
  }

  @Get('profile/:id')
  @ApiAuthenticatedUserOperation('Récupérer le profil utilisateur par ID')
  @ApiUserIdParam()
  @ApiUserResponse()
  @UseGuards(JwtAuthGuard)
  async getUserById(@Param('id') id: string): Promise<UserSafe> {
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new Error('Utilisateur introuvable');
    }
    return UserMapper.mapUserToSafe(user);
  }

  @Post('registration')
  @ApiUserOperation(
    'Enregistrer un nouveau compte utilisateur et le connecter automatiquement',
  )
  @ApiRegistrationResponse()
  async createUser(
    @Body(ValidationPipe) createUserDto: CreateUserDto,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<AuthResponseDto> {
    // Créer l'utilisateur
    const user = await this.usersService.create(createUserDto);

    // Envoyer l'email de confirmation
    try {
      await this.mailService.sendRegistrationConfirmationEmail({
        userEmail: user.email,
        userName: user.username,
        registrationDate: user.createdAt,
      });
    } catch (error) {
      console.error(
        "Erreur lors de l'envoi de l'email de confirmation:",
        error,
      );
    }

    // Connecter automatiquement l'utilisateur
    const loginResult = await this.authService.login({
      email: user.email,
      password: createUserDto.password,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    // Définir le refresh token dans un cookie HttpOnly
    response.cookie('refresh_token', loginResult.refresh_token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    });

    // Définir l'access token dans un cookie HttpOnly
    response.cookie('access_token', loginResult.access_token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000, // 24 heures
    });

    // Retourner l'access token et les données utilisateur
    return {
      access_token: loginResult.access_token,
      user: loginResult.user,
    };
  }

  @Put('profile-update/:id')
  @ApiAuthenticatedUserOperation('Mettre à jour le profil utilisateur')
  @ApiUserIdParam()
  @ApiUserUpdateResponse()
  @UseGuards(JwtAuthGuard)
  async updateUser(
    @Param('id') userId: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
    @Request() req: { user: { sub: string } },
  ): Promise<UserSafe> {
    const currentUserId = req.user.sub;

    if (currentUserId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que votre propre profil',
      );
    }

    updateUserDto.id = userId;
    const user = await this.usersService.update(updateUserDto);
    return UserMapper.mapUserToSafe(user);
  }

  @Delete('deactivation/:id')
  @ApiAuthenticatedUserOperation('Désactiver le compte utilisateur')
  @ApiUserIdParam()
  @ApiUserDeleteResponse()
  @UseGuards(JwtAuthGuard)
  async deleteUser(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ): Promise<UserSafe> {
    const currentUserId = req.user.sub;

    if (currentUserId !== id) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que votre propre profil',
      );
    }

    const user = await this.usersService.remove(id);
    return UserMapper.mapUserToSafe(user);
  }

  @Post('forgot-password')
  @ApiUserOperation('Demander une réinitialisation de mot de passe')
  @ApiPasswordResetRequestResponse()
  async forgotPassword(
    @Body(ValidationPipe) forgotPasswordDto: ForgotPasswordDto,
  ) {
    const resetToken = await this.usersService.setPasswordResetToken(
      forgotPasswordDto.email,
    );

    if (resetToken) {
      const user = await this.usersService.findByEmail(forgotPasswordDto.email);
      if (user) {
        // Utiliser la première origine autorisée pour le reset URL
        const frontendUrl =
          process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim() ||
          'http://localhost:4200';
        const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

        try {
          await this.mailService.sendPasswordResetEmail({
            userEmail: user.email,
            userName: user.username,
            resetToken,
            resetUrl,
          });
        } catch (error) {
          console.error(
            "Erreur lors de l'envoi de l'email de réinitialisation:",
            error,
          );
        }
      }
    }

    return UserMapper.createPasswordResetRequestResponse();
  }

  @Post('reset-password')
  @ApiUserOperation('Réinitialiser le mot de passe avec un token')
  @ApiPasswordResetResponse()
  async resetPassword(
    @Body(ValidationPipe) resetPasswordDto: ResetPasswordDto,
  ) {
    const success = await this.usersService.resetPasswordWithToken(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );

    if (!success) {
      throw new Error('Token invalide ou expiré');
    }

    return UserMapper.createPasswordResetResponse();
  }

  @Put('change-password')
  @ApiAuthenticatedUserOperation(
    'Changer le mot de passe (utilisateur connecté)',
  )
  @ApiPasswordChangeResponse()
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body(ValidationPipe) changePasswordDto: ChangePasswordDto,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;

    const success = await this.usersService.changePassword(
      userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    if (!success) {
      throw new Error('Mot de passe actuel incorrect');
    }

    // Send confirmation email (non-blocking)
    try {
      const user = await this.usersService.findOne(userId);
      if (user) {
        await this.mailService.sendPasswordChangeConfirmationEmail({
          userEmail: user.email,
          userName: user.username,
          changeDate: new Date(),
        });
      }
    } catch (error) {
      console.error(
        "Erreur lors de l'envoi de l'email de confirmation de changement de mot de passe:",
        error,
      );
    }

    return UserMapper.createPasswordChangeResponse();
  }
}
