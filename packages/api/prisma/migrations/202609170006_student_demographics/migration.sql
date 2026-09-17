ALTER TABLE "Student" ADD COLUMN "gender" TEXT, ADD COLUMN "age" INTEGER;
ALTER TABLE "Student" ADD CONSTRAINT "Student_age_check" CHECK ("age" BETWEEN 0 AND 120),
  ADD CONSTRAINT "Student_gender_check" CHECK ("gender" IN ('', 'FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'));
-- Historical ages and genders remain unknown; never infer them from names/year levels.
