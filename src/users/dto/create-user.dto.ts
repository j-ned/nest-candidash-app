import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class CreateUserDto {
  @ApiProperty({
    description: "Adresse e-mail de l'utilisateur",
    example: 'utilisateur@exemple.com',
  })
  @IsEmail({}, { message: 'Veuillez fournir une adresse e-mail valide' })
  email: string;

  @ApiProperty({
    description: "Nom d'utilisateur pour la personnalisation (optionnel)",
    example: 'jean_dupont',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: "Le nom d'utilisateur doit être une chaîne de caractères",
  })
  username?: string;

  @ApiProperty({
    description: 'Mot de passe pour le compte utilisateur',
    example: 'MotDePasseSecurise123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères',
  })
  password: string;

  @ApiProperty({
    description: "Rôle de l'utilisateur",
    enum: Role,
    type: String,
    example: Role.USER,
    required: false,
  })
  @IsOptional()
  @IsEnum(Role, { message: 'Le rôle doit être USER ou ADMIN' })
  role?: Role;
}
