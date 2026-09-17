import {
  YEAR_LEVELS,
  GUARDIAN_GENDERS,
  STUDENT_GENDERS,
  STUDENT_TYPES,
  type StudentType,
  MEMBERSHIP_CATEGORIES,
  type MembershipCategory,
  COMMUNICATION_CHANNELS,
  SUPPORTED_LANGUAGES,
  PARTICIPANT_KINDS,
  MANUAL_FOLLOWUP_OUTCOMES,
  type ManualFollowupOutcome,
  FOLLOWUP_OUTCOMES,
  FOLLOWUP_REASON_TAGS,
  type FollowupOutcome,
  type FollowupReasonTag,
  TASK_STATUSES,
  TASK_TYPES,
  type ParticipantKind,
  type TaskStatus,
  type TaskType,
  type SupportedLanguage,
} from '@student/common';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty as P, ApiPropertyOptional as O, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsBooleanString,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
const text = (min = 0, max = 1000) => applyDecorators(trim(), IsString(), Length(min, max));
export const years: readonly string[] = YEAR_LEVELS;
export const channels = COMMUNICATION_CHANNELS;
export class PageQuery {
  @O({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page: number =
    1;
  @O({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
  @O() @IsOptional() @text(0, 80) q?: string;
}
export class StudentQuery extends PageQuery {
  @O({ enum: MEMBERSHIP_CATEGORIES })
  @IsOptional()
  @IsIn(MEMBERSHIP_CATEGORIES)
  category?: MembershipCategory;
  @O() @IsOptional() @IsBooleanString() mine?: string;
}
export class StudentFields {
  @O() @IsOptional() @text(0, 120) guardianOccupation?: string;
  @O({ type: Number, minimum: 0, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  guardianAge?: number;
  @O({ enum: ['', ...GUARDIAN_GENDERS] })
  @IsOptional()
  @IsIn(['', ...GUARDIAN_GENDERS])
  guardianGender?: string;
  @O() @IsOptional() @text(0, 100) guardianName?: string;
  @O() @IsOptional() @text(0, 100) guardianRelationship?: string;
  @O() @IsOptional() @text(0, 40) guardianPhone?: string;
  @O() @IsOptional() @text(0, 254) guardianEmail?: string;
  @O() @IsOptional() @text(0, 100) guardianWechat?: string;
  @O({ enum: ['', ...channels.filter((c) => c !== 'IN_PERSON')] })
  @IsOptional()
  @IsIn(['', ...channels.filter((c) => c !== 'IN_PERSON')])
  preferredChannel?: string;
  @O({ enum: SUPPORTED_LANGUAGES })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  preferredLanguage?: string;
  @O() @IsOptional() @text() learningGoals?: string;
  @O() @IsOptional() @text() preferredTimes?: string;
  @O() @IsOptional() @text() interestedSubjects?: string;
}
export class StudentInputDto extends StudentFields {
  @O({ enum: ['', ...STUDENT_GENDERS] })
  @IsOptional()
  @IsIn(['', ...STUDENT_GENDERS])
  gender?: string;
  @O({ type: Number, minimum: 0, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;
  @P() @text(1, 100) name!: string;
  @P({ enum: years }) @IsIn(years) yearLevel!: string;
}
export class CreateStudentDto extends StudentInputDto {
  @O({ default: true }) @IsOptional() @IsBoolean() giftTrialCredit?: boolean;
}
export class UpdateStudentDto extends PartialType(StudentInputDto) {
  @O() @IsOptional() @IsBoolean() clearGuardianAge?: boolean;
  @O() @IsOptional() @IsBoolean() clearAge?: boolean;
  @P() @IsInt() @Min(1) expectedVersion!: number;
}
export class CheckInDto {
  @P() @IsInt() @Min(1) expectedVersion!: number;
}
export class CheckInResultDto {
  @P() id!: string;
  @P() version!: number;
  @P() sessionVersion!: number;
  @P({ enum: ['ATTENDED'] }) attendance!: 'ATTENDED';
  @P({ format: 'date-time' }) checkedInAt!: string;
  @P() checkedInBy!: string;
}
export class VersionDto {
  @P() @IsInt() @Min(1) expectedVersion!: number;
  @P() @text(1, 500) reason!: string;
}
export class WeekQuery {
  @P() @Matches(/^\d{4}-\d{2}-\d{2}$/) week!: string;
  @O() @IsOptional() @text(0, 80) q?: string;
  @O() @IsOptional() @text(1, 128) classGroupId?: string;
  @O() @IsOptional() @text(1, 128) courseId?: string;
  @O() @IsOptional() @text(1, 128) teacherId?: string;
}
export class CreateSessionDto {
  @P() @text(1, 128) classGroupId!: string;
  @P() @text(1, 128) courseId!: string;
  @P() @text(1, 128) teacherId!: string;
  @P() @IsISO8601({ strict: true }) startsAt!: string;
  @P() @IsISO8601({ strict: true }) endsAt!: string;
}
export class UpdateSessionDto extends PartialType(CreateSessionDto) {
  @P() @IsInt() @Min(1) expectedVersion!: number;
  @P() @text(1, 500) reason!: string;
}
export class CancelSessionDto extends VersionDto {}
export class AddParticipantDto {
  @P() @text(1, 128) studentId!: string;
  @P({
    enum: PARTICIPANT_KINDS,
    description:
      'Funding card to reserve, independent of student identity. All lessons are ordinary classes.',
  })
  @IsIn(PARTICIPANT_KINDS)
  kind!: ParticipantKind;
}
export class ParticipantFeedbackDto {
  @P() @IsInt() @Min(1) expectedVersion!: number;
  @P({ maxLength: 2000 }) @text(1, 2000) feedback!: string;
  @O({ maxLength: 2000 }) @IsOptional() @text(0, 2000) abilityNote?: string;
  @O({ maxLength: 2000 }) @IsOptional() @text(0, 2000) preferenceNote?: string;
}
export class CommunicationDto {
  @P() @text(1, 100) guardianNameSnapshot!: string;
  @O() @IsOptional() @text(0, 100) relationshipSnapshot?: string;
  @P({ enum: channels }) @IsIn(channels) channel!: string;
  @P() @text(1, 2000) content!: string;
  @O({ maxLength: 2000 }) @IsOptional() @text(0, 2000) concerns?: string;
  @O({ maxLength: 1000 }) @IsOptional() @text(0, 1000) coreQuestion?: string;
  @O({ enum: FOLLOWUP_REASON_TAGS, isArray: true, maxItems: 7, uniqueItems: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsIn(FOLLOWUP_REASON_TAGS, { each: true })
  reasonTags?: FollowupReasonTag[];
  @P() @IsISO8601({ strict: true }) occurredAt!: string;
  @O() @IsOptional() @text(1, 128) taskId?: string;
  @O() @IsOptional() @text(1, 128) participantId?: string;
}
export class FollowUpDto {
  @P() @IsInt() @Min(1) expectedVersion!: number;
  @P({ type: CommunicationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CommunicationDto)
  communication!: CommunicationDto;
  @P({ enum: MANUAL_FOLLOWUP_OUTCOMES })
  @IsIn(MANUAL_FOLLOWUP_OUTCOMES)
  outcome!: ManualFollowupOutcome;
}
export class TaskQuery extends PageQuery {
  @O({ enum: TASK_STATUSES })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;
  @O({ enum: TASK_TYPES })
  @IsOptional()
  @IsIn(TASK_TYPES)
  type?: TaskType;
  @O() @IsOptional() @IsBooleanString() overdue?: string;
}
export class SuggestionRequest {
  @P({ enum: channels }) @IsIn(channels) channel!: string;
  @P({ enum: SUPPORTED_LANGUAGES }) @IsIn(SUPPORTED_LANGUAGES) language!: SupportedLanguage;
}

export class ActionDto {
  @P() id!: string;
}
export class StudentDto {
  @P() id!: string;
  @P() name!: string;
  @P() yearLevel!: string;
}
export class StudentAdminViewDto {
  @P() id!: string;
  @P() name!: string;
}
export class StudentListItemDto extends StudentDto {
  @P({ enum: STUDENT_TYPES }) type!: StudentType;
  @P({ type: String, nullable: true }) gender!: string | null;
  @P({ type: Number, nullable: true }) age!: number | null;
  @O({ type: StudentAdminViewDto }) responsibleAdmin?: StudentAdminViewDto;
  @P({ enum: MEMBERSHIP_CATEGORIES }) membershipCategory!: MembershipCategory;
}
export class CategoryCountsDto {
  @P() TRIAL_STUDENT!: number;
  @P() NEW_MEMBER!: number;
  @P() MEMBER!: number;
}
export class StudentPageDto {
  @P({ type: [StudentListItemDto] }) items!: StudentListItemDto[];
  @P({ type: CategoryCountsDto }) categoryCounts!: CategoryCountsDto;
  @P() membershipAsOfDate!: string;
  @P() nextCategoryChangeAt!: string;
  @P() total!: number;
  @P() page!: number;
  @P() pageSize!: number;
}
export class LessonDto {
  @P() id!: string;
  @P() className!: string;
  @P() classGroupId!: string;
  @P() targetLevel!: string;
  @P() courseId!: string;
  @P() courseName!: string;
  @P() teacherName!: string;
  @P() teacherId!: string;
  @P() startsAt!: string;
  @P() endsAt!: string;
  @P() participantCount!: number;
  @P() trialCount!: number;
  @P() newCount!: number;
  @P() status!: string;
  @P() version!: number;
}
export class ParticipantDto extends StudentDto {
  @P({ enum: STUDENT_TYPES }) type!: StudentType;
  @P() participantId!: string;
  @P({ enum: PARTICIPANT_KINDS, description: 'Funding card, not student or lesson type.' })
  kind!: string;
  @P() category!: string;
  @P({
    enum: MEMBERSHIP_CATEGORIES,
    description: 'Live student identity, classified at the lesson date in Australia/Melbourne.',
  })
  membershipCategory!: MembershipCategory;
  @P() bookingStatus!: string;
  @P() attendance!: string;
  @P({
    description:
      'Current teacher may attempt check-in based on booking state and start time; available credits are rechecked on submission.',
  })
  canCheckIn!: boolean;
  @P({ type: String, nullable: true, format: 'date-time' }) checkedInAt!: string | null;
  @P({ type: String, nullable: true }) checkedInBy!: string | null;
  @P({ type: String, nullable: true, format: 'date-time' }) feedbackSubmittedAt!: string | null;
  @P() version!: number;
  @P() canManage!: boolean;
  @P({ type: String, nullable: true }) feedback!: string | null;
  @P({ type: String, nullable: true }) abilityNote!: string | null;
  @P({ type: String, nullable: true }) preferenceNote!: string | null;
}
export class RosterDto {
  @P({ type: LessonDto }) lesson!: LessonDto;
  @P({ type: [ParticipantDto] }) participants!: ParticipantDto[];
  @P({ type: [ParticipantDto] }) cancelled!: ParticipantDto[];
}
export class TeachingRecordDto {
  @P() participantId!: string;
  @P({ type: LessonDto }) lesson!: LessonDto;
  @P() category!: string;
  @P({
    enum: MEMBERSHIP_CATEGORIES,
    description:
      'Same live classification as the lesson roster; historical snapshots do not override it.',
  })
  membershipCategory!: MembershipCategory;
  @P() attendance!: string;
  @P({ type: String, nullable: true }) feedback!: string | null;
}
export class StudentDetailDto extends StudentListItemDto {
  @O({ type: StudentAdminViewDto, nullable: true }) recordedByAdmin?: StudentAdminViewDto | null;
  @O() guardianOccupation?: string;
  @O({ type: Number, nullable: true }) guardianAge?: number | null;
  @O() guardianGender?: string;
  @O({ type: String, nullable: true }) firstPurchasedAt?: string | null;
  @P() membershipAsOfDate!: string;
  @P() nextCategoryChangeAt!: string;
  @P() canEdit!: boolean;
  @P() version!: number;
  @O() guardianName?: string;
  @O() guardianRelationship?: string;
  @O() guardianPhone?: string;
  @O() guardianEmail?: string;
  @O() guardianWechat?: string;
  @O() preferredChannel?: string;
  @O() preferredLanguage?: string;
  @O() learningGoals?: string;
  @O() preferredTimes?: string;
  @O() interestedSubjects?: string;
  @P({ type: [TeachingRecordDto] }) teachingRecords!: TeachingRecordDto[];
}
export class CommunicationViewDto {
  @P() id!: string;
  @P() studentId!: string;
  @P() guardianNameSnapshot!: string;
  @P() channel!: string;
  @P() content!: string;
  @P({ type: String, nullable: true }) concerns!: string | null;
  @P({ type: String, nullable: true }) coreQuestion!: string | null;
  @P({ enum: FOLLOWUP_REASON_TAGS, isArray: true }) reasonTags!: string[];
  @P() occurredAt!: string;
  @P() authorName!: string;
  @P({ type: String, nullable: true }) outcome!: string | null;
}
export class CommunicationPageDto {
  @P({ type: [CommunicationViewDto] }) items!: CommunicationViewDto[];
  @P() total!: number;
  @P() page!: number;
  @P() pageSize!: number;
}
export class NamedOptionDto {
  @P() id!: string;
  @P() name!: string;
}
export class SessionOptionsDto {
  @P({ type: [NamedOptionDto] }) classes!: NamedOptionDto[];
  @P({ type: [NamedOptionDto] }) courses!: NamedOptionDto[];
  @P({ type: [NamedOptionDto] }) teachers!: NamedOptionDto[];
}
export class ChangeDto {
  @P() id!: string;
  @P() action!: string;
  @P() reason!: string;
  @P() actorName!: string;
  @P() createdAt!: string;
  @P() before!: string;
  @P() after!: string;
}
export class ChangePageDto {
  @P({ type: [ChangeDto] }) items!: ChangeDto[];
  @P() total!: number;
  @P() page!: number;
  @P() pageSize!: number;
}
export class TaskDto {
  @P({ type: String, nullable: true }) completedAt!: string | null;
  @P({ type: String, nullable: true }) resolvedByEntitlementEntryId!: string | null;
  @P() taskVersion!: number;
  @P({ type: Number, nullable: true }) studentVersion!: number | null;
  @P({ type: String, enum: MEMBERSHIP_CATEGORIES, nullable: true })
  membershipCategory!: MembershipCategory | null;
  @P({ type: String, nullable: true }) checkedInAt!: string | null;
  @P({ type: String, nullable: true }) feedbackSubmittedAt!: string | null;
  @P({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Whitelisted teaching snapshot; excludes guardian and financial data.',
  })
  sourceSnapshot!: Record<string, string>;
  @P() id!: string;
  @P({ enum: TASK_TYPES }) type!: TaskType;
  @P({ enum: TASK_STATUSES }) status!: TaskStatus;
  @P({ type: String, enum: FOLLOWUP_OUTCOMES, nullable: true })
  followupOutcome!: FollowupOutcome | null;
  @P() version!: number;
  @P() sessionId!: string;
  @P({ type: String, nullable: true }) participantId!: string | null;
  @P({ type: String, nullable: true }) reason!: string | null;
  @P() availableAt!: string;
  @P() dueAt!: string;
  @P() className!: string;
  @P() courseName!: string;
  @P() teacherName!: string;
  @P() startsAt!: string;
  @P() endsAt!: string;
  @P({ type: String, nullable: true }) studentId!: string | null;
  @P({ type: String, nullable: true }) studentName!: string | null;
}
export class TaskPageDto {
  @P({ type: [TaskDto] }) items!: TaskDto[];
  @P() total!: number;
  @P() page!: number;
  @P() pageSize!: number;
}
export class TaskDetailDto extends TaskDto {
  @O({ type: [CommunicationViewDto] }) communications?: CommunicationViewDto[];
  @P({ type: LessonDto }) lesson!: LessonDto;
  @P({ type: StudentDetailDto, nullable: true }) student!: StudentDetailDto | null;
  @P({ type: ParticipantDto, nullable: true }) participant!: ParticipantDto | null;
}
export class ObservationDto {
  @P() text!: string;
  @P({ type: [String] }) sourceIds!: string[];
}
export class EvidenceDto {
  @P() id!: string;
  @P() text!: string;
}
export class SuggestionDto {
  @P() summary!: string;
  @P({ type: [ObservationDto] }) observations!: ObservationDto[];
  @P({ type: [String] }) questions!: string[];
  @P() suggestedNextStep!: string;
  @P({ type: [String] }) talkingPoints!: string[];
  @P({ type: String, nullable: true }) subject!: string | null;
  @P({ type: String, nullable: true }) messageDraft!: string | null;
  @P() source!: string;
  @P() generatedAt!: string;
  @P({ type: [String] }) inputRecordIds!: string[];
  @P({ type: [EvidenceDto] }) evidence!: EvidenceDto[];
}
