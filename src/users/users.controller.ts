import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailService } from '../mail/mail.service';
import { UserMapper } from './mappers';
import type { UserSafe } from './interfaces';
import {
  ApiUserOperation,
  ApiAuthenticatedUserOperation,
  ApiUserResponse,
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
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  @Get('profile/:id')
  @ApiAuthenticatedUserOperation('Récupérer le profil utilisateur par ID')
  @ApiUserIdParam()
  @ApiUserResponse()
  @UseGuards(JwtAuthGuard)
  async getUserById(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
  ): Promise<UserSafe> {
    if (req.user.sub !== id) {
      throw new ForbiddenException('Accès refusé à ce profil');
    }
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return UserMapper.mapUserToSafe(user);
  }

  @Put('profile-update/:id')
  @ApiAuthenticatedUserOperation('Mettre à jour le profil utilisateur')
  @ApiUserIdParam()
  @ApiUserUpdateResponse()
  @UseGuards(JwtAuthGuard)
  async updateUser(
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: { user: { sub: string } },
  ): Promise<UserSafe> {
    const currentUserId = req.user.sub;

    if (currentUserId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que votre propre profil',
      );
    }

    const { email, username, currentPassword } = updateUserDto;
    const current = await this.usersService.findOne(userId);
    if (!current) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (email && email !== current.email) {
      const confirmed =
        currentPassword !== undefined &&
        (await this.usersService.validatePassword(current, currentPassword));
      if (!confirmed) {
        throw new UnauthorizedException(
          "Mot de passe actuel requis pour changer d'email",
        );
      }
    }

    const user = await this.usersService.update({
      id: userId,
      email,
      username,
    });
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiUserOperation('Demander une réinitialisation de mot de passe')
  @ApiPasswordResetRequestResponse()
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
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
          this.logger.error(
            "Erreur lors de l'envoi de l'email de réinitialisation",
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }

    return UserMapper.createPasswordResetRequestResponse();
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiUserOperation('Réinitialiser le mot de passe avec un token')
  @ApiPasswordResetResponse()
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const success = await this.usersService.resetPasswordWithToken(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );

    if (!success) {
      throw new BadRequestException('Token invalide ou expiré');
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
    @Body() changePasswordDto: ChangePasswordDto,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;

    const success = await this.usersService.changePassword(
      userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    if (!success) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
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
      this.logger.error(
        "Erreur lors de l'envoi de l'email de confirmation de changement de mot de passe",
        error instanceof Error ? error.stack : String(error),
      );
    }

    return UserMapper.createPasswordChangeResponse();
  }
}
