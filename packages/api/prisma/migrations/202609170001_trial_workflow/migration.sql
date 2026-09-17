-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Attendance" AS ENUM ('PENDING', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('LESSON_FEEDBACK', 'TRIAL_FOLLOWUP');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "feedbackPayloadHash" TEXT,
ADD COLUMN     "feedbackSubmittedAt" TIMESTAMPTZ(3),
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SessionParticipant" ADD COLUMN     "abilityNote" TEXT,
ADD COLUMN     "attendance" "Attendance" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
ADD COLUMN     "categorySnapshot" TEXT,
ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "preferenceNote" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "firstEnrolledOn" DATE,
ADD COLUMN     "guardianEmail" TEXT,
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "guardianPhone" TEXT,
ADD COLUMN     "guardianRelationship" TEXT,
ADD COLUMN     "guardianWechat" TEXT,
ADD COLUMN     "interestedSubjects" TEXT,
ADD COLUMN     "learningGoals" TEXT,
ADD COLUMN     "preferredChannel" TEXT,
ADD COLUMN     "preferredLanguage" TEXT NOT NULL DEFAULT 'en-AU',
ADD COLUMN     "preferredTimes" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "sourceSnapshot" JSONB,
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT,
    "participantId" TEXT,
    "guardianNameSnapshot" TEXT NOT NULL,
    "relationshipSnapshot" TEXT,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "outcome" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleChange" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "targetSessionId" TEXT,
    "studentId" TEXT,
    "participantId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutationReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_availableAt_dueAt_idx" ON "Task"("assigneeId", "status", "availableAt", "dueAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_studentId_occurredAt_idx" ON "CommunicationLog"("studentId", "occurredAt");

-- CreateIndex
CREATE INDEX "ScheduleChange_sessionId_createdAt_idx" ON "ScheduleChange"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MutationReceipt_userId_operation_key_key" ON "MutationReceipt"("userId", "operation", "key");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChange" ADD CONSTRAINT "ScheduleChange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChange" ADD CONSTRAINT "ScheduleChange_targetSessionId_fkey" FOREIGN KEY ("targetSessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChange" ADD CONSTRAINT "ScheduleChange_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChange" ADD CONSTRAINT "ScheduleChange_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChange" ADD CONSTRAINT "ScheduleChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationReceipt" ADD CONSTRAINT "MutationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Student" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE UNIQUE INDEX "Task_teacher_session_unique" ON "Task" ("sessionId") WHERE "type" = 'LESSON_FEEDBACK';
CREATE UNIQUE INDEX "Task_trial_participant_unique" ON "Task" ("participantId") WHERE "type" = 'TRIAL_FOLLOWUP';
ALTER TABLE "Task" ADD CONSTRAINT "Task_source_type_check" CHECK (("type" = 'LESSON_FEEDBACK' AND "participantId" IS NULL) OR ("type" = 'TRIAL_FOLLOWUP' AND "participantId" IS NOT NULL));
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_time_capacity_check" CHECK ("endsAt" > "startsAt" AND "capacity" > 0);
