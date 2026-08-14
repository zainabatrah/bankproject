import { IsIn, IsString } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsIn(['USD', 'EUR', 'LBP'])
  currency: string;
}