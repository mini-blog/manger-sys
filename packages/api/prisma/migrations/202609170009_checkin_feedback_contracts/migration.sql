BEGIN;

CREATE TYPE "FollowupOutcome" AS ENUM (
  'PURCHASE_RECORDED', 'INTERESTED', 'CONSIDERING', 'NOT_INTERESTED', 'UNREACHABLE'
);

ALTER TABLE "SessionParticipant"
  ADD COLUMN "checkedInAt" TIMESTAMPTZ(3),
  ADD COLUMN "checkedInBy" TEXT,
  ADD COLUMN "feedbackSubmittedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "SessionParticipant_checkedInBy_fkey"
    FOREIGN KEY ("checkedInBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SessionParticipant_checkin_check" CHECK (
    ("checkedInAt" IS NULL AND "checkedInBy" IS NULL) OR
    ("checkedInAt" IS NOT NULL AND "checkedInBy" IS NOT NULL AND "attendance" = 'ATTENDED')
  ),
  ADD CONSTRAINT "SessionParticipant_feedback_attendance_check" CHECK (
    "feedbackSubmittedAt" IS NULL OR "attendance" = 'ATTENDED'
  );

-- Do not infer check-in timestamps, individual submission times or outcomes for old rows.
ALTER TABLE "Task"
  ADD COLUMN "followupOutcome" "FollowupOutcome",
  DROP CONSTRAINT "Task_source_type_check",
  ADD CONSTRAINT "Task_source_type_check" CHECK (
    ("type" = 'LESSON_FEEDBACK' AND "participantId" IS NULL) OR
    ("type" IN ('TRIAL_FEEDBACK', 'TRIAL_FOLLOWUP') AND "participantId" IS NOT NULL)
  ),
  ADD CONSTRAINT "Task_followup_outcome_check" CHECK (
    "followupOutcome" IS NULL OR
    ("type" = 'TRIAL_FOLLOWUP' AND "status" = 'DONE' AND "completedAt" IS NOT NULL
      AND ("followupOutcome" <> 'PURCHASE_RECORDED' OR "resolvedByEntitlementEntryId" IS NOT NULL))
  );

-- Keep both existing legacy indexes. Each participant can have one teacher evaluation
-- and a separate administrator follow-up, but not duplicate evaluations.
CREATE UNIQUE INDEX "Task_feedback_participant_unique"
  ON "Task" ("participantId") WHERE "type" = 'TRIAL_FEEDBACK';

ALTER TABLE "CommunicationLog"
  ADD COLUMN "concerns" TEXT,
  ADD COLUMN "coreQuestion" TEXT,
  ADD COLUMN "reasonTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMIT;
