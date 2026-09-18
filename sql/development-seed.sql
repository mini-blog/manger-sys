-- StudentSys开发服务器：虚构演示数据，数据库镜像首次空卷启动时在建表后自动执行，也可手动导入。
-- PostgreSQL 17；先用当前db镜像初始化空库，再执行本文件。
-- 新建账号统一演示密码：StudentSysDemo2026!（下方为与应用一致的scrypt哈希）。
-- super@demo.studentsys.test；admin01..05@demo.studentsys.test；teacher01..20@demo.studentsys.test。
-- 如已有启用的超级管理员则复用，不改变其账号或密码，不再创建第二个super。
-- 一次事务完成，失败全部回滚；重复执行按完成标记跳过，不补余额、不重开待办。
-- AI v2：19学生、3课次、三种报告状态。READY为手写fixture，不代表真实LLM成功。
-- 日期按执行日的Australia/Melbourne日历计算。充值为课时登记，不代表核验到账。

BEGIN;
SELECT pg_advisory_xact_lock(73192461);

DO $seed$
DECLARE
  prefix constant text := 'ai-demo-v2-';
  password_hash constant text := '2b9909645d31745a6dbc6be1b112da80:6a49ac58420fcc69a03fbe4221e1fd1e9dad2d729f08650abbd71bef0c61f4cd9105d7baf2ad3338ff9475fd00944b54469581cee7cf4b2c3b74dd0cf7825078';
  local_day date := (now() AT TIME ZONE 'Australia/Melbourne')::date;
  super_id text;
  staff_id text;
  student_id text;
  owner_id text;
  session_id text;
  participant_id text;
  math_id text;
  english_id text;
  purchased_at timestamptz;
  starts_at timestamptz;
  feedback_at timestamptz;
  snapshot jsonb;
  i integer;
  lesson integer;
  student_names text[] := ARRAY['Ava Chen','Oliver Wilson','Mia Patel','Noah Wang','Isla Nguyen',
    'Leo Brown','Amelia Zhang','Ethan Liu','Grace Taylor','Lucas Lee',
    'Ruby Zhao','Henry Wu','Chloe Huang','Jack Lin','Zoe Walker'];
BEGIN
  IF EXISTS (SELECT 1 FROM "AccountAudit" WHERE id=prefix||'complete') THEN
    RAISE NOTICE 'This seed was already imported; existing accounts, credits and tasks are unchanged.';
    RETURN;
  END IF;
  -- Fail on namespace/email collisions instead of updating someone else's data.
  IF EXISTS (SELECT 1 FROM "User" WHERE id LIKE prefix||'%'
      OR email ~* '^(super|admin[0-9]{2}|teacher[0-9]{2})@demo\.studentsys\.test$')
      OR EXISTS (SELECT 1 FROM "Student" WHERE id LIKE prefix||'%') THEN
    RAISE EXCEPTION 'Demo namespace already exists without completion marker; inspect before importing.';
  END IF;
  SELECT id INTO super_id FROM "User" WHERE "isSuperAdmin" AND role='ADMIN' AND status='ACTIVE' LIMIT 1;
  IF super_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM "User" WHERE "isSuperAdmin") THEN
      RAISE EXCEPTION 'An inactive super administrator exists; restore that account first.';
    END IF;
    super_id := prefix||'super';
    INSERT INTO "User" (id,email,name,role,"passwordHash","isSuperAdmin")
    VALUES (super_id,'super@demo.studentsys.test','Demo Super Admin','ADMIN',password_hash,true);
    INSERT INTO "AccountAudit" (id,"targetUserId",action,reason,before,after,"requestKey")
    VALUES (prefix||'super-audit',super_id,'SYSTEM_BOOTSTRAP','Explicit development SQL seed',
      '{}','{"role":"ADMIN","isSuperAdmin":true}',gen_random_uuid()::text);
  END IF;

  FOR i IN 1..25 LOOP
    staff_id := prefix || CASE WHEN i<=5 THEN 'admin-'||lpad(i::text,2,'0')
      ELSE 'teacher-'||lpad((i-5)::text,2,'0') END;
    INSERT INTO "User" (id,email,name,role,"passwordHash") VALUES (
      staff_id,
      CASE WHEN i<=5 THEN 'admin'||lpad(i::text,2,'0') ELSE 'teacher'||lpad((i-5)::text,2,'0') END||'@demo.studentsys.test',
      CASE WHEN i<=5 THEN 'Demo Admin '||i ELSE 'Demo Teacher '||(i-5) END,
      CASE WHEN i<=5 THEN 'ADMIN'::"Role" ELSE 'TEACHER'::"Role" END,password_hash);
    INSERT INTO "AccountAudit" (id,"actorId","targetUserId",action,reason,before,after,"requestKey")
    VALUES (staff_id||'-audit',super_id,staff_id,'CREATE','Explicit development SQL seed','{}',
      jsonb_build_object('role',CASE WHEN i<=5 THEN 'ADMIN' ELSE 'TEACHER' END,'isSuperAdmin',false),gen_random_uuid()::text);
  END LOOP;

  -- 10会员（5位新会员、5位老会员）、5位试听，每位Admin负责3名学生。
  FOR i IN 1..15 LOOP
    student_id := prefix||CASE WHEN i<=10 THEN 'member-'||lpad(i::text,2,'0')
      ELSE 'trial-'||lpad((i-10)::text,2,'0') END;
    owner_id := prefix||'admin-'||lpad((((i-1)%5)+1)::text,2,'0');
    purchased_at := CASE WHEN i<=10 THEN
      ((local_day - CASE WHEN i<=5 THEN 3 ELSE 30 END) + time '10:00') AT TIME ZONE 'Australia/Melbourne'
      ELSE NULL END;
    INSERT INTO "Student" (id,name,"yearLevel",type,age,gender,"ownerAdminId","firstPurchasedAt",
      "guardianName","guardianRelationship","guardianEmail","preferredChannel","learningGoals","createdAt","updatedAt")
    VALUES (student_id,student_names[i],'Year '||(3+(i-1)%6),
      CASE WHEN i<=10 THEN 'MEMBER'::"StudentType" ELSE 'TRIAL'::"StudentType" END,
      8+(i-1)%6,CASE WHEN i%2=1 THEN 'FEMALE' ELSE 'MALE' END,owner_id,purchased_at,
      'Demo Guardian '||i,'Parent','guardian'||lpad(i::text,2,'0')||'@demo.studentsys.test',
      'EMAIL','Build confidence and practise explaining answers.',
      ((local_day-60)+time '09:00') AT TIME ZONE 'Australia/Melbourne',now());
    -- The DB trigger has already created the matching current-owner link.
    UPDATE "StudentAdminLink" SET "createdByAdminId"=owner_id WHERE "studentId"=student_id;
    INSERT INTO "EntitlementEntry" (id,"studentId",bucket,kind,quantity,"actorId",note,"sourceKey","createdAt")
    VALUES (student_id||'-credit',student_id,
      CASE WHEN i<=10 THEN 'REGULAR'::"EntitlementBucket" ELSE 'TRIAL'::"EntitlementBucket" END,
      CASE WHEN i<=10 THEN 'PURCHASE'::"EntitlementKind" ELSE 'TRIAL_GRANT'::"EntitlementKind" END,
      CASE WHEN i<=10 THEN 20 ELSE 3 END,owner_id,
      'Fictional development credit registration; no payment verification.',student_id||':credit',
      COALESCE(purchased_at,((local_day-7)+time '10:00') AT TIME ZONE 'Australia/Melbourne'));
  END LOOP;

  INSERT INTO "Course" (id,name) VALUES (prefix||'math','Mathematics'),(prefix||'english','English')
    ON CONFLICT (name) DO NOTHING;
  SELECT id INTO STRICT math_id FROM "Course" WHERE name='Mathematics';
  SELECT id INTO STRICT english_id FROM "Course" WHERE name='English';
  INSERT INTO "ClassGroup" (id,name,"targetLevel") VALUES
    (prefix||'group-1','Demo · Mathematics Practice','Mixed primary'),
    (prefix||'group-2','Demo · English Practice','Mixed primary');

  -- 昨日2节已结束课程、明日1节可继续预约/点名的课程，无老师/学生时间冲突。
  FOR lesson IN 1..3 LOOP
    session_id := prefix||'session-'||lesson;
    starts_at := ((local_day + CASE WHEN lesson=3 THEN 1 ELSE -1 END)
      + CASE WHEN lesson=1 THEN time '15:00' ELSE time '16:00' END) AT TIME ZONE 'Australia/Melbourne';
    INSERT INTO "ClassSession" (id,"classGroupId","courseId","teacherId","startsAt","endsAt")
    VALUES (session_id,prefix||'group-'||CASE WHEN lesson=2 THEN '2' ELSE '1' END,
      CASE WHEN lesson=2 THEN english_id ELSE math_id END,
      prefix||'teacher-'||lpad(lesson::text,2,'0'),starts_at,starts_at+interval '1 hour');
  END LOOP;

  -- 10会员都在昨日到课；试听01已评价待跟进，02已签到待评价，03未签到，04/05明日预约。
  FOR i IN 1..15 LOOP
    student_id := prefix||CASE WHEN i<=10 THEN 'member-'||lpad(i::text,2,'0')
      ELSE 'trial-'||lpad((i-10)::text,2,'0') END;
    lesson := CASE WHEN i<=5 OR i IN (11,12) THEN 1 WHEN i<=10 OR i=13 THEN 2 ELSE 3 END;
    session_id := prefix||'session-'||lesson;
    participant_id := student_id||'-booking';
    SELECT "startsAt" INTO STRICT starts_at FROM "ClassSession" WHERE id=session_id;
    INSERT INTO "SessionParticipant" (id,"sessionId","studentId",kind,attendance,"checkedInAt","checkedInBy",version)
    VALUES (participant_id,session_id,student_id,
      CASE WHEN i<=10 THEN 'REGULAR'::"ParticipantKind" ELSE 'TRIAL'::"ParticipantKind" END,
      CASE WHEN i<=12 THEN 'ATTENDED'::"Attendance" ELSE 'PENDING'::"Attendance" END,
      CASE WHEN i<=12 THEN starts_at+interval '5 minutes' END,
      CASE WHEN i<=12 THEN prefix||'teacher-'||lpad(lesson::text,2,'0') END,
      CASE WHEN i<=12 THEN 2 ELSE 1 END);
    IF i<=12 THEN
      INSERT INTO "EntitlementEntry" (id,"studentId",bucket,kind,quantity,"participantId","actorId",note,"sourceKey","createdAt")
      VALUES (participant_id||'-consume',student_id,
        CASE WHEN i<=10 THEN 'REGULAR'::"EntitlementBucket" ELSE 'TRIAL'::"EntitlementBucket" END,
        'CONSUMPTION',-1,participant_id,prefix||'teacher-'||lpad(lesson::text,2,'0'),
        'Fictional attended lesson; exactly one credit consumed.',participant_id||':check-in',starts_at+interval '5 minutes');
    END IF;
    IF i>10 THEN
      INSERT INTO "Task" (id,type,"assigneeId","sessionId","participantId","availableAt","dueAt","createdAt","updatedAt")
      VALUES (participant_id||'-evaluation','TRIAL_FEEDBACK',prefix||'teacher-'||lpad(lesson::text,2,'0'),
        session_id,participant_id,starts_at+interval '1 hour',
        ((((starts_at+interval '1 hour') AT TIME ZONE 'Australia/Melbourne')::date+1)+time '17:00') AT TIME ZONE 'Australia/Melbourne',
        ((local_day-2)+time '09:00') AT TIME ZONE 'Australia/Melbourne',now());
    END IF;
    INSERT INTO "ScheduleChange" (id,"sessionId","studentId","participantId","actorId",action,reason,before,after,"requestKey")
    SELECT participant_id||'-audit',session_id,student_id,participant_id,"ownerAdminId",'DEMO_IMPORT',
      'Explicit fictional development fixture','{}',jsonb_build_object('participantId',participant_id),gen_random_uuid()::text
      FROM "Student" WHERE id=student_id;
  END LOOP;

  participant_id := prefix||'trial-01-booking';
  SELECT s."endsAt"+interval '10 minutes' INTO STRICT feedback_at
    FROM "ClassSession" s JOIN "SessionParticipant" p ON p."sessionId"=s.id WHERE p.id=participant_id;
  UPDATE "SessionParticipant" SET "classroomPerformanceRating"=4.5,
    "overallAbilityRating"=3.5,"teacherNoteHtml"='<p>Practise equivalent fractions; enjoys visual examples.</p>',"teacherNoteText"='Practise equivalent fractions; enjoys visual examples.',
    "feedbackSubmittedAt"=feedback_at,"categorySnapshot"='TRIAL',"membershipCategorySnapshot"='TRIAL_STUDENT',version=3
    WHERE id=participant_id;
  SELECT jsonb_build_object('participantId',p.id,'participantVersion',p.version,'sessionId',s.id,
    'studentId',st.id,'studentName',st.name,'className',g.name,'courseId',c.id,'courseName',c.name,
    'teacherId',u.id,'teacherName',u.name,'startsAt',s."startsAt",'endsAt',s."endsAt",'checkedInAt',p."checkedInAt",
    'classroomPerformanceRating',p."classroomPerformanceRating",'overallAbilityRating',p."overallAbilityRating",'teacherNoteHtml',p."teacherNoteHtml",
    'feedbackSubmittedAt',p."feedbackSubmittedAt",'membershipCategory','TRIAL_STUDENT') INTO STRICT snapshot
    FROM "SessionParticipant" p JOIN "Student" st ON st.id=p."studentId"
    JOIN "ClassSession" s ON s.id=p."sessionId" JOIN "ClassGroup" g ON g.id=s."classGroupId"
    JOIN "Course" c ON c.id=s."courseId" JOIN "User" u ON u.id=s."teacherId" WHERE p.id=participant_id;
  UPDATE "Task" SET status='DONE',"completedAt"=feedback_at,"sourceSnapshot"=snapshot,version=2,"updatedAt"=feedback_at
    WHERE id=participant_id||'-evaluation';
  INSERT INTO "Task" (id,type,"assigneeId","sessionId","participantId",purpose,reason,"sourceSnapshot","availableAt","dueAt","createdAt","updatedAt")
  VALUES (participant_id||'-followup','TRIAL_FOLLOWUP',prefix||'admin-01',prefix||'session-1',participant_id,
    'FIRST_PURCHASE','TRIAL_COMPLETED',snapshot,feedback_at,
    (((feedback_at AT TIME ZONE 'Australia/Melbourne')::date+1)+time '17:00') AT TIME ZONE 'Australia/Melbourne',feedback_at,feedback_at);


  -- Additional complete branches: report pending / ready fixture / failed / purchased.
  FOR i IN 6..9 LOOP
    student_id := prefix||'trial-'||lpad(i::text,2,'0');
    owner_id := prefix||'admin-'||lpad((i-5)::text,2,'0');
    participant_id := student_id||'-booking';
    INSERT INTO "Student" (id,name,"yearLevel",type,age,gender,"ownerAdminId","guardianName","guardianRelationship","guardianEmail","updatedAt")
    VALUES (student_id,'AI Scenario '||i,'Year 5','TRIAL',10,'PREFER_NOT_TO_SAY',owner_id,
      'Scenario Guardian '||i,'Parent','scenario'||i||'@demo.studentsys.test',now());
    UPDATE "StudentAdminLink" SET "createdByAdminId"=owner_id WHERE "studentId"=student_id;
    INSERT INTO "EntitlementEntry" (id,"studentId",bucket,kind,quantity,"actorId","sourceKey")
    VALUES (student_id||'-gift',student_id,'TRIAL','INITIAL_TRIAL',1,owner_id,student_id||':gift');
    SELECT "startsAt" INTO starts_at FROM "ClassSession" WHERE id=prefix||'session-1';
    INSERT INTO "SessionParticipant" (id,"sessionId","studentId",kind,attendance,"checkedInAt","checkedInBy",
       "feedbackSubmittedAt","classroomPerformanceRating","overallAbilityRating","teacherNoteHtml","teacherNoteText")
    VALUES (participant_id,prefix||'session-1',student_id,'TRIAL','ATTENDED',starts_at,prefix||'teacher-01',
      starts_at+interval '70 minutes',4.5,3.5,'<p>Participates well; practise fractions.</p>','Participates well; practise fractions.');
    INSERT INTO "EntitlementEntry" (id,"studentId",bucket,kind,quantity,"participantId","actorId","sourceKey")
    VALUES (student_id||'-consume',student_id,'TRIAL','CONSUMPTION',-1,participant_id,prefix||'teacher-01',student_id||':consume');
    INSERT INTO "Task" (id,type,"assigneeId","sessionId","participantId",status,"completedAt","availableAt","dueAt","updatedAt")
    VALUES (participant_id||'-evaluation','TRIAL_FEEDBACK',prefix||'teacher-01',prefix||'session-1',participant_id,
      'DONE',starts_at+interval '70 minutes',starts_at+interval '1 hour',now(),now());
    IF i=9 THEN
      INSERT INTO "EntitlementEntry" (id,"studentId",bucket,kind,quantity,"actorId","sourceKey")
      VALUES (student_id||'-purchase',student_id,'REGULAR','PURCHASE',10,owner_id,student_id||':purchase');
      UPDATE "Student" SET type='MEMBER',"firstPurchasedAt"=now() WHERE id=student_id;
    END IF;
    INSERT INTO "Task" (id,type,"assigneeId","sessionId","participantId",purpose,status,"completedAt","followupOutcome",
       "resolvedByEntitlementEntryId","availableAt","dueAt","updatedAt")
    VALUES (participant_id||'-followup','TRIAL_FOLLOWUP',owner_id,prefix||'session-1',participant_id,'FIRST_PURCHASE',
       'DONE',now(),CASE WHEN i=9 THEN 'PURCHASE_RECORDED'::"FollowupOutcome" ELSE 'NOT_PURCHASED'::"FollowupOutcome" END,
       CASE WHEN i=9 THEN student_id||'-purchase' END,starts_at+interval '70 minutes',now(),now());
    INSERT INTO "CommunicationLog" (id,"studentId","taskId","participantId","guardianNameSnapshot",channel,
      "noteHtml","noteText","purchaseIntentRating","notPurchasedReasons","occurredAt","createdBy")
    VALUES (student_id||'-communication',student_id,participant_id||'-followup',participant_id,'Scenario Guardian '||i,'PHONE',
      CASE WHEN i=8 THEN '<p>Attempted call; no answer.</p>' ELSE '<p>Discussed lesson times and next steps.</p>' END,
      CASE WHEN i=8 THEN 'Attempted call; no answer.' ELSE 'Discussed lesson times and next steps.' END,
      CASE WHEN i IN (6,7) THEN 3.5 END,
      CASE WHEN i=9 THEN ARRAY[]::text[] WHEN i=8 THEN ARRAY['UNREACHABLE'] ELSE ARRAY['TIME'] END,now(),owner_id);
    IF i<>9 THEN
      INSERT INTO "Task" (id,type,"assigneeId","sessionId","participantId",purpose,"availableAt","dueAt","updatedAt")
      VALUES (participant_id||'-report','STUDENT_AI_REPORT',owner_id,prefix||'session-1',participant_id,'POST_TRIAL_REVIEW',
         now(),((local_day+1)+time '17:00') AT TIME ZONE 'Australia/Melbourne',now());
      INSERT INTO "StudentAiReport" (id,"taskId","studentId","sourceFollowupTaskId","generationStatus",
        content,"evidenceSnapshot","inputFingerprint",source,provider,model,"generatedAt","lastErrorCode")
      VALUES (student_id||'-report',participant_id||'-report',student_id,participant_id||'-followup',
        CASE WHEN i=6 THEN 'NOT_STARTED'::"ReportGenerationStatus" WHEN i=7 THEN 'READY'::"ReportGenerationStatus" ELSE 'FAILED'::"ReportGenerationStatus" END,
        CASE WHEN i=7 THEN jsonb_build_object(
         'overview','Fictional report fixture; not a real model result.',
         'learningProfile',jsonb_build_object('summary','Practising fractions.','strengths',jsonb_build_array('Participation'),'needsAttention',jsonb_build_array('Fractions')),
         'teacherEvaluation',jsonb_build_object('classroomPerformanceRating',4.5,'overallAbilityRating',3.5,'summary','Participates well.'),
         'followup',jsonb_build_object('purchaseIntentRating',3.5,'reasons',jsonb_build_array('TIME'),'summary','Discuss lesson times.'),
         'observations',jsonb_build_array(jsonb_build_object('text','Time is a stated concern.','sourceIds',jsonb_build_array('followup'))),
         'questionsToConfirm',jsonb_build_array('Which lesson times suit the family?'),
         'suggestedNextActions',jsonb_build_array('Confirm available times.')) END,
        CASE WHEN i=7 THEN jsonb_build_array(jsonb_build_object('id','followup','text','Reason: TIME. Intent rating: 3.5.')) END,
        CASE WHEN i=7 THEN 'fixture-v2' END,CASE WHEN i=7 THEN 'fixture' END,
        CASE WHEN i=7 THEN 'fixture' END,CASE WHEN i=7 THEN 'fixture' END,
        CASE WHEN i=7 THEN now() END,CASE WHEN i=8 THEN 'PROVIDER_TIMEOUT_FIXTURE' END);
    END IF;
  END LOOP;
  UPDATE "Student" SET
    "backgroundHtml"='<p>Enjoys visual examples and small-group learning.</p>',
    "backgroundText"='Enjoys visual examples and small-group learning.',
    "adminNotesHtml"='<p>Internal observation: confirm suitable lesson times.</p>',
    "adminNotesText"='Internal observation: confirm suitable lesson times.'
  WHERE id LIKE prefix||'%';

  UPDATE "Task" t SET "sourceSnapshot"=jsonb_build_object(
    'participantId',p.id,'studentId',p."studentId",'studentName',st.name,
    'sessionId',p."sessionId",'classroomPerformanceRating',p."classroomPerformanceRating",
    'overallAbilityRating',p."overallAbilityRating",'teacherNoteHtml',p."teacherNoteHtml",
    'feedbackSubmittedAt',p."feedbackSubmittedAt")
  FROM "SessionParticipant" p JOIN "Student" st ON st.id=p."studentId"
  WHERE t."participantId"=p.id AND p."feedbackSubmittedAt" IS NOT NULL
    AND t.id LIKE prefix||'%' AND t.type IN ('TRIAL_FEEDBACK','TRIAL_FOLLOWUP');

  -- This marker is written last in the same transaction; normal application edits are never reset.
  INSERT INTO "AccountAudit" (id,"actorId","targetUserId",action,reason,before,after,"requestKey")
  VALUES (prefix||'complete',super_id,super_id,'DEMO_SEED','Development seed v2 completed','{}',
    jsonb_build_object('admins',5,'teachers',20,'members',11,'trials',8,'regularCredits',10,'trialCredits',5,'sessions',3),gen_random_uuid()::text);
END
$seed$;
COMMIT;

-- 执行结果：正数充值与签到扣课分开统计。
SELECT 'super_admins_active' AS item,count(*) AS count FROM "User" WHERE "isSuperAdmin" AND status='ACTIVE'
UNION ALL SELECT 'demo_admins',count(*) FROM "User" WHERE id LIKE 'ai-demo-v2-admin-%'
UNION ALL SELECT 'demo_teachers',count(*) FROM "User" WHERE id LIKE 'ai-demo-v2-teacher-%'
UNION ALL SELECT 'member_students',count(*) FROM "Student" WHERE id LIKE 'ai-demo-v2-%' AND type='MEMBER'
UNION ALL SELECT 'trial_students',count(*) FROM "Student" WHERE id LIKE 'ai-demo-v2-%' AND type='TRIAL'
UNION ALL SELECT 'regular_purchases',count(*) FROM "EntitlementEntry" WHERE id LIKE 'ai-demo-v2-%' AND kind='PURCHASE'
UNION ALL SELECT 'trial_grants',count(*) FROM "EntitlementEntry" WHERE id LIKE 'ai-demo-v2-%' AND kind='TRIAL_GRANT'
UNION ALL SELECT 'sessions',count(*) FROM "ClassSession" WHERE id LIKE 'ai-demo-v2-%'
UNION ALL SELECT 'admin_followups',count(*) FROM "Task" WHERE id LIKE 'ai-demo-v2-%' AND type='TRIAL_FOLLOWUP';

SELECT "generationStatus", source, count(*) FROM "StudentAiReport" GROUP BY 1,2 ORDER BY 1;
