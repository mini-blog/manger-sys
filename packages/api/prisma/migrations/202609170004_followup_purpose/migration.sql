-- CreateEnum
CREATE TYPE "MembershipCategory" AS ENUM ('TRIAL_STUDENT', 'NEW_MEMBER', 'MEMBER');

-- CreateEnum
CREATE TYPE "TaskPurpose" AS ENUM ('FIRST_PURCHASE', 'MEMBER_CARE', 'REBOOKING');

-- AlterTable
ALTER TABLE "SessionParticipant" ADD COLUMN     "membershipCategorySnapshot" "MembershipCategory";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "purpose" "TaskPurpose",
ADD COLUMN     "rebookedToParticipantId" TEXT,
ADD COLUMN     "resolvedByEntitlementEntryId" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_resolvedByEntitlementEntryId_fkey" FOREIGN KEY ("resolvedByEntitlementEntryId") REFERENCES "EntitlementEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_rebookedToParticipantId_fkey" FOREIGN KEY ("rebookedToParticipantId") REFERENCES "SessionParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Expansion only: legacy administrator tasks may retain a null purpose until reconciliation.
ALTER TABLE "Task" ADD CONSTRAINT "Task_purpose_type_check" CHECK (
  "type" = 'TRIAL_FOLLOWUP' OR ("purpose" IS NULL AND "resolvedByEntitlementEntryId" IS NULL AND "rebookedToParticipantId" IS NULL)
);
