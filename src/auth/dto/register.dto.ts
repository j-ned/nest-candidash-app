import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: "Email de l'utilisateur",
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({
    description:
      'Mot de passe (min. 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial)',
    example: 'MonMotDePasse1!',
  })
  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  @Matches(/(?=.*[A-Z])/, {
    message: 'Le mot de passe doit contenir au moins une majuscule',
  })
  @Matches(/(?=.*\d)/, {
    message: 'Le mot de passe doit contenir au moins un chiffre',
  })
  @Matches(/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message: 'Le mot de passe doit contenir au moins un caractère spécial',
  })
  password: string;

  @ApiPropertyOptional({
    description: "Nom d'utilisateur (optionnel)",
    example: 'john_doe',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, {
    message: "Le nom d'utilisateur doit contenir au moins 3 caractères",
  })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscores",
  })
  username?: string;
}

export class VerifyRegistrationDto {
  @ApiProperty({
    description: "Email de l'utilisateur",
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({
    description: 'Code de validation à 6 chiffres',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Le code de validation doit être composé de 6 chiffres',
  })
  verificationCode: string;
}

export class ResendVerificationCodeDto {
  @ApiProperty({
    description: "Email de l'utilisateur",
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;
}
