import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiProperty as P, ApiPropertyOptional as O } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min, validateSync } from 'class-validator';
import {
  ENTITLEMENT_BUCKETS,
  ENTITLEMENT_KINDS,
  MEMBERSHIP_CATEGORIES,
  type EntitlementBucket,
  type EntitlementKind,
  type MembershipCategory,
} from '@student/common';
import { bad } from '../common/domain';
import { PageQuery } from './dto';
class GrantBaseDto {
  @P() @IsString() @Length(1, 128) studentId!: string;
  @O() @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
export class TrialGrantDto extends GrantBaseDto {
  @P({ enum: ['TRIAL'] }) @IsIn(['TRIAL']) bucket!: 'TRIAL';
  @P({ minimum: 1, maximum: 10000 }) @IsInt() @Min(1) @Max(10000) quantity!: number;
}
export class CustomPurchaseDto extends GrantBaseDto {
  @P({ enum: ['REGULAR'] }) @IsIn(['REGULAR']) bucket!: 'REGULAR';
  @P({ enum: ['CUSTOM'] }) @IsIn(['CUSTOM']) mode!: 'CUSTOM';
  @P({ minimum: 1, maximum: 10000 }) @IsInt() @Min(1) @Max(10000) quantity!: number;
}
export class PackagePurchaseDto extends GrantBaseDto {
  @P({ enum: ['REGULAR'] }) @IsIn(['REGULAR']) bucket!: 'REGULAR';
  @P({ enum: ['PACKAGE'] }) @IsIn(['PACKAGE']) mode!: 'PACKAGE';
  @P() @IsString() @Length(1, 128) packageId!: string;
  @P({ minimum: 1 }) @IsInt() @Min(1) expectedPackageVersion!: number;
}
export type GrantBody = TrialGrantDto | CustomPurchaseDto | PackagePurchaseDto;
@Injectable()
export class GrantBodyPipe implements PipeTransform {
  transform(value: unknown): GrantBody {
    if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Enter a valid grant.');
    const body = value as Record<string, unknown>;
    if (Object.values(body).some((v) => v === null))
      bad('Omit optional fields instead of sending null.');
    const type =
      body.bucket === 'TRIAL'
        ? TrialGrantDto
        : body.bucket === 'REGULAR' && body.mode === 'CUSTOM'
          ? CustomPurchaseDto
          : body.bucket === 'REGULAR' && body.mode === 'PACKAGE'
            ? PackagePurchaseDto
            : undefined;
    if (!type) bad('Select trial credits, custom purchase or package purchase.');
    const dto = plainToInstance(type as new () => GrantBody, value);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
      bad('Grant fields do not match the selected mode.');
    return dto;
  }
}
export class EntitlementQuery extends PageQuery {
  @O() @IsOptional() @IsString() @Length(1, 128) studentId?: string;
}
export class LedgerQuery extends PageQuery {
  @O({ enum: ENTITLEMENT_BUCKETS })
  @IsOptional()
  @IsIn(ENTITLEMENT_BUCKETS)
  bucket?: EntitlementBucket;
}
export class PoolBalanceDto {
  @P() remaining!: number;
  @P() reserved!: number;
  @P() available!: number;
}
export class BalancesDto {
  @P({ type: PoolBalanceDto }) TRIAL!: PoolBalanceDto;
  @P({ type: PoolBalanceDto }) REGULAR!: PoolBalanceDto;
}
export class PackageSnapshotDto {
  @P() name!: string;
  @P() quantity!: number;
  @P() priceAudCents!: number;
  @P({ enum: ['AUD'] }) currency!: 'AUD';
  @P() version!: number;
}
export class LessonPackageDto extends PackageSnapshotDto {
  @P() id!: string;
}
export class ActorSummaryDto {
  @P() id!: string;
  @P() name!: string;
}
export class EntryDto {
  @P() id!: string;
  @P() studentId!: string;
  @P({ enum: ENTITLEMENT_BUCKETS }) bucket!: EntitlementBucket;
  @P({ enum: ENTITLEMENT_KINDS }) kind!: EntitlementKind;
  @P() quantity!: number;
  @P() createdAt!: string;
  @P({ type: String, nullable: true }) note!: string | null;
  @P({ type: String, nullable: true }) participantId!: string | null;
  @P({ type: String, nullable: true }) sessionId!: string | null;
  @P({ type: ActorSummaryDto, nullable: true }) actor!: ActorSummaryDto | null;
  @P({ type: String, nullable: true }) packageId!: string | null;
  @P({ type: PackageSnapshotDto, nullable: true }) packageSnapshot!: PackageSnapshotDto | null;
}
export class EntitlementSummaryDto {
  @P() studentId!: string;
  @P() name!: string;
  @P() yearLevel!: string;
  @P({ type: BalancesDto }) balances!: BalancesDto;
  @P({ enum: MEMBERSHIP_CATEGORIES }) membershipCategory!: MembershipCategory;
  @P({ type: String, nullable: true }) firstPurchasedAt!: string | null;
  @P() membershipAsOfDate!: string;
  @P() nextCategoryChangeAt!: string;
}
export class GrantResultDto {
  @P({ type: EntryDto }) entry!: EntryDto;
  @P({ type: BalancesDto }) balances!: BalancesDto;
  @P({ enum: MEMBERSHIP_CATEGORIES }) membershipCategory!: MembershipCategory;
  @P({ type: String, nullable: true }) firstPurchasedAt!: string | null;
  @P({ type: [String] }) closedTaskIds!: string[];
}
class PageDto {
  @P() total!: number;
  @P() page!: number;
  @P() pageSize!: number;
}
export class LessonPackagePageDto extends PageDto {
  @P({ type: [LessonPackageDto] }) items!: LessonPackageDto[];
}
export class EntitlementPageDto extends PageDto {
  @P({ type: [EntitlementSummaryDto] }) items!: EntitlementSummaryDto[];
}
export class LedgerPageDto extends PageDto {
  @P({ type: [EntryDto] }) items!: EntryDto[];
}
