-- StudentSys AI v2 schema for EMPTY databases only. Use with the AI v2 application services.
-- Keep aligned with prisma/schema.prisma, including SQL-only constraints and triggers.
BEGIN;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AccountStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccountStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


--
-- Name: Attendance; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Attendance" AS ENUM (
    'PENDING',
    'ATTENDED',
    'NO_SHOW'
);


--
-- Name: BookingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BookingStatus" AS ENUM (
    'BOOKED',
    'CANCELLED'
);


--
-- Name: EntitlementBucket; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EntitlementBucket" AS ENUM (
    'TRIAL',
    'REGULAR'
);


--
-- Name: EntitlementKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EntitlementKind" AS ENUM (
    'INITIAL_TRIAL',
    'TRIAL_GRANT',
    'PURCHASE',
    'CONSUMPTION',
    'MIGRATION'
);


--
-- Name: FollowupOutcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FollowupOutcome" AS ENUM (
    'PURCHASE_RECORDED',
    'NOT_PURCHASED'
);


--
-- Name: MembershipCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipCategory" AS ENUM (
    'TRIAL_STUDENT',
    'NEW_MEMBER',
    'MEMBER'
);


--
-- Name: ParticipantKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ParticipantKind" AS ENUM (
    'REGULAR',
    'TRIAL'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'TEACHER'
);


--
-- Name: SessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStatus" AS ENUM (
    'SCHEDULED',
    'CANCELLED'
);


--
-- Name: StudentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StudentType" AS ENUM (
    'TRIAL',
    'MEMBER'
);


--
-- Name: TaskPurpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskPurpose" AS ENUM (
    'FIRST_PURCHASE',
    'POST_TRIAL_REVIEW'
);


--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'OPEN',
    'DONE',
    'CANCELLED'
);


--
-- Name: TaskType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskType" AS ENUM (
    'TRIAL_FEEDBACK',
    'TRIAL_FOLLOWUP',
    'STUDENT_AI_REPORT'
);


--
-- Name: guard_student_admin_link(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_student_admin_link() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: sync_student_admin_link(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_student_admin_link() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "StudentAdminLink" ("studentId", "adminId", "createdAt")
  VALUES (NEW.id, NEW."ownerAdminId", NEW."createdAt")
  ON CONFLICT ("studentId") DO UPDATE SET "adminId" = EXCLUDED."adminId";
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AccountAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AccountAudit" (
    id text NOT NULL,
    "actorId" text,
    "targetUserId" text NOT NULL,
    action text NOT NULL,
    reason text,
    before jsonb NOT NULL,
    after jsonb NOT NULL,
    "requestKey" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "AccountAudit_actor" CHECK (((action = 'SYSTEM_BOOTSTRAP'::text) = ("actorId" IS NULL)))
);


--
-- Name: AuthSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuthSession" (
    "tokenHash" text NOT NULL,
    "csrfToken" text NOT NULL,
    "userId" text NOT NULL,
    "expiresAt" timestamp(3) with time zone NOT NULL
);


--
-- Name: ClassGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClassGroup" (
    id text NOT NULL,
    name text NOT NULL,
    "targetLevel" text NOT NULL
);


--
-- Name: ClassSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClassSession" (
    id text NOT NULL,
    "classGroupId" text NOT NULL,
    "courseId" text NOT NULL,
    "teacherId" text NOT NULL,
    "startsAt" timestamp(3) with time zone NOT NULL,
    "endsAt" timestamp(3) with time zone NOT NULL,
    status public."SessionStatus" DEFAULT 'SCHEDULED'::public."SessionStatus" NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT "ClassSession_time_check" CHECK (("endsAt" > "startsAt")),
    CONSTRAINT session_positive_duration CHECK (("endsAt" > "startsAt"))
);


--
-- Name: CommunicationLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommunicationLog" (
    id text NOT NULL,
    "studentId" text NOT NULL,
    "taskId" text,
    "participantId" text,
    "guardianNameSnapshot" text NOT NULL,
    "relationshipSnapshot" text,
    channel text NOT NULL,
    "noteHtml" text,
    "noteText" text,
    "purchaseIntentRating" numeric,
    "occurredAt" timestamp(3) with time zone NOT NULL,
    "createdBy" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "notPurchasedReasons" text[] DEFAULT ARRAY[]::text[] NOT NULL
);


--
-- Name: Course; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Course" (
    id text NOT NULL,
    name text NOT NULL
);


--
-- Name: EntitlementEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EntitlementEntry" (
    id text NOT NULL,
    "studentId" text NOT NULL,
    bucket public."EntitlementBucket" NOT NULL,
    kind public."EntitlementKind" NOT NULL,
    quantity integer NOT NULL,
    "participantId" text,
    "actorId" text,
    note text,
    "sourceKey" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "packageId" text,
    "packageSnapshot" jsonb,
    CONSTRAINT "EntitlementEntry_actor_check" CHECK ((("actorId" IS NOT NULL) OR (kind = 'MIGRATION'::public."EntitlementKind"))),
    CONSTRAINT "EntitlementEntry_package_check" CHECK (((("packageId" IS NULL) AND ("packageSnapshot" IS NULL)) OR (("packageId" IS NOT NULL) AND ("packageSnapshot" IS NOT NULL) AND (jsonb_typeof("packageSnapshot") = 'object'::text) AND (kind = 'PURCHASE'::public."EntitlementKind") AND (bucket = 'REGULAR'::public."EntitlementBucket")))),
    CONSTRAINT "EntitlementEntry_participant_check" CHECK ((((kind = 'CONSUMPTION'::public."EntitlementKind") AND ("participantId" IS NOT NULL)) OR ((kind <> 'CONSUMPTION'::public."EntitlementKind") AND ("participantId" IS NULL)))),
    CONSTRAINT "EntitlementEntry_quantity_kind_check" CHECK ((((kind = 'INITIAL_TRIAL'::public."EntitlementKind") AND (bucket = 'TRIAL'::public."EntitlementBucket") AND (quantity = 1)) OR ((kind = 'TRIAL_GRANT'::public."EntitlementKind") AND (bucket = 'TRIAL'::public."EntitlementBucket") AND ((quantity >= 1) AND (quantity <= 10000))) OR ((kind = 'PURCHASE'::public."EntitlementKind") AND (bucket = 'REGULAR'::public."EntitlementBucket") AND ((quantity >= 1) AND (quantity <= 10000))) OR ((kind = 'CONSUMPTION'::public."EntitlementKind") AND (quantity = '-1'::integer)) OR ((kind = 'MIGRATION'::public."EntitlementKind") AND ((quantity > 0) OR ((quantity = 0) AND (bucket = 'REGULAR'::public."EntitlementBucket"))))))
);


--
-- Name: LessonPackage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LessonPackage" (
    id text NOT NULL,
    name text NOT NULL,
    quantity integer NOT NULL,
    "priceAudCents" integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    CONSTRAINT "LessonPackage_values_check" CHECK ((((quantity >= 1) AND (quantity <= 10000)) AND ("priceAudCents" > 0) AND (version >= 1)))
);


--
-- Name: MutationReceipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MutationReceipt" (
    id text NOT NULL,
    "userId" text NOT NULL,
    operation text NOT NULL,
    key text NOT NULL,
    "requestHash" text NOT NULL,
    response jsonb NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ScheduleChange; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScheduleChange" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "studentId" text,
    "participantId" text,
    "actorId" text NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    before jsonb NOT NULL,
    after jsonb NOT NULL,
    "requestKey" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SessionParticipant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionParticipant" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "studentId" text NOT NULL,
    kind public."ParticipantKind" DEFAULT 'REGULAR'::public."ParticipantKind" NOT NULL,
    attendance public."Attendance" DEFAULT 'PENDING'::public."Attendance" NOT NULL,
    "bookingStatus" public."BookingStatus" DEFAULT 'BOOKED'::public."BookingStatus" NOT NULL,
    "categorySnapshot" text,
    "classroomPerformanceRating" numeric,
    "overallAbilityRating" numeric,
    "teacherNoteHtml" text,
    "teacherNoteText" text,
    version integer DEFAULT 1 NOT NULL,
    "membershipCategorySnapshot" public."MembershipCategory",
    "checkedInAt" timestamp(3) with time zone,
    "checkedInBy" text,
    "feedbackSubmittedAt" timestamp(3) with time zone,
    CONSTRAINT "SessionParticipant_checkin_check" CHECK (((("checkedInAt" IS NULL) AND ("checkedInBy" IS NULL)) OR (("checkedInAt" IS NOT NULL) AND ("checkedInBy" IS NOT NULL) AND (attendance = 'ATTENDED'::public."Attendance")))),
    CONSTRAINT "SessionParticipant_feedback_attendance_check" CHECK ((("feedbackSubmittedAt" IS NULL) OR (attendance = 'ATTENDED'::public."Attendance")))
);


--
-- Name: Student; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Student" (
    id text NOT NULL,
    name text NOT NULL,
    "yearLevel" text NOT NULL,
    "ownerAdminId" text NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "guardianEmail" text,
    "guardianName" text,
    "guardianPhone" text,
    "guardianRelationship" text,
    "guardianWechat" text,
    "interestedSubjects" text,
    "learningGoals" text,
    "backgroundHtml" text,
    "backgroundText" text,
    "adminNotesHtml" text,
    "adminNotesText" text,
    "preferredChannel" text,
    "preferredLanguage" text DEFAULT 'en-AU'::text NOT NULL,
    "preferredTimes" text,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "firstPurchasedAt" timestamp(3) with time zone,
    "guardianOccupation" text,
    "guardianAge" integer,
    "guardianGender" text,
    gender text,
    age integer,
    type public."StudentType" DEFAULT 'TRIAL'::public."StudentType" NOT NULL,
    CONSTRAINT "Student_age_check" CHECK (((age >= 0) AND (age <= 120))),
    CONSTRAINT "Student_gender_check" CHECK ((gender = ANY (ARRAY[''::text, 'FEMALE'::text, 'MALE'::text, 'NON_BINARY'::text, 'PREFER_NOT_TO_SAY'::text]))),
    CONSTRAINT "Student_guardianAge_check" CHECK ((("guardianAge" >= 0) AND ("guardianAge" <= 120))),
    CONSTRAINT "Student_guardianGender_check" CHECK (("guardianGender" = ANY (ARRAY[''::text, 'FEMALE'::text, 'MALE'::text, 'NON_BINARY'::text, 'PREFER_NOT_TO_SAY'::text]))),
    CONSTRAINT "Student_type_purchase_check" CHECK ((((type = 'TRIAL'::public."StudentType") AND ("firstPurchasedAt" IS NULL)) OR ((type = 'MEMBER'::public."StudentType") AND ("firstPurchasedAt" IS NOT NULL))))
);


--
-- Name: StudentAdminLink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StudentAdminLink" (
    "studentId" text NOT NULL,
    "adminId" text NOT NULL,
    "createdByAdminId" text,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Task" (
    id text NOT NULL,
    type public."TaskType" NOT NULL,
    "assigneeId" text NOT NULL,
    "sessionId" text NOT NULL,
    "participantId" text,
    status public."TaskStatus" DEFAULT 'OPEN'::public."TaskStatus" NOT NULL,
    reason text,
    "sourceSnapshot" jsonb,
    "availableAt" timestamp(3) with time zone NOT NULL,
    "dueAt" timestamp(3) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "completedAt" timestamp(3) with time zone,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    purpose public."TaskPurpose",
    "resolvedByEntitlementEntryId" text,
    "followupOutcome" public."FollowupOutcome",
    CONSTRAINT "Task_followup_outcome_check" CHECK ((("followupOutcome" IS NULL) OR ((type = 'TRIAL_FOLLOWUP'::public."TaskType") AND (status = 'DONE'::public."TaskStatus") AND ("completedAt" IS NOT NULL) AND (("followupOutcome" <> 'PURCHASE_RECORDED'::public."FollowupOutcome") OR ("resolvedByEntitlementEntryId" IS NOT NULL))))),
    CONSTRAINT "Task_purpose_type_check" CHECK (
      (type='TRIAL_FOLLOWUP' AND purpose IS NOT NULL AND purpose='FIRST_PURCHASE')
      OR (type='TRIAL_FEEDBACK' AND purpose IS NULL AND "resolvedByEntitlementEntryId" IS NULL)
      OR (type='STUDENT_AI_REPORT' AND purpose IS NOT NULL AND purpose='POST_TRIAL_REVIEW' AND "resolvedByEntitlementEntryId" IS NULL)),
    CONSTRAINT "Task_source_type_check" CHECK (("participantId" IS NOT NULL))
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role public."Role" NOT NULL,
    "passwordHash" text NOT NULL,
    status public."AccountStatus" DEFAULT 'ACTIVE'::public."AccountStatus" NOT NULL,
    "isSuperAdmin" boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "disabledAt" timestamp(3) with time zone,
    CONSTRAINT "User_disabled_time" CHECK (((status = 'DISABLED'::public."AccountStatus") = ("disabledAt" IS NOT NULL))),
    CONSTRAINT "User_positive_version" CHECK ((version > 0)),
    CONSTRAINT "User_super_admin" CHECK (((NOT "isSuperAdmin") OR (role = 'ADMIN'::public."Role")))
);


--
-- Name: AccountAudit AccountAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountAudit"
    ADD CONSTRAINT "AccountAudit_pkey" PRIMARY KEY (id);


--
-- Name: AuthSession AuthSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuthSession"
    ADD CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("tokenHash");


--
-- Name: ClassGroup ClassGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassGroup"
    ADD CONSTRAINT "ClassGroup_pkey" PRIMARY KEY (id);


--
-- Name: ClassSession ClassSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassSession"
    ADD CONSTRAINT "ClassSession_pkey" PRIMARY KEY (id);


--
-- Name: CommunicationLog CommunicationLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationLog"
    ADD CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY (id);


--
-- Name: Course Course_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Course"
    ADD CONSTRAINT "Course_pkey" PRIMARY KEY (id);


--
-- Name: EntitlementEntry EntitlementEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EntitlementEntry"
    ADD CONSTRAINT "EntitlementEntry_pkey" PRIMARY KEY (id);


--
-- Name: LessonPackage LessonPackage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LessonPackage"
    ADD CONSTRAINT "LessonPackage_pkey" PRIMARY KEY (id);


--
-- Name: MutationReceipt MutationReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MutationReceipt"
    ADD CONSTRAINT "MutationReceipt_pkey" PRIMARY KEY (id);


--
-- Name: ScheduleChange ScheduleChange_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleChange"
    ADD CONSTRAINT "ScheduleChange_pkey" PRIMARY KEY (id);


--
-- Name: SessionParticipant SessionParticipant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionParticipant"
    ADD CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY (id);


--
-- Name: StudentAdminLink StudentAdminLink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentAdminLink"
    ADD CONSTRAINT "StudentAdminLink_pkey" PRIMARY KEY ("studentId");


--
-- Name: StudentAdminLink StudentAdminLink_student_owner_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentAdminLink"
    ADD CONSTRAINT "StudentAdminLink_student_owner_key" UNIQUE ("studentId", "adminId");


--
-- Name: Student Student_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Student"
    ADD CONSTRAINT "Student_pkey" PRIMARY KEY (id);


--
-- Name: Task Task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: AccountAudit_targetUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AccountAudit_targetUserId_createdAt_idx" ON public."AccountAudit" USING btree ("targetUserId", "createdAt");


--
-- Name: AuthSession_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuthSession_expiresAt_idx" ON public."AuthSession" USING btree ("expiresAt");


--
-- Name: ClassSession_classGroupId_startsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassSession_classGroupId_startsAt_idx" ON public."ClassSession" USING btree ("classGroupId", "startsAt");


--
-- Name: ClassSession_startsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassSession_startsAt_idx" ON public."ClassSession" USING btree ("startsAt");


--
-- Name: ClassSession_teacherId_startsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ClassSession_teacherId_startsAt_idx" ON public."ClassSession" USING btree ("teacherId", "startsAt");


--
-- Name: CommunicationLog_studentId_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommunicationLog_studentId_occurredAt_idx" ON public."CommunicationLog" USING btree ("studentId", "occurredAt");


--
-- Name: Course_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Course_name_key" ON public."Course" USING btree (name);


--
-- Name: EntitlementEntry_initial_trial_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EntitlementEntry_initial_trial_unique" ON public."EntitlementEntry" USING btree ("studentId") WHERE (kind = 'INITIAL_TRIAL'::public."EntitlementKind");


--
-- Name: EntitlementEntry_participantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EntitlementEntry_participantId_key" ON public."EntitlementEntry" USING btree ("participantId");


--
-- Name: EntitlementEntry_sourceKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EntitlementEntry_sourceKey_key" ON public."EntitlementEntry" USING btree ("sourceKey");


--
-- Name: EntitlementEntry_studentId_bucket_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EntitlementEntry_studentId_bucket_createdAt_id_idx" ON public."EntitlementEntry" USING btree ("studentId", bucket, "createdAt", id);


--
-- Name: LessonPackage_active_name_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LessonPackage_active_name_id_idx" ON public."LessonPackage" USING btree (active, name, id);


--
-- Name: MutationReceipt_userId_operation_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MutationReceipt_userId_operation_key_key" ON public."MutationReceipt" USING btree ("userId", operation, key);


--
-- Name: ScheduleChange_sessionId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScheduleChange_sessionId_createdAt_idx" ON public."ScheduleChange" USING btree ("sessionId", "createdAt");


--
-- Name: SessionParticipant_sessionId_studentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionParticipant_sessionId_studentId_key" ON public."SessionParticipant" USING btree ("sessionId", "studentId");


--
-- Name: StudentAdminLink_adminId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StudentAdminLink_adminId_idx" ON public."StudentAdminLink" USING btree ("adminId");


--
-- Name: StudentAdminLink_createdByAdminId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StudentAdminLink_createdByAdminId_idx" ON public."StudentAdminLink" USING btree ("createdByAdminId");


--
-- Name: Student_ownerAdminId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Student_ownerAdminId_idx" ON public."Student" USING btree ("ownerAdminId");


--
-- Name: Task_assigneeId_status_availableAt_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_assigneeId_status_availableAt_dueAt_idx" ON public."Task" USING btree ("assigneeId", status, "availableAt", "dueAt");


--
-- Name: Task_feedback_participant_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Task_feedback_participant_unique" ON public."Task" USING btree ("participantId") WHERE (type = 'TRIAL_FEEDBACK'::public."TaskType");


--
-- Name: Task_trial_participant_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Task_trial_participant_unique" ON public."Task" USING btree ("participantId") WHERE (type = 'TRIAL_FOLLOWUP'::public."TaskType");


--
-- Name: User_email_casefold_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_casefold_key" ON public."User" USING btree (lower(email));


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: StudentAdminLink StudentAdminLink_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "StudentAdminLink_guard" BEFORE INSERT OR UPDATE ON public."StudentAdminLink" FOR EACH ROW EXECUTE FUNCTION public.guard_student_admin_link();


--
-- Name: Student Student_sync_admin_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Student_sync_admin_link" AFTER INSERT OR UPDATE OF "ownerAdminId" ON public."Student" FOR EACH ROW EXECUTE FUNCTION public.sync_student_admin_link();


--
-- Name: AccountAudit AccountAudit_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountAudit"
    ADD CONSTRAINT "AccountAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: AccountAudit AccountAudit_targetUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountAudit"
    ADD CONSTRAINT "AccountAudit_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public."User"(id) ON DELETE RESTRICT;


--
-- Name: AuthSession AuthSession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuthSession"
    ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ClassSession ClassSession_classGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassSession"
    ADD CONSTRAINT "ClassSession_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES public."ClassGroup"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ClassSession ClassSession_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassSession"
    ADD CONSTRAINT "ClassSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public."Course"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ClassSession ClassSession_teacherId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClassSession"
    ADD CONSTRAINT "ClassSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommunicationLog CommunicationLog_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationLog"
    ADD CONSTRAINT "CommunicationLog_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommunicationLog CommunicationLog_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationLog"
    ADD CONSTRAINT "CommunicationLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES public."SessionParticipant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CommunicationLog CommunicationLog_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationLog"
    ADD CONSTRAINT "CommunicationLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."Student"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CommunicationLog CommunicationLog_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationLog"
    ADD CONSTRAINT "CommunicationLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EntitlementEntry EntitlementEntry_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EntitlementEntry"
    ADD CONSTRAINT "EntitlementEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EntitlementEntry EntitlementEntry_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EntitlementEntry"
    ADD CONSTRAINT "EntitlementEntry_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES public."LessonPackage"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EntitlementEntry EntitlementEntry_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EntitlementEntry"
    ADD CONSTRAINT "EntitlementEntry_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES public."SessionParticipant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EntitlementEntry EntitlementEntry_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EntitlementEntry"
    ADD CONSTRAINT "EntitlementEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."Student"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MutationReceipt MutationReceipt_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MutationReceipt"
    ADD CONSTRAINT "MutationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ScheduleChange ScheduleChange_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleChange"
    ADD CONSTRAINT "ScheduleChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ScheduleChange ScheduleChange_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleChange"
    ADD CONSTRAINT "ScheduleChange_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES public."SessionParticipant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ScheduleChange ScheduleChange_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleChange"
    ADD CONSTRAINT "ScheduleChange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."ClassSession"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ScheduleChange ScheduleChange_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleChange"
    ADD CONSTRAINT "ScheduleChange_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."Student"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SessionParticipant SessionParticipant_checkedInBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionParticipant"
    ADD CONSTRAINT "SessionParticipant_checkedInBy_fkey" FOREIGN KEY ("checkedInBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SessionParticipant SessionParticipant_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionParticipant"
    ADD CONSTRAINT "SessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."ClassSession"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SessionParticipant SessionParticipant_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionParticipant"
    ADD CONSTRAINT "SessionParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."Student"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StudentAdminLink StudentAdminLink_adminId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentAdminLink"
    ADD CONSTRAINT "StudentAdminLink_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StudentAdminLink StudentAdminLink_createdByAdminId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentAdminLink"
    ADD CONSTRAINT "StudentAdminLink_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StudentAdminLink StudentAdminLink_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentAdminLink"
    ADD CONSTRAINT "StudentAdminLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."Student"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Student Student_admin_link_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Student"
    ADD CONSTRAINT "Student_admin_link_fkey" FOREIGN KEY (id, "ownerAdminId") REFERENCES public."StudentAdminLink"("studentId", "adminId") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: Student Student_ownerAdminId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Student"
    ADD CONSTRAINT "Student_ownerAdminId_fkey" FOREIGN KEY ("ownerAdminId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Task Task_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Task Task_participantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES public."SessionParticipant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Task Task_resolvedByEntitlementEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_resolvedByEntitlementEntryId_fkey" FOREIGN KEY ("resolvedByEntitlementEntryId") REFERENCES public."EntitlementEntry"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Task Task_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."ClassSession"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--


-- AI workflow: exact numeric without scale coercion, so 3.49 is rejected, never rounded to 3.5.
CREATE TYPE public."ReportGenerationStatus" AS ENUM ('NOT_STARTED','READY','FAILED');
CREATE TABLE public."StudentAiReport" (
 id text PRIMARY KEY,
 "taskId" text NOT NULL UNIQUE REFERENCES public."Task"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "studentId" text NOT NULL REFERENCES public."Student"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceFollowupTaskId" text NOT NULL UNIQUE REFERENCES public."Task"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "generationStatus" public."ReportGenerationStatus" NOT NULL DEFAULT 'NOT_STARTED',
 "schemaVersion" integer NOT NULL DEFAULT 1 CHECK ("schemaVersion"=1),
 content jsonb,
 "evidenceSnapshot" jsonb,
 "inputFingerprint" text,
 source text CHECK (source IN ('llm','fixture')),
 provider text,
 model text,
 "generatedAt" timestamptz(3),
 "lastErrorCode" text,
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("taskId"<>"sourceFollowupTaskId"),
 CHECK (
  ("generationStatus"='READY' AND content IS NOT NULL AND jsonb_typeof(content)='object'
    AND "evidenceSnapshot" IS NOT NULL AND jsonb_typeof("evidenceSnapshot")='array'
    AND "generatedAt" IS NOT NULL AND "inputFingerprint" IS NOT NULL AND source IS NOT NULL AND "lastErrorCode" IS NULL)
  OR ("generationStatus"='NOT_STARTED' AND content IS NULL AND "generatedAt" IS NULL AND "lastErrorCode" IS NULL)
  OR ("generationStatus"='FAILED' AND content IS NULL AND "generatedAt" IS NULL AND "lastErrorCode" IS NOT NULL)
 )
);
CREATE INDEX "StudentAiReport_studentId_createdAt_idx" ON public."StudentAiReport"("studentId","createdAt");

ALTER TABLE public."SessionParticipant"
 ADD CONSTRAINT "evaluation_ratings" CHECK (
   ("feedbackSubmittedAt" IS NULL AND "classroomPerformanceRating" IS NULL AND "overallAbilityRating" IS NULL)
   OR ("feedbackSubmittedAt" IS NOT NULL AND "checkedInAt" IS NOT NULL
     AND "classroomPerformanceRating" IS NOT NULL AND "overallAbilityRating" IS NOT NULL
     AND "classroomPerformanceRating" BETWEEN 1 AND 5
     AND "overallAbilityRating" BETWEEN 1 AND 5
     AND mod("classroomPerformanceRating"*2,1)=0 AND mod("overallAbilityRating"*2,1)=0)),
 ADD CONSTRAINT "teacher_note_pair" CHECK (("teacherNoteHtml" IS NULL)=("teacherNoteText" IS NULL) AND length("teacherNoteText")<=2000);
ALTER TABLE public."Student"
 ADD CONSTRAINT "background_pair" CHECK (("backgroundHtml" IS NULL)=("backgroundText" IS NULL) AND length("backgroundText")<=5000),
 ADD CONSTRAINT "admin_notes_pair" CHECK (("adminNotesHtml" IS NULL)=("adminNotesText" IS NULL) AND length("adminNotesText")<=5000);
ALTER TABLE public."CommunicationLog"
 ADD CONSTRAINT "intent_rating" CHECK ("purchaseIntentRating" BETWEEN 1 AND 5 AND mod("purchaseIntentRating"*2,1)=0),
 ADD CONSTRAINT "communication_note_pair" CHECK (("noteHtml" IS NULL)=("noteText" IS NULL) AND length("noteText")<=2000),
 ADD CONSTRAINT "reason_values" CHECK ("notPurchasedReasons" <@ ARRAY['PRICE','TIME','COURSE_FIT','TEACHING_FIT','CHILD_INTEREST','FAMILY_PLAN','COMPARING','UNREACHABLE','OTHER']::text[]
   AND array_position("notPurchasedReasons",NULL) IS NULL),
 ADD CONSTRAINT "unreachable_unknown" CHECK (NOT ('UNREACHABLE'=ANY("notPurchasedReasons")) OR ("purchaseIntentRating" IS NULL AND cardinality("notPurchasedReasons")=1));
CREATE UNIQUE INDEX "CommunicationLog_taskId_unique" ON public."CommunicationLog"("taskId");
ALTER TABLE public."Task"
 ADD CONSTRAINT "task_completion_time" CHECK ((status='DONE')=("completedAt" IS NOT NULL)),
 ADD CONSTRAINT "followup_completed_result" CHECK (type<>'TRIAL_FOLLOWUP' OR status<>'DONE' OR "followupOutcome" IS NOT NULL),
 ADD CONSTRAINT "purchase_reference_only" CHECK ("resolvedByEntitlementEntryId" IS NULL OR (type='TRIAL_FOLLOWUP' AND "followupOutcome" IS NOT NULL AND "followupOutcome"='PURCHASE_RECORDED'));

-- Deferred checks allow all rows of a workflow transaction to be written in any order.
CREATE FUNCTION public.check_ai_workflow() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM "Task" t JOIN "SessionParticipant" p ON p.id=t."participantId"
  JOIN "User" u ON u.id=t."assigneeId"
  WHERE t."sessionId"<>p."sessionId"
   OR (t.type='TRIAL_FEEDBACK' AND u.role<>'TEACHER')
   OR (t.type IN ('TRIAL_FOLLOWUP','STUDENT_AI_REPORT') AND u.role<>'ADMIN')
 ) THEN RAISE EXCEPTION 'Task source or assignee role mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS (
  SELECT 1 FROM "CommunicationLog" c JOIN "Task" t ON t.id=c."taskId"
  JOIN "SessionParticipant" p ON p.id=t."participantId"
  WHERE t.type<>'TRIAL_FOLLOWUP' OR t.status<>'DONE' OR c."studentId"<>p."studentId"
   OR c."participantId" IS DISTINCT FROM p.id
   OR (t."followupOutcome"='NOT_PURCHASED' AND
      (cardinality(c."notPurchasedReasons")=0 OR c."noteText" IS NULL OR length(btrim(c."noteText"))=0
       OR (NOT ('UNREACHABLE'=ANY(c."notPurchasedReasons")) AND c."purchaseIntentRating" IS NULL)))
   OR (t."followupOutcome"='PURCHASE_RECORDED' AND (c."purchaseIntentRating" IS NOT NULL OR cardinality(c."notPurchasedReasons")<>0))
 ) THEN RAISE EXCEPTION 'Invalid follow-up content' USING ERRCODE='23514'; END IF;
 IF EXISTS (
  SELECT 1 FROM "Task" t JOIN "SessionParticipant" p ON p.id=t."participantId"
  LEFT JOIN "EntitlementEntry" e ON e.id=t."resolvedByEntitlementEntryId"
  WHERE t.type='TRIAL_FOLLOWUP' AND t.status='DONE' AND
   (NOT EXISTS(SELECT 1 FROM "CommunicationLog" c WHERE c."taskId"=t.id)
    OR (t."followupOutcome"='PURCHASE_RECORDED' AND (e.id IS NULL OR e."studentId"<>p."studentId" OR e.kind<>'PURCHASE' OR e.bucket<>'REGULAR'))
    OR (t."followupOutcome"='NOT_PURCHASED' AND NOT EXISTS(SELECT 1 FROM "StudentAiReport" r WHERE r."sourceFollowupTaskId"=t.id)))
 ) THEN RAISE EXCEPTION 'Completed follow-up requires communication and purchase/report reference' USING ERRCODE='23514'; END IF;
 IF EXISTS (
  SELECT 1 FROM "StudentAiReport" r JOIN "Task" t ON t.id=r."taskId"
  JOIN "Task" f ON f.id=r."sourceFollowupTaskId" JOIN "SessionParticipant" p ON p.id=t."participantId"
  WHERE t.type<>'STUDENT_AI_REPORT' OR f.type<>'TRIAL_FOLLOWUP' OR f.status<>'DONE'
   OR f."followupOutcome" IS DISTINCT FROM 'NOT_PURCHASED'::"FollowupOutcome"
   OR t."participantId" IS DISTINCT FROM f."participantId" OR r."studentId"<>p."studentId"
   OR (t.status='DONE' AND r."generationStatus"<>'READY')
 ) OR EXISTS (SELECT 1 FROM "Task" t WHERE t.type='STUDENT_AI_REPORT'
   AND NOT EXISTS(SELECT 1 FROM "StudentAiReport" r WHERE r."taskId"=t.id))
 THEN RAISE EXCEPTION 'Invalid AI report source or completion' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Task_ai_integrity" AFTER INSERT OR UPDATE OR DELETE ON public."Task"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_ai_workflow();
CREATE CONSTRAINT TRIGGER "Communication_ai_integrity" AFTER INSERT OR UPDATE OR DELETE ON public."CommunicationLog"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_ai_workflow();
CREATE CONSTRAINT TRIGGER "Report_ai_integrity" AFTER INSERT OR UPDATE OR DELETE ON public."StudentAiReport"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_ai_workflow();

COMMIT;
-- Restore normal resolution for clients that load schema and seed on one connection.
SET search_path = public;
