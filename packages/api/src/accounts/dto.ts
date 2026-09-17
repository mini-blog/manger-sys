import { ACCOUNT_STATUSES, USER_ROLES, type AccountStatus, type UserRole } from '@student/common';
import { ApiProperty as P, ApiPropertyOptional as O } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ValidateIf,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
} from 'class-validator';
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const email = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
export class AccountQuery {
  @O() @IsOptional() @trim() @IsString() @Length(0, 100) q?: string;
  @O({ enum: USER_ROLES }) @IsOptional() @IsIn(USER_ROLES) role?: UserRole;
  @O({ enum: ACCOUNT_STATUSES }) @IsOptional() @IsIn(ACCOUNT_STATUSES) status?: AccountStatus;
  @O({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page: number = 1;
  @O({ default: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
}
export class AccountDto {
  @P() id!: string;
  @P() name!: string;
  @P() email!: string;
  @P({ enum: USER_ROLES }) role!: UserRole;
  @P({ enum: ACCOUNT_STATUSES }) status!: AccountStatus;
  @P() isSuperAdmin!: boolean;
  @P() version!: number;
  @P({ type: String, nullable: true, format: 'date-time' }) disabledAt!: string | null;
}
export class AccountPageDto {
  @P({ type: [AccountDto] }) items!: AccountDto[];
  @P() total!: number;
  @P() page!: number;
  @P() pageSize!: number;
}
export class CreateAccountDto {
  @P() @trim() @IsString() @Length(1, 100) name!: string;
  @P() @email() @IsEmail() @Length(3, 254) email!: string;
  @P({ enum: USER_ROLES }) @IsIn(USER_ROLES) role!: UserRole;
  @P({ minLength: 10, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(10, 128)
  @Matches(/\S/)
  password!: string;
}
export class UpdateAccountDto {
  @O() @ValidateIf((_, v) => v !== undefined) @trim() @IsString() @Length(1, 100) name?: string;
  @O() @ValidateIf((_, v) => v !== undefined) @email() @IsEmail() @Length(3, 254) email?: string;
  @P() @IsInt() @Min(1) expectedVersion!: number;
}
export class ResetPasswordDto {
  @P({ minLength: 10, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(10, 128)
  @Matches(/\S/)
  password!: string;
  @P() @IsInt() @Min(1) expectedVersion!: number;
}
export class DeactivateAccountDto {
  @P() @IsInt() @Min(1) expectedVersion!: number;
  @P() @trim() @IsString() @Length(1, 500) reason!: string;
  @O() @ValidateIf((_, v) => v !== undefined) @IsString() @Length(1, 128) successorAdminId?: string;
}
export class BlockingLessonDto {
  @P() id!: string;
  @P() className!: string;
  @P() courseName!: string;
  @P({ format: 'date-time' }) startsAt!: string;
}
export class DeactivationImpactDto {
  @P() expectedVersion!: number;
  @P() ownedStudentCount!: number;
  @P() openFollowupCount!: number;
  @P({ type: [BlockingLessonDto] }) blockingSessions!: BlockingLessonDto[];
  @P() canDeactivate!: boolean;
  @P({ type: [AccountDto] }) eligibleSuccessors!: AccountDto[];
  @P({ type: String, nullable: true }) blockedReason!: string | null;
}
export class AccountActionDto {
  @P() id!: string;
  @P() version!: number;
}
export class DeactivationResultDto extends AccountActionDto {
  @P({ enum: ACCOUNT_STATUSES }) status!: AccountStatus;
  @P() transferredStudentCount!: number;
  @P() transferredTaskCount!: number;
}
