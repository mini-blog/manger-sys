-- Read-only fixture assertions and rolled-back negative constraint checks.
BEGIN;
DO $$
BEGIN
 IF (SELECT count(*) FROM "Student")<>19 OR (SELECT count(*) FROM "User")<>26
  OR (SELECT count(*) FROM "StudentAiReport")<>3 THEN
  RAISE EXCEPTION 'Unexpected fixture counts'; END IF;
 IF EXISTS(SELECT 1 FROM "Student" s LEFT JOIN "StudentAdminLink" l ON l."studentId"=s.id
   WHERE l."adminId" IS DISTINCT FROM s."ownerAdminId" OR l."createdByAdminId" IS NULL) THEN
  RAISE EXCEPTION 'Invalid owner links'; END IF;
 IF EXISTS(SELECT 1 FROM "SessionParticipant" p LEFT JOIN "EntitlementEntry" e ON e."participantId"=p.id
   WHERE (p."checkedInAt" IS NOT NULL) IS DISTINCT FROM (e.id IS NOT NULL)
     OR (e.id IS NOT NULL AND (e.quantity<>-1 OR e."studentId"<>p."studentId"))) THEN
  RAISE EXCEPTION 'Invalid attendance consumption'; END IF;
 IF EXISTS(SELECT 1 FROM "EntitlementEntry" GROUP BY "studentId",bucket HAVING sum(quantity)<0) THEN
  RAISE EXCEPTION 'Negative balance'; END IF;
 BEGIN
  UPDATE "SessionParticipant" SET "overallAbilityRating"=3.49 WHERE id='ai-demo-v2-trial-01-booking';
  RAISE EXCEPTION 'Invalid fractional rating accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE "Task" SET status='DONE',"completedAt"=now() WHERE id='ai-demo-v2-trial-06-booking-report';
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'Unprepared report completion accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE "CommunicationLog" SET "purchaseIntentRating"=4 WHERE id='ai-demo-v2-trial-08-communication';
  RAISE EXCEPTION 'Invented unreachable intent accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE "Task" SET "resolvedByEntitlementEntryId"='ai-demo-v2-member-01-credit'
   WHERE id='ai-demo-v2-trial-09-booking-followup';
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'Another student purchase accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  DELETE FROM "StudentAiReport" WHERE id='ai-demo-v2-trial-06-report';
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'Missing report accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'AI seed counts, ownership, ledger and negative constraints passed';
END $$;
ROLLBACK;
