import {
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class MfaRecoveryLoginDto {
  @IsString()
  @MinLength(10)
  mfaToken: string;

  @IsString()
  @Matches(
    /^(?:[A-Fa-f0-9]{20}|[A-Fa-f0-9]{5}(?:-[A-Fa-f0-9]{5}){3})$/,
    {
      message:
        'Invalid MFA recovery code format',
    },
  )
  recoveryCode: string;
}