import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';

const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export class ListSecurityEventsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  event_type?: string;

  // Keep the legacy dashboard query name supported.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  @IsOptional()
  @IsIn(riskLevels)
  riskLevel?: (typeof riskLevels)[number];

  @IsOptional()
  @IsIn(riskLevels)
  risk_level?: (typeof riskLevels)[number];

  @IsOptional()
  @IsIn(riskLevels)
  severity?: (typeof riskLevels)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_id?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
