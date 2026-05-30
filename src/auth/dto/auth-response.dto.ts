import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../db/schema';

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
    type: String,
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
    description: "Informations de l'utilisateur authentifié",
    type: UserResponseDto,
  })
  user: UserResponseDto;

  // Cookie-only : access_token ET refresh_token sont dans des cookies HttpOnly,
  // jamais dans le body JSON (anti-vol XSS).
}

export class RefreshResponseDto {
  @ApiProperty({
    description: 'Confirmation du renouvellement',
    example: 'Jeton renouvelé',
  })
  message: string;

  // Cookie-only : les nouveaux tokens sont dans des cookies HttpOnly.
}
