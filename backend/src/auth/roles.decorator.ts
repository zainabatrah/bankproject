import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type AppRole =
  | 'CUSTOMER'
  | 'BANK_EMPLOYEE'
  | 'FRAUD_ANALYST'
  | 'SECURITY_ANALYST'
  | 'ADMIN';

export const Roles = (...roles: AppRole[]) =>
  SetMetadata(ROLES_KEY, roles);