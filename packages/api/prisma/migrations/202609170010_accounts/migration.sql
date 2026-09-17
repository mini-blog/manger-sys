CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');
ALTER TABLE "User" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "disabledAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "User_super_admin" CHECK (NOT "isSuperAdmin" OR role = 'ADMIN'),
  ADD CONSTRAINT "User_disabled_time" CHECK ((status = 'DISABLED') = ("disabledAt" IS NOT NULL)),
  ADD CONSTRAINT "User_positive_version" CHECK (version > 0);
CREATE UNIQUE INDEX "User_email_casefold_key" ON "User" (lower(email));
CREATE TABLE "AccountAudit" (
  id TEXT PRIMARY KEY,
  "actorId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT,
  "targetUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  reason TEXT,
  before JSONB NOT NULL,
  after JSONB NOT NULL,
  "requestKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountAudit_actor" CHECK ((action = 'SYSTEM_BOOTSTRAP') = ("actorId" IS NULL))
);
CREATE INDEX "AccountAudit_targetUserId_createdAt_idx" ON "AccountAudit" ("targetUserId", "createdAt");
