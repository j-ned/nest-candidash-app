import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma';

export class UserResponseDto {
  @ApiProperty({
    description: "Identifiant unique de l'utilisateur",
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: "Adresse e-mail de l'utilisateur",
    example: 'utilisateur@exemple.com',
  })
  email: string;

  @ApiProperty({
    description: "Nom d'utilisateur pour la personnalisation",
    example: 'jean_dupont',
    required: false,
  })
  username?: string;

  @ApiProperty({
    description: "Rôle de l'utilisateur",
    enum: Role,
    example: Role.USER,
  })
  role: Role;

  @ApiProperty({
    description: "Date de création de l'utilisateur",
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: "Date de dernière mise à jour de l'utilisateur",
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: "Indique si l'authentification 2FA est activée",
    example: false,
  })
  totpEnabled: boolean;
}

export class AuthResponseDto {
  @ApiProperty({
    description: "Jeton d'accès JWT",
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description: "Informations de l'utilisateur authentifié",
    type: UserResponseDto,
  })
  user: UserResponseDto;

  // Note: refresh_token est maintenant dans un cookie HttpOnly,
  // pas dans la réponse JSON pour des raisons de sécurité
}

export class RefreshResponseDto {
  @ApiProperty({
    description: "Nouveau jeton d'accès JWT",
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  // Note: nouveau refresh_token est dans un cookie HttpOnly
}
