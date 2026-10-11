import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'https://example.com/hook' })
  @IsUrl({ require_tld: true })
  url!: string;

  @ApiProperty({ example: 'webhook-secret' })
  @IsString()
  @MinLength(8)
  secret!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
