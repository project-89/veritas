import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Bounds for POST /scan. A scan fans out to every selected connector, so
 * unbounded input here translates directly into unbounded load on external
 * sources and unbounded storage/analysis work downstream.
 */
export class StartScanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  investigationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  platforms?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  /** Relative (7d, 24h, 30m) or absolute (YYYY-MM-DD_YYYY-MM-DD) range */
  @IsOptional()
  @Matches(/^(\d{1,3}[dhm]|\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2})$/)
  timeRange?: string;

  @IsOptional()
  @IsIn(['topic', 'claim', 'person'])
  searchMode?: 'topic' | 'claim' | 'person';
}
