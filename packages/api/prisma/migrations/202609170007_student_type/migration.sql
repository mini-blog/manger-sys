CREATE TYPE "StudentType" AS ENUM ('TRIAL', 'MEMBER');
ALTER TABLE "Student" ADD COLUMN "type" "StudentType" NOT NULL DEFAULT 'TRIAL';
UPDATE "Student" SET "type" = 'MEMBER' WHERE "firstPurchasedAt" IS NOT NULL;
ALTER TABLE "Student" ADD CONSTRAINT "Student_type_purchase_check" CHECK (
  ("type" = 'TRIAL' AND "firstPurchasedAt" IS NULL) OR
  ("type" = 'MEMBER' AND "firstPurchasedAt" IS NOT NULL)
);
