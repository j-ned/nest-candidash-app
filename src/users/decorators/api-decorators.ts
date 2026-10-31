import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UserResponseDto } from '../../auth/dto/auth-response.dto';

export function ApiUserOperation(summary: string) {
  return applyDecorators(ApiOperation({ summary }));
}

export function ApiAuthenticatedUserOperation(summary: string) {
  return applyDecorators(ApiOperation({ summary }), ApiBearerAuth('JWT-auth'));
}

export function ApiUserResponse() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Informations du profil utilisateur',
      type: UserResponseDto,
    }),
    ApiResponse({ status: 404, description: 'Utilisateur introuvable' }),
  );
}

export function ApiUserUpdateResponse() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Profil utilisateur mis à jour avec succès',
      type: UserResponseDto,
    }),
    ApiResponse({ status: 400, description: "Données d'entrée invalides" }),
    ApiResponse({
      status: 403,
      description:
        'Interdit - vous ne pouvez mettre à jour que votre propre profil',
    }),
    ApiResponse({ status: 404, description: 'Utilisateur introuvable' }),
  );
}

export function ApiUserDeleteResponse() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Compte utilisateur désactivé avec succès',
      type: UserResponseDto,
    }),
    ApiResponse({
      status: 403,
      description:
        'Interdit - vous ne pouvez supprimer que votre propre profil',
    }),
    ApiResponse({ status: 404, description: 'Utilisateur introuvable' }),
  );
}

export function ApiPasswordResetRequestResponse() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Email de réinitialisation envoyé si le compte existe',
      schema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            example:
              'Si votre email existe, vous recevrez les instructions de réinitialisation',
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: "Données d'entrée invalides" }),
  );
}

export function ApiPasswordResetResponse() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Mot de passe réinitialisé avec succès',
      schema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            example: 'Mot de passe réinitialisé avec succès',
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: 'Token invalide ou expiré' }),
  );
}

export function ApiPasswordChangeResponse() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Mot de passe modifié avec succès',
      schema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            example: 'Mot de passe modifié avec succès',
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: 'Mot de passe actuel incorrect' }),
    ApiResponse({ status: 401, description: 'Non autorisé' }),
  );
}

export function ApiUserIdParam() {
  return ApiParam({ name: 'id', description: 'Identifiant utilisateur' });
}
