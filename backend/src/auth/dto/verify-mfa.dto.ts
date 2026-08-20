import {
  IsString,
  Matches,
} from 'class-validator';

export class VerifyMfaDto {
  @IsString()
  @Matches(/^\d{6}$/, {
    message:
      'MFA code must contain exactly 6 digits',
  })
  code: string;
}