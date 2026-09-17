-- Unreleased development cutover. Legacy tasks must be removed by an explicit
-- development database reset, never silently translated into check-ins or purchases.
ALTER TABLE "Task" DROP CONSTRAINT "Task_source_type_check", DROP CONSTRAINT "Task_purpose_type_check", DROP CONSTRAINT "Task_followup_outcome_check";
DROP INDEX "Task_teacher_session_unique";
DROP INDEX "Task_trial_participant_unique";
DROP INDEX "Task_feedback_participant_unique";
ALTER TABLE "Task" DROP COLUMN "rebookedToParticipantId";
ALTER TYPE "TaskType" RENAME TO "TaskType_old";
CREATE TYPE "TaskType" AS ENUM ('TRIAL_FEEDBACK', 'TRIAL_FOLLOWUP');
ALTER TABLE "Task" ALTER COLUMN "type" TYPE "TaskType" USING "type"::text::"TaskType";
DROP TYPE "TaskType_old";
ALTER TYPE "TaskPurpose" RENAME TO "TaskPurpose_old";
CREATE TYPE "TaskPurpose" AS ENUM ('FIRST_PURCHASE');
ALTER TABLE "Task" ALTER COLUMN "purpose" TYPE "TaskPurpose" USING "purpose"::text::"TaskPurpose";
DROP TYPE "TaskPurpose_old";
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_source_type_check" CHECK ("participantId" IS NOT NULL),
  ADD CONSTRAINT "Task_purpose_type_check" CHECK (
    ("type" = 'TRIAL_FOLLOWUP' AND "purpose" = 'FIRST_PURCHASE') OR
    ("type" = 'TRIAL_FEEDBACK' AND "purpose" IS NULL AND "resolvedByEntitlementEntryId" IS NULL)),
  ADD CONSTRAINT "Task_followup_outcome_check" CHECK (
    "followupOutcome" IS NULL OR ("type" = 'TRIAL_FOLLOWUP' AND "status" = 'DONE' AND "completedAt" IS NOT NULL
      AND ("followupOutcome" <> 'PURCHASE_RECORDED' OR "resolvedByEntitlementEntryId" IS NOT NULL)));
CREATE UNIQUE INDEX "Task_trial_participant_unique" ON "Task" ("participantId") WHERE "type" = 'TRIAL_FOLLOWUP';
CREATE UNIQUE INDEX "Task_feedback_participant_unique" ON "Task" ("participantId") WHERE "type" = 'TRIAL_FEEDBACK';
ALTER TABLE "ClassSession" DROP COLUMN "capacity", DROP COLUMN "summary", DROP COLUMN "feedbackSubmittedAt", DROP COLUMN "feedbackPayloadHash";
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_time_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Student" DROP COLUMN "firstEnrolledOn";
ALTER TABLE "SessionParticipant" DROP COLUMN "isNewToClass";
ALTER TABLE "ScheduleChange" DROP COLUMN "targetSessionId";
