import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Min, MinLength } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 'cmx_123' })
  @IsString()
  @MinLength(3)
  accountId!: string;

  @ApiProperty({ example: 1500, description: 'Amount in minor units.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiProperty({ example: 'USD', description: 'Three-letter ISO currency code.' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ example: 'Invoice 2025-07' })
  @IsString()
  @MinLength(3)
  description!: string;

  @ApiProperty({ example: 'idempotency-key-123' })
  @IsString()
  @MinLength(3)
  idempotencyKey!: string;
}
