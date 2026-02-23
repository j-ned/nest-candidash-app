import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class UpdateUserDto {
  @ApiProperty({
    description:
      'ID utilisateur à mettre à jour (défini automatiquement depuis le paramètre URL)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  id?: string;

  @ApiProperty({
    description: 'Nouvelle adresse e-mail',
    example: 'nouvel-email@exemple.com',
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: 'Veuillez fournir une adresse e-mail valide' })
  email?: string;

  @ApiProperty({
    description: "Nouveau nom d'utilisateur pour la personnalisation",
    example: 'nouveau_utilisateur',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: "Le nom d'utilisateur doit être une chaîne de caractères",
  })
  username?: string;

  @ApiProperty({
    description: 'Nouveau mot de passe',
    example: 'NouveauMotDePasseSecurise123',
    minLength: 6,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères',
  })
  password?: string;

  @ApiProperty({
    description: 'Nouveau rôle',
    enum: Role,
    type: String,
    example: Role.ADMIN,
    required: false,
  })
  @IsOptional()
  @IsEnum(Role, { message: 'Le rôle doit être USER ou ADMIN' })
  role?: Role;
}
