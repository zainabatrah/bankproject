import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReverseTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
