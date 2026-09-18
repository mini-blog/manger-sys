// Run only against the disposable database created by scripts/test-ai.mjs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
assert.equal(process.env.AI_TEST_ISOLATED, 'true');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/studentsys_ai_test');
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/prisma.service');
const { AiService, QwenProvider } = require('../dist/workflow/ai.service');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile('sql/schema.sql', 'utf8'));
await pool.query(await readFile('sql/development-seed.sql', 'utf8'));
await pool.query(await readFile('sql/development-seed.sql', 'utf8'));
await pool.query(await readFile('sql/verify-ai-seed.sql', 'utf8'));
const { app } = await createApp();
app.useLogger(['error']);
await app.listen(0, '127.0.0.1');
const base = (await app.getUrl()) + '/api';
const db = app.get(PrismaService),
  provider = app.get(QwenProvider);
let passed = 0;
function pass(name) {
  console.log('✓ ' + name);
  passed++;
}
async function req(
  user,
  path,
  body,
  key = randomUUID(),
  method = body === undefined ? 'GET' : 'POST',
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(user ? { cookie: user.cookie, 'x-csrf-token': user.csrfToken } : {}),
      'idempotency-key': key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
function ok(result, status = 201) {
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}
async function login(email) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'StudentSysDemo2026!' }),
  });
  assert.equal(r.status, 200);
  return { ...(await r.json()), cookie: r.headers.getSetCookie()[0].split(';')[0] };
}
const reportValue = (input) => ({
  overview: 'Review teaching and family feedback.',
  learningProfile: {
    summary: 'Based on recorded evidence.',
    strengths: [],
    needsAttention: ['Confirm preferences.'],
  },
  teacherEvaluation: {
    classroomPerformanceRating: input.facts.classroomPerformanceRating,
    overallAbilityRating: input.facts.overallAbilityRating,
    summary: 'Teacher observation.',
  },
  followup: {
    purchaseIntentRating: input.facts.purchaseIntentRating,
    reasons: input.facts.reasons,
    summary: 'Reported by admin.',
  },
  observations: [
    { text: 'Follow up on recorded concerns.', sourceIds: [input.evidence.at(-1).id] },
  ],
  questionsToConfirm: ['Which times are suitable?'],
  suggestedNextActions: ['Arrange a discussion.'],
});
try {
  const admin = await login('admin01@demo.studentsys.test'),
    other = await login('admin02@demo.studentsys.test'),
    teacher = await login('teacher01@demo.studentsys.test'),
    superAdmin = await login('super@demo.studentsys.test');
  pass('SQL fixture integrity and all role logins');
  const student = ok(
    await req(admin, '/students', {
      name: 'Virtual learner',
      yearLevel: 'Year 4',
      guardianName: 'Virtual parent',
      guardianEmail: 'virtual@example.test',
      backgroundHtml:
        '<p onclick="bad()">Needs <strong>practice</strong><script>bad()</script></p>',
      adminNotesHtml: '<p>Internal sales note</p>',
    }),
  );
  let detail = ok(await req(admin, '/students/' + student.id), 200);
  assert.equal(detail.backgroundHtml, '<p>Needs <strong>practice</strong></p>');
  assert.equal(detail.adminNotesHtml, '<p>Internal sales note</p>');
  const foreign = ok(await req(other, '/students/' + student.id), 200);
  assert.equal('adminNotesHtml' in foreign, false);
  assert.equal('guardianEmail' in foreign, false);
  assert.equal((await req(teacher, '/students/' + student.id)).status, 403);
  assert.equal(
    (
      await req(
        other,
        '/students/' + student.id,
        { expectedVersion: 1, adminNotesHtml: 'steal' },
        randomUUID(),
        'PATCH',
      )
    ).status,
    403,
  );
  pass('rich text sanitation, owner-only notes and student mutation permissions');
  const visible = ok(await req(teacher, '/tasks'), 200);
  assert.equal(visible.items.length, 1);
  const task = ok(await req(teacher, '/tasks/' + visible.items[0].id), 200);
  const p = task.participant;
  assert.ok(task.student.backgroundHtml);
  for (const privateField of ['adminNotesHtml', 'guardianEmail', 'guardianPhone'])
    assert.equal(privateField in task.student, false);
  const roster = ok(await req(teacher, '/sessions/' + task.sessionId + '/participants'), 200);
  assert.ok(roster.participants.every((p) => !('adminNotesHtml' in p)));
  const evaluation = {
    expectedVersion: p.version,
    classroomPerformanceRating: 4.5,
    overallAbilityRating: 3.5,
    teacherNoteHtml: '<p>Enjoys visual exercises.</p>',
  };
  for (const rating of [0.5, 3.49, 6])
    assert.equal(
      (
        await req(teacher, '/participants/' + p.participantId + '/feedback', {
          ...evaluation,
          classroomPerformanceRating: rating,
        })
      ).status,
      400,
    );
  assert.equal(
    (await req(admin, '/participants/' + p.participantId + '/feedback', evaluation)).status,
    403,
  );
  const key = randomUUID();
  ok(await req(teacher, '/participants/' + p.participantId + '/feedback', evaluation, key));
  ok(await req(teacher, '/participants/' + p.participantId + '/feedback', evaluation, key));
  assert.equal(
    await db.task.count({ where: { participantId: p.participantId, type: 'TRIAL_FOLLOWUP' } }),
    1,
  );
  pass('teacher visibility, half-star validation and idempotent evaluation → follow-up');
  const followup = await db.task.findFirstOrThrow({
    where: { participantId: p.participantId, type: 'TRIAL_FOLLOWUP' },
  });
  const advisor = followup.assigneeId === admin.user.id ? admin : other;
  const nonOwner = advisor === admin ? other : admin;
  const comm = {
    guardianNameSnapshot: task.student.name + ' parent',
    channel: 'EMAIL',
    occurredAt: new Date().toISOString(),
    noteHtml: '<p>Needs a different time.</p>',
    purchaseIntentRating: 3.5,
    notPurchasedReasons: ['TIME'],
  };
  assert.equal(
    (
      await req(advisor, '/tasks/' + followup.id + '/follow-up', {
        expectedVersion: 1,
        outcome: 'PURCHASED',
        communication: { ...comm, purchaseIntentRating: null, notPurchasedReasons: [] },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(advisor, '/tasks/' + followup.id + '/follow-up', {
        expectedVersion: 1,
        outcome: 'NOT_PURCHASED',
        communication: { ...comm, notPurchasedReasons: ['UNREACHABLE'] },
      })
    ).status,
    400,
  );
  const fkey = randomUUID(),
    input = { expectedVersion: followup.version, outcome: 'NOT_PURCHASED', communication: comm };
  const result = ok(await req(advisor, '/tasks/' + followup.id + '/follow-up', input, fkey));
  ok(await req(advisor, '/tasks/' + followup.id + '/follow-up', input, fkey));
  const reportId = result.reportTaskId;
  assert.ok(reportId);
  assert.equal(await db.studentAiReport.count({ where: { sourceFollowupTaskId: followup.id } }), 1);
  assert.equal(await db.communicationLog.count({ where: { taskId: followup.id } }), 1);
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: followup.id } })).status, 'DONE');
  pass('not-purchased atomic completion, invalid branch rejection and unique report');
  for (const forbidden of [teacher, nonOwner, superAdmin]) {
    assert.equal((await req(forbidden, '/tasks/' + reportId)).status, 403);
    assert.equal((await req(forbidden, '/tasks/' + reportId + '/report')).status, 403);
  }
  assert.ok(ok(await req(advisor, '/tasks'), 200).items.some((t) => t.id === reportId));
  assert.equal(
    (await req(advisor, '/tasks/' + reportId + '/report/complete', { expectedVersion: 1 })).status,
    409,
  );
  const failed = ok(
    await req(advisor, '/tasks/' + reportId + '/report/generate', { expectedVersion: 1 }),
  );
  assert.equal(failed.generationStatus, 'FAILED');
  assert.equal(failed.lastErrorCode, 'AI_NOT_CONFIGURED');
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: followup.id } })).status, 'DONE');
  pass('report privacy (including super-admin), list and unavailable-provider degradation');
  // Explicit provider stub verifies persistence/CAS; this is not evidence of a real Qwen call.
  let captured;
  provider.generate = async (input) => {
    captured = input;
    return reportValue(input);
  };
  const ready = ok(
    await req(advisor, '/tasks/' + reportId + '/report/generate', {
      expectedVersion: failed.version,
    }),
  );
  assert.equal(ready.generationStatus, 'READY');
  assert.equal(ready.stale, false);
  assert.ok(!JSON.stringify(captured).includes(task.student.name));
  let s = ok(await req(advisor, '/students/' + task.student.id), 200);
  ok(
    await req(
      advisor,
      '/students/' + s.id,
      { expectedVersion: s.version, backgroundHtml: '<p>Updated teaching context</p>' },
      randomUUID(),
      'PATCH',
    ),
    200,
  );
  assert.equal(ok(await req(advisor, '/tasks/' + reportId + '/report'), 200).stale, true);
  assert.equal(
    (
      await req(advisor, '/tasks/' + reportId + '/report/complete', {
        expectedVersion: ready.version,
      })
    ).status,
    409,
  );
  const refreshed = ok(
    await req(advisor, '/tasks/' + reportId + '/report/generate', {
      expectedVersion: ready.version,
    }),
  );
  const doneKey = randomUUID();
  ok(
    await req(
      advisor,
      '/tasks/' + reportId + '/report/complete',
      { expectedVersion: refreshed.version },
      doneKey,
    ),
  );
  ok(
    await req(
      advisor,
      '/tasks/' + reportId + '/report/complete',
      { expectedVersion: refreshed.version },
      doneKey,
    ),
  );
  assert.equal(
    (
      await req(advisor, '/tasks/' + reportId + '/report/generate', {
        expectedVersion: refreshed.version,
      })
    ).status,
    409,
  );
  pass(
    'validated mock output, deidentification, stale report guard, regenerate and immutable completion',
  );
  // Existing seeded follow-up stays open after purchase, then requires explicit purchased completion.
  const open = await db.task.findFirstOrThrow({
    where: { type: 'TRIAL_FOLLOWUP', status: 'OPEN', assigneeId: admin.user.id },
    include: { participant: { include: { student: true } } },
  });
  const grant = ok(
    await req(admin, '/entitlements/grants', {
      studentId: open.participant.studentId,
      bucket: 'REGULAR',
      quantity: 5,
      mode: 'CUSTOM',
    }),
  );
  assert.deepEqual(grant.closedTaskIds, []);
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: open.id } })).status, 'OPEN');
  assert.equal(
    (
      await req(admin, '/tasks/' + open.id + '/follow-up', {
        expectedVersion: open.version,
        outcome: 'NOT_PURCHASED',
        communication: comm,
      })
    ).status,
    409,
  );
  ok(
    await req(admin, '/tasks/' + open.id + '/follow-up', {
      expectedVersion: open.version,
      outcome: 'PURCHASED',
      communication: { ...comm, noteHtml: '', purchaseIntentRating: null, notPurchasedReasons: [] },
    }),
  );
  assert.equal(await db.studentAiReport.count({ where: { sourceFollowupTaskId: open.id } }), 0);
  pass('formal grant leaves follow-up open, purchased verification and no report for purchased');
  // Delayed provider responses must not overwrite changes made during generation.
  const pending = await db.studentAiReport.findFirstOrThrow({
    where: { generationStatus: 'NOT_STARTED', task: { assigneeId: admin.user.id } },
  });
  let release, started;
  const gate = new Promise((resolve) => {
    started = resolve;
  });
  provider.generate = async (input) => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    return reportValue(input);
  };
  const inflight = req(admin, '/tasks/' + pending.taskId + '/report/generate', {
    expectedVersion: pending.version,
  });
  await gate;
  const pendingStudent = ok(await req(admin, '/students/' + pending.studentId), 200);
  ok(
    await req(
      admin,
      '/students/' + pending.studentId,
      {
        expectedVersion: pendingStudent.version,
        adminNotesHtml: '<p>Changed during generation</p>',
      },
      randomUUID(),
      'PATCH',
    ),
    200,
  );
  release();
  assert.equal((await inflight).status, 409);
  assert.equal(
    (await db.studentAiReport.findUniqueOrThrow({ where: { id: pending.id } })).generationStatus,
    'NOT_STARTED',
  );
  provider.generate = async (input) => reportValue(input);
  const concurrent = await Promise.all([
    req(admin, '/tasks/' + pending.taskId + '/report/generate', {
      expectedVersion: pending.version,
    }),
    req(admin, '/tasks/' + pending.taskId + '/report/generate', {
      expectedVersion: pending.version,
    }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  pass('in-flight source changes and concurrent generation cannot overwrite a report');
  const options = ok(await req(admin, '/sessions/options'), 200);
  const startsAt = new Date(Date.now() + 86400000 * 4).toISOString();
  const endsAt = new Date(Date.now() + 86400000 * 4 + 3600000).toISOString();
  const lessonInput = {
    classGroupId: options.classes[0].id,
    courseId: options.courses[0].id,
    teacherId: options.teachers[0].id,
    startsAt,
    endsAt,
  };
  const lesson = ok(await req(admin, '/sessions', lessonInput));
  assert.equal((await req(admin, '/sessions', lessonInput)).status, 409);
  const bookingKey = randomUUID(),
    bookingBody = { studentId: student.id, kind: 'TRIAL' };
  const booked = ok(
    await req(admin, '/sessions/' + lesson.id + '/participants', bookingBody, bookingKey),
  );
  ok(await req(admin, '/sessions/' + lesson.id + '/participants', bookingBody, bookingKey));
  let balance = ok(await req(admin, '/students/' + student.id + '/entitlements'), 200);
  assert.equal(balance.balances.TRIAL.reserved, 1);
  const secondLesson = ok(
    await req(admin, '/sessions', { ...lessonInput, teacherId: options.teachers[1].id }),
  );
  assert.equal(
    (await req(admin, '/sessions/' + secondLesson.id + '/participants', bookingBody)).status,
    409,
  );
  const currentLesson = await db.classSession.findUniqueOrThrow({ where: { id: lesson.id } });
  ok(
    await req(admin, '/sessions/' + lesson.id + '/cancel', {
      expectedVersion: currentLesson.version,
      reason: 'Test cancellation',
    }),
  );
  balance = ok(await req(admin, '/students/' + student.id + '/entitlements'), 200);
  assert.equal(balance.balances.TRIAL.reserved, 0);
  assert.equal(balance.balances.TRIAL.remaining, 1);
  assert.equal(
    (
      await db.task.findFirstOrThrow({
        where: { participantId: booked.id, type: 'TRIAL_FEEDBACK' },
      })
    ).status,
    'CANCELLED',
  );
  pass('schedule conflicts, trial reservation, duplicate booking and cancellation release');
  // Teacher2 signs in the absent trial student; only then does the ended lesson reveal evaluation.
  const teacher2 = await login('teacher02@demo.studentsys.test');
  assert.equal(ok(await req(teacher2, '/tasks'), 200).items.length, 0);
  const unsigned = await db.sessionParticipant.findFirstOrThrow({
    where: {
      student: { type: 'TRIAL' },
      checkedInAt: null,
      session: { teacherId: teacher2.user.id, endsAt: { lt: new Date() } },
    },
  });
  const countBefore = await db.entitlementEntry.count({
    where: { studentId: unsigned.studentId, kind: 'CONSUMPTION' },
  });
  const checkKey = randomUUID();
  ok(
    await req(
      teacher2,
      '/participants/' + unsigned.id + '/check-in',
      { expectedVersion: unsigned.version },
      checkKey,
    ),
  );
  ok(
    await req(
      teacher2,
      '/participants/' + unsigned.id + '/check-in',
      { expectedVersion: unsigned.version },
      checkKey,
    ),
  );
  assert.equal(
    await db.entitlementEntry.count({
      where: { studentId: unsigned.studentId, kind: 'CONSUMPTION' },
    }),
    countBefore + 1,
  );
  assert.equal(ok(await req(teacher2, '/tasks'), 200).items.length, 1);
  pass('attendance reveals only checked-in evaluations and deducts exactly once');
  // Open report tasks move together with students when an admin is deactivated.
  const admin3 = await login('admin03@demo.studentsys.test');
  const transferReport = await db.task.findFirstOrThrow({
    where: { assigneeId: admin3.user.id, type: 'STUDENT_AI_REPORT', status: 'OPEN' },
  });
  const account = await db.user.findUniqueOrThrow({ where: { id: admin3.user.id } });
  ok(
    await req(superAdmin, '/accounts/' + admin3.user.id + '/deactivate', {
      expectedVersion: account.version,
      reason: 'Isolated handover verification',
      successorAdminId: admin.user.id,
    }),
  );
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: transferReport.id } })).assigneeId,
    admin.user.id,
  );
  ok(await req(admin, '/tasks/' + transferReport.id + '/report'), 200);
  assert.equal((await req(admin3, '/tasks/' + transferReport.id + '/report')).status, 401);
  pass('account deactivation transfers open reports and invalidates former owner session');
  console.log(
    `AI v2 workflow: ${passed} groups passed. Provider success is mocked; no live LLM claim.`,
  );
} finally {
  await app.close();
  await pool.end();
}
