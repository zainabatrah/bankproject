import { IsIn } from 'class-validator';

export class UpdateFraudAlertStatusDto {
  @IsIn([
    'OPEN',
    'INVESTIGATING',
    'RESOLVED',
    'FALSE_POSITIVE',
  ])
  status:
    | 'OPEN'
    | 'INVESTIGATING'
    | 'RESOLVED'
    | 'FALSE_POSITIVE';
}