import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateSocCaseDto {
  @IsInt()
  @Min(1)
  alert_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  assigned_analyst: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  summary: string;
}
