ALTER TABLE "Student" ADD COLUMN "guardianOccupation" TEXT,
  ADD COLUMN "guardianAge" INTEGER,
  ADD COLUMN "guardianGender" TEXT;
ALTER TABLE "Student" ADD CONSTRAINT "Student_guardianAge_check" CHECK ("guardianAge" BETWEEN 0 AND 120),
  ADD CONSTRAINT "Student_guardianGender_check" CHECK ("guardianGender" IN ('', 'FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'));

CREATE TABLE "StudentAdminLink" (
  "studentId" TEXT PRIMARY KEY REFERENCES "Student"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "adminId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdByAdminId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StudentAdminLink_adminId_idx" ON "StudentAdminLink"("adminId");
CREATE INDEX "StudentAdminLink_createdByAdminId_idx" ON "StudentAdminLink"("createdByAdminId");
-- Existing ownership is known. The original recording admin is not: do not invent it.
INSERT INTO "StudentAdminLink" ("studentId", "adminId", "createdAt")
SELECT id, "ownerAdminId", "createdAt" FROM "Student";

-- Existing workflow queries still use ownerAdminId. It remains the sole ownership write
-- entry point until those consumers migrate, and this trigger makes the link consistent.
CREATE FUNCTION sync_student_admin_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "StudentAdminLink" ("studentId", "adminId", "createdAt")
  VALUES (NEW.id, NEW."ownerAdminId", NEW."createdAt")
  ON CONFLICT ("studentId") DO UPDATE SET "adminId" = EXCLUDED."adminId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Student_sync_admin_link" AFTER INSERT OR UPDATE OF "ownerAdminId" ON "Student"
FOR EACH ROW EXECUTE FUNCTION sync_student_admin_link();

CREATE FUNCTION guard_student_admin_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."adminId" IS DISTINCT FROM (SELECT "ownerAdminId" FROM "Student" WHERE id=NEW."studentId") THEN
    RAISE EXCEPTION 'Responsible admin must match student ownership' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."studentId" IS DISTINCT FROM OLD."studentId" OR
    (OLD."createdByAdminId" IS NOT NULL AND NEW."createdByAdminId" IS DISTINCT FROM OLD."createdByAdminId")) THEN
    RAISE EXCEPTION 'Recorded-by relationship is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW."createdByAdminId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE id=NEW."createdByAdminId" AND role='ADMIN') THEN
    RAISE EXCEPTION 'Recording user must be an admin' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StudentAdminLink_guard" BEFORE INSERT OR UPDATE ON "StudentAdminLink"
FOR EACH ROW EXECUTE FUNCTION guard_student_admin_link();
-- A student must have exactly one matching link at commit, including seed/legacy insert paths.
ALTER TABLE "StudentAdminLink" ADD CONSTRAINT "StudentAdminLink_student_owner_key" UNIQUE ("studentId", "adminId");
ALTER TABLE "Student" ADD CONSTRAINT "Student_admin_link_fkey"
  FOREIGN KEY (id, "ownerAdminId") REFERENCES "StudentAdminLink"("studentId", "adminId")
  DEFERRABLE INITIALLY DEFERRED;
