import { ApiProperty } from '@nestjs/swagger';

export class ApiTokenResponseDto {
  @ApiProperty({ description: "Identifiant du jeton d'API" })
  id: string;

  @ApiProperty({
    description: 'Nom affiché du jeton',
    example: 'Extension Chrome',
  })
  nomAffiche: string;

  @ApiProperty({ description: 'Date de création' })
  createdAt: Date;

  @ApiProperty({
    description: 'Date de dernière utilisation',
    nullable: true,
  })
  derniereUtilisation?: Date;
}
