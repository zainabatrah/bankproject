import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';

const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const alertStatuses = [
  'OPEN',
  'INVESTIGATING',
  'RESOLVED',
  'FALSE_POSITIVE',
] as const;

export class ListFraudAlertsDto extends PaginationDto {
  @IsOptional()
  @IsIn(riskLevels)
  riskLevel?: (typeof riskLevels)[number];

  // Keep the legacy dashboard query name supported.
  @IsOptional()
  @IsIn(riskLevels)
  severity?: (typeof riskLevels)[number];

  @IsOptional()
  @IsIn(alertStatuses)
  status?: (typeof alertStatuses)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minRiskScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  maxRiskScore?: number;
}
