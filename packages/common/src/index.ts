/** Browser-safe domain values. Do not import Nest, Prisma or React here. */
export const BUSINESS_TIMEZONE = 'Australia/Melbourne';
export const SUPPORTED_LANGUAGES = ['en-AU', 'zh-CN'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const USER_ROLES = ['ADMIN', 'TEACHER'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const STUDENT_TYPES = ['TRIAL', 'MEMBER'] as const;
export type StudentType = (typeof STUDENT_TYPES)[number];
/** Booking funding card, independent of StudentType; all lessons are ordinary classes. */
export const PARTICIPANT_KINDS = ['TRIAL', 'REGULAR'] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];
export const SESSION_STATUSES = ['SCHEDULED', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const BOOKING_STATUSES = ['BOOKED', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const ATTENDANCE_STATUSES = ['PENDING', 'ATTENDED', 'NO_SHOW'] as const;
export type Attendance = (typeof ATTENDANCE_STATUSES)[number];
export const FEEDBACK_ATTENDANCES = ['ATTENDED', 'NO_SHOW'] as const;
export type FeedbackAttendance = (typeof FEEDBACK_ATTENDANCES)[number];
export const TASK_TYPES = ['LESSON_FEEDBACK', 'TRIAL_FOLLOWUP'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const COMMUNICATION_CHANNELS = ['EMAIL', 'PHONE', 'SMS', 'WECHAT', 'IN_PERSON'] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];
export const FOLLOW_UP_OUTCOMES = [
  'NO_ANSWER',
  'CONSIDERING',
  'INTERESTED',
  'NOT_INTERESTED',
  'ENROLLED',
] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];
export const YEAR_LEVELS = [
  'Foundation',
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Year 5',
  'Year 6',
  'Year 7',
  'Year 8',
  'Year 9',
  'Year 10',
  'Year 11',
  'Year 12',
  'Not assessed',
] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
export interface AuthSession {
  user: UserIdentity;
  csrfToken: string;
}

export const ENTITLEMENT_BUCKETS = ['TRIAL', 'REGULAR'] as const;
export type EntitlementBucket = (typeof ENTITLEMENT_BUCKETS)[number];
export const ENTITLEMENT_KINDS = [
  'INITIAL_TRIAL',
  'TRIAL_GRANT',
  'PURCHASE',
  'CONSUMPTION',
  'MIGRATION',
] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];
export const MEMBERSHIP_CATEGORIES = ['TRIAL_STUDENT', 'NEW_MEMBER', 'MEMBER'] as const;
export type MembershipCategory = (typeof MEMBERSHIP_CATEGORIES)[number];
export const TASK_PURPOSES = ['FIRST_PURCHASE', 'MEMBER_CARE', 'REBOOKING'] as const;
export type TaskPurpose = (typeof TASK_PURPOSES)[number];
export const PURCHASE_MODES = ['CUSTOM', 'PACKAGE'] as const;
export type PurchaseMode = (typeof PURCHASE_MODES)[number];
// The legacy writable outcome remains above until the coordinated workflow cutover.
export const ENTITLEMENT_FOLLOW_UP_OUTCOMES = [
  'NO_ANSWER',
  'CONSIDERING',
  'INTERESTED',
  'NOT_INTERESTED',
  'RESOLVED',
] as const;
export type EntitlementFollowUpOutcome = (typeof ENTITLEMENT_FOLLOW_UP_OUTCOMES)[number];
export interface PoolBalance {
  remaining: number;
  reserved: number;
  available: number;
}
export type EntitlementBalances = Record<EntitlementBucket, PoolBalance>;
export interface PackageSnapshot {
  name: string;
  quantity: number;
  priceAudCents: number;
  currency: 'AUD';
  version: number;
}

export const GUARDIAN_GENDERS = ['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'] as const;
export type GuardianGender = (typeof GUARDIAN_GENDERS)[number];

export const STUDENT_GENDERS = ['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'] as const;
export type StudentGender = (typeof STUDENT_GENDERS)[number];
