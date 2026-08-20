import {
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class MfaLoginDto {
  @IsString()
  @MinLength(10)
  mfaToken: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message:
      'MFA code must contain exactly 6 digits',
  })
  code: string;
}