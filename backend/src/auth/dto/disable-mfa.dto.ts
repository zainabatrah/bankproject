import {
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export class DisableMfaDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message:
      'MFA code must contain exactly 6 digits',
  })
  code: string;
}