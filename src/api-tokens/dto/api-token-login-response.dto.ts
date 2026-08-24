import { ApiProperty } from '@nestjs/swagger';
import { ApiTokenCreatedResponseDto } from './api-token-created-response.dto';

class ApiTokenLoginUserDto {
  @ApiProperty({ example: 'utilisateur@exemple.com' })
  email: string;
}

export class ApiTokenLoginResponseDto extends ApiTokenCreatedResponseDto {
  @ApiProperty({ type: ApiTokenLoginUserDto })
  user: ApiTokenLoginUserDto;
}
