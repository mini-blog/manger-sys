-- CreateEnum
CREATE TYPE "EntitlementBucket" AS ENUM ('TRIAL', 'REGULAR');

-- CreateEnum
CREATE TYPE "EntitlementKind" AS ENUM ('INITIAL_TRIAL', 'TRIAL_GRANT', 'PURCHASE', 'CONSUMPTION', 'MIGRATION');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "firstPurchasedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "EntitlementEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bucket" "EntitlementBucket" NOT NULL,
    "kind" "EntitlementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "participantId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitlementEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementEntry_participantId_key" ON "EntitlementEntry"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementEntry_sourceKey_key" ON "EntitlementEntry"("sourceKey");

-- CreateIndex
CREATE INDEX "EntitlementEntry_studentId_bucket_createdAt_id_idx" ON "EntitlementEntry"("studentId", "bucket", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "EntitlementEntry_initial_trial_unique" ON "EntitlementEntry" ("studentId") WHERE "kind" = 'INITIAL_TRIAL';
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_quantity_kind_check" CHECK (
  ("kind" = 'INITIAL_TRIAL' AND "bucket" = 'TRIAL' AND "quantity" = 1) OR
  ("kind" = 'TRIAL_GRANT' AND "bucket" = 'TRIAL' AND "quantity" BETWEEN 1 AND 10000) OR
  ("kind" = 'PURCHASE' AND "bucket" = 'REGULAR' AND "quantity" BETWEEN 1 AND 10000) OR
  ("kind" = 'CONSUMPTION' AND "quantity" = -1) OR
  ("kind" = 'MIGRATION' AND ("quantity" > 0 OR ("quantity" = 0 AND "bucket" = 'REGULAR')))
);
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_participant_check" CHECK (
  ("kind" = 'CONSUMPTION' AND "participantId" IS NOT NULL) OR
  ("kind" <> 'CONSUMPTION' AND "participantId" IS NULL)
);
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_actor_check" CHECK ("actorId" IS NOT NULL OR "kind" = 'MIGRATION');
