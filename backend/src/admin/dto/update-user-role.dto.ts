import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn([
    'CUSTOMER',
    'BANK_EMPLOYEE',
    'FRAUD_ANALYST',
    'SECURITY_ANALYST',
    'ADMIN',
  ])
  role:
    | 'CUSTOMER'
    | 'BANK_EMPLOYEE'
    | 'FRAUD_ANALYST'
    | 'SECURITY_ANALYST'
    | 'ADMIN';
}
