import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTransferDto {
  @IsInt()
  senderAccountId: number;

  @IsInt()
  beneficiaryId: number;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}