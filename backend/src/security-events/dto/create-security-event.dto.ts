import {
  IsObject,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export class CreateSecurityEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  eventType?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  event_type?: string;

  @IsOptional()
  @IsIn(riskLevels)
  riskLevel?: (typeof riskLevels)[number];

  @IsOptional()
  @IsIn(riskLevels)
  severity?: (typeof riskLevels)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  user_id?: number;

  // Accepted for compatibility with the legacy fraud-service event contract.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsObject()
  eventData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  event_data?: Record<string, unknown>;
}
