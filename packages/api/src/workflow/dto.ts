import {
  YEAR_LEVELS,
  GUARDIAN_GENDERS,
  STUDENT_GENDERS,
  MEMBERSHIP_CATEGORIES,
  type MembershipCategory,
  COMMUNICATION_CHANNELS,
  SUPPORTED_LANGUAGES,
  PARTICIPANT_KINDS,
  FEEDBACK_ATTENDANCES,
  FOLLOW_UP_OUTCOMES,
  TASK_STATUSES,
  TASK_TYPES,
  type ParticipantKind,
  type FeedbackAttendance,
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
  @P() @IsInt() @Min(1) @Max(100) capacity!: number;
}
export class UpdateSessionDto extends PartialType(CreateSessionDto) {
  @P() @IsInt() @Min(1) expectedVersion!: number;
  @P() @text(1, 500) reason!: string;
  @P({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  confirmedAffectedParticipantIds!: string[];
}
export class CancelSessionDto extends VersionDto {
  @P({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  confirmedAffectedParticipantIds!: string[];
}
export class AddParticipantDto {
  @P() @text(1, 128) studentId!: string;
  @P({ enum: PARTICIPANT_KINDS }) @IsIn(PARTICIPANT_KINDS) kind!: ParticipantKind;
  @O({ description: 'Optional open rebooking task for this student and subject; TRIAL only.' })
  @IsOptional()
  @text(1, 128)
  sourceRebookingTaskId?: string;
}
export class MoveParticipantDto extends VersionDto {
  @P() @text(1, 128) targetSessionId!: string;
}
export class FeedbackItemDto {
  @P() @text(1, 128) participantId!: string;
  @P({ enum: FEEDBACK_ATTENDANCES }) @IsIn(FEEDBACK_ATTENDANCES) attendance!: FeedbackAttendance;
  @O() @IsOptional() @text() feedback?: string;
  @O() @IsOptional() @text() abilityNote?: string;
  @O() @IsOptional() @text() preferenceNote?: string;
}
export class FeedbackDto {
  @P() @IsInt() @Min(1) expectedVersion!: number;
  @O() @IsOptional() @text(0, 2000) summary?: string;
  @P({ type: [FeedbackItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FeedbackItemDto)
  students!: FeedbackItemDto[];
}
export class CommunicationDto {
  @P() @text(1, 100) guardianNameSnapshot!: string;
  @O() @IsOptional() @text(0, 100) relationshipSnapshot?: string;
  @P({ enum: channels }) @IsIn(channels) channel!: string;
  @P() @text(1, 2000) content!: string;
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
  @P({ enum: FOLLOW_UP_OUTCOMES })
  @IsIn(FOLLOW_UP_OUTCOMES)
  outcome!: string;
  @O() @IsOptional() @IsISO8601({ strict: true }) nextDueAt?: string;
  @O() @IsOptional() @text(0, 500) closeReason?: string;
  @O() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) firstEnrolledOn?: string;
}
export class ReopenDto extends VersionDto {
  @P() @IsISO8601({ strict: true }) nextDueAt!: string;
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
export class EligibilityQuery {
  @P() @text(1, 128) courseId!: string;
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
  @P() capacity!: number;
  @P() participantCount!: number;
  @P() trialCount!: number;
  @P() newCount!: number;
  @P() status!: string;
  @P() version!: number;
  @P({ type: String, nullable: true }) feedbackSubmittedAt!: string | null;
  @P({ type: String, nullable: true }) summary!: string | null;
}
export class ParticipantDto extends StudentDto {
  @P() participantId!: string;
  @P() kind!: string;
  @P() category!: string;
  @P() bookingStatus!: string;
  @P() attendance!: string;
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
  @P({ type: String, nullable: true }) firstEnrolledOn!: string | null;
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
export class EligibilityDto {
  @P() remaining!: number;
  @P() available!: number;
  @P({ type: String, nullable: true }) reason!: string | null;
}
export class TaskDto {
  @P() id!: string;
  @P() type!: string;
  @P() status!: string;
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
