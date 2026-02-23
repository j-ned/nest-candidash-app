import { IsString, Length, Matches, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTotpSetupDto {
  @ApiProperty({
    description: 'Code TOTP à 6 chiffres',
    example: '123456',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'Le code TOTP doit contenir exactement 6 chiffres',
  })
  token: string;
}

export class ValidateTotpDto {
  @ApiProperty({
    description: 'Jeton temporaire reçu lors du login',
  })
  @IsString()
  @IsNotEmpty()
  tempToken: string;

  @ApiProperty({
    description: 'Code TOTP à 6 chiffres',
    example: '123456',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'Le code TOTP doit contenir exactement 6 chiffres',
  })
  token: string;
}

export class DisableTotpDto {
  @ApiProperty({
    description: 'Mot de passe actuel pour confirmer la désactivation',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class TotpRecoveryDto {
  @ApiProperty({
    description: 'Jeton temporaire reçu lors du login',
  })
  @IsString()
  @IsNotEmpty()
  tempToken: string;

  @ApiProperty({
    description: 'Code de récupération au format xxxx-xxxx-xxxx',
    example: 'a1b2-c3d4-e5f6',
  })
  @IsString()
  @IsNotEmpty()
  recoveryCode: string;
}
