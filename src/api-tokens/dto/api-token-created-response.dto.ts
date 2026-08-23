import { ApiProperty } from '@nestjs/swagger';
import { ApiTokenResponseDto } from './api-token-response.dto';

export class ApiTokenCreatedResponseDto extends ApiTokenResponseDto {
  @ApiProperty({
    description:
      "Secret en clair du jeton — affiché une seule fois, jamais renvoyé ensuite",
    example: 'ctok_3f9a1b2c...',
  })
  token: string;
}
