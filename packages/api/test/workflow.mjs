import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createRequire } from 'node:module';
config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/prisma.service');
const { Clock, category, nextDay17, instant } = require('../dist/common/domain');
const { QwenProvider, validateSuggestion, template } = require('../dist/workflow/ai.service');
const { hashPassword } = require('../dist/auth/password');
const { app } = await createApp();
app.useLogger(false);
const db = app.get(PrismaService),
  clock = app.get(Clock),
  provider = app.get(QwenProvider);
let now = new Date('2028-09-04T00:00:00Z');
clock.now = () => now;
await app.listen(0, '127.0.0.1');
const base = `${await app.getUrl()}/api`;
const prefix = `test-${randomUUID()}`,
  userIds = ['a', 'b', 't', 't2'].map((x) => `${prefix}-${x}`),
  sessionIds = [],
  studentIds = [];
const courseIds = ['math', 'english'].map((x) => `${prefix}-${x}`),
  groupIds = ['g1', 'g2', 'g3'].map((x) => `${prefix}-${x}`);
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}
async function req(user, path, body, method = 'POST', key = randomUUID()) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : method,
    headers: {
      ...(user ? { cookie: user.cookie, 'x-csrf-token': user.csrfToken } : {}),
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: await res.json() };
}
function ok(r, status = 201) {
  assert.equal(r.status, status, JSON.stringify(r.data));
  return r.data;
}
async function login(i) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${userIds[i]}@example.com`, password: 'TestPass2026!' }),
  });
  assert.equal(r.status, 200);
  return { cookie: r.headers.getSetCookie()[0].split(';')[0], ...(await r.json()) };
}
async function student(u, name, extra = {}) {
  const s = ok(
    await req(u, '/students', {
      name,
      yearLevel: 'Year 4',
      guardianName: 'Test Parent',
      guardianEmail: 'parent@example.com',
      ...extra,
    }),
  );
  studentIds.push(s.id);
  return s;
}
async function lesson(u, hour, extra = {}) {
  const l = ok(
    await req(u, '/sessions', {
      classGroupId: groupIds[0],
      courseId: courseIds[0],
      teacherId: userIds[2],
      startsAt: `2028-09-04T${hour}:00:00+10:00`,
      endsAt: `2028-09-04T${String(Number(hour) + 1).padStart(2, '0')}:00:00+10:00`,
      capacity: 8,
      ...extra,
    }),
  );
  sessionIds.push(l.id);
  return l;
}
async function roster(u, l) {
  return ok(await req(u, `/sessions/${l.id}/participants`), 200);
}
async function task(u, id) {
  return ok(await req(u, `/tasks/${id}`), 200);
}
try {
  const passwordHash = await hashPassword('TestPass2026!');
  for (let i = 0; i < 4; i++)
    await db.user.create({
      data: {
        id: userIds[i],
        email: `${userIds[i]}@example.com`,
        name: `Test ${i}`,
        passwordHash,
        role: i < 2 ? 'ADMIN' : 'TEACHER',
      },
    });
  for (const id of courseIds) await db.course.create({ data: { id, name: id } });
  for (const id of groupIds)
    await db.classGroup.create({ data: { id, name: id, targetLevel: 'Year 4' } });
  const [a, b, t, t2] = await Promise.all([0, 1, 2, 3].map(login));
  const s = await student(a, 'Trial Student'),
    s2 = await student(b, 'Other Admin Trial'),
    reg = await student(a, 'Regular');
  // New bookings require a real purchase; legacy roster/move still read this historical date.
  ok(
    await req(a, '/entitlements/grants', {
      studentId: reg.id,
      bucket: 'REGULAR',
      mode: 'CUSTOM',
      quantity: 1,
    }),
  );
  await db.student.update({
    where: { id: reg.id },
    data: { firstEnrolledOn: new Date('2028-08-29') },
  });
  const l = await lesson(a, '12'),
    target = await lesson(a, '14', {
      classGroupId: groupIds[1],
      teacherId: userIds[3],
      capacity: 1,
    }),
    other = await lesson(a, '16', { classGroupId: groupIds[2], courseId: courseIds[1] });
  const key = randomUUID(),
    book = { studentId: s.id, kind: 'TRIAL' };
  const first = ok(await req(a, `/sessions/${l.id}/participants`, book, 'POST', key));
  check('same-key replay does not duplicate booking', () => {});
  assert.deepEqual(ok(await req(a, `/sessions/${l.id}/participants`, book, 'POST', key)), first);
  assert.equal(
    (
      await req(
        a,
        `/sessions/${l.id}/participants`,
        { studentId: reg.id, kind: 'REGULAR' },
        'POST',
        key,
      )
    ).status,
    409,
  );
  assert.equal(
    (await req(b, `/participants/${first.id}/cancel`, { expectedVersion: 1, reason: 'forbidden' }))
      .status,
    403,
  );
  assert.equal((await req(a, `/students/${s2.id}`)).data.guardianEmail, undefined);
  assert.equal((await req(b, `/students/${s.id}/communications`)).status, 403);
  assert.equal((await req(t, `/students/${s.id}`)).data.guardianEmail, undefined);
  check('owner and teacher DTO permissions', () => {});
  ok(await req(b, `/sessions/${l.id}/participants`, { studentId: s2.id, kind: 'TRIAL' }));
  ok(await req(a, `/sessions/${l.id}/participants`, { studentId: reg.id, kind: 'REGULAR' }));
  assert.equal((await req(a, `/sessions/${target.id}/participants`, book)).status, 409);
  const [x, y] = await Promise.all([student(a, 'Concurrent one'), student(a, 'Concurrent two')]);
  const concurrent = await Promise.all(
    [x, y].map((s) =>
      req(a, `/sessions/${target.id}/participants`, { studentId: s.id, kind: 'TRIAL' }),
    ),
  );
  assert.deepEqual(concurrent.map((x) => x.status).sort(), [201, 201]);
  assert.equal((await roster(a, l)).participants.length, 3);
  assert.equal((await roster(a, target)).participants.length, 2);
  check('concurrent bookings are not blocked by legacy capacity', () => {});
  let r = await roster(t, l);
  const feedback = {
    expectedVersion: r.lesson.version,
    summary: 'Practice completed',
    students: r.participants.map((p) => ({
      participantId: p.participantId,
      attendance: 'ATTENDED',
      feedback: 'Worked confidently',
      abilityNote: 'Ready for practice',
      preferenceNote: 'Likes visual examples',
    })),
  };
  assert.equal((await req(t, `/sessions/${l.id}/feedback`, feedback)).status, 409);
  now = new Date('2028-09-04T03:01:00Z');
  assert.equal((await req(t2, `/sessions/${l.id}/feedback`, feedback)).status, 403);
  const invalid = structuredClone(feedback);
  invalid.students.at(-1).participantId = 'not-in-roster';
  assert.equal((await req(t, `/sessions/${l.id}/feedback`, invalid)).status, 400);
  // The later invalid trial must roll back updates already made to earlier rows.
  const sorted = structuredClone(feedback);
  sorted.students.sort((a, b) => a.participantId.localeCompare(b.participantId));
  const lastTrial = sorted.students
    .filter((p) => r.participants.find((x) => x.participantId === p.participantId).kind === 'TRIAL')
    .at(-1);
  lastTrial.feedback = '';
  assert.equal((await req(t, `/sessions/${l.id}/feedback`, sorted)).status, 400);
  assert.ok((await roster(t, l)).participants.every((p) => p.attendance === 'PENDING'));
  for (const response of await Promise.all([
    req(t, `/sessions/${l.id}/feedback`, feedback),
    req(t, `/sessions/${l.id}/feedback`, feedback),
  ]))
    ok(response);
  assert.equal(await db.task.count({ where: { sessionId: l.id, type: 'TRIAL_FOLLOWUP' } }), 2);
  const teachTask = await db.task.findFirst({
    where: { sessionId: l.id, type: 'LESSON_FEEDBACK' },
  });
  assert.equal((await task(t, teachTask.id)).status, 'DONE');
  assert.equal((await req(a, `/tasks/${teachTask.id}`)).status, 403);
  const ta = await db.task.findFirst({
      where: { participantId: first.id, type: 'TRIAL_FOLLOWUP' },
    }),
    tb = await db.task.findFirst({ where: { sessionId: l.id, assigneeId: b.user.id } });
  assert.equal((await req(b, `/tasks/${ta.id}`)).status, 403);
  assert.equal((await req(a, `/tasks/${tb.id}`)).status, 403);
  assert.equal(
    (await req(a, `/students/${s.id}/trial-eligibility?courseId=${courseIds[0]}`)).data.remaining,
    0,
  );
  check(
    'teacher availability, transactional feedback, repeat submission and per-admin tasks',
    () => {},
  );
  let count = 0;
  provider.generate = async () => {
    count++;
    return template('EMAIL', 'en-AU', 'TRIAL_COMPLETED');
  };
  assert.equal(
    (await req(b, `/tasks/${ta.id}/suggestions`, { channel: 'EMAIL', language: 'en-AU' })).status,
    403,
  );
  assert.equal(count, 0);
  const ai = ok(
    await req(a, `/tasks/${ta.id}/suggestions`, { channel: 'EMAIL', language: 'en-AU' }),
  );
  assert.equal(ai.source, 'llm');
  provider.generate = async () => ({
    ...template('PHONE', 'zh-CN', 'TRIAL_COMPLETED'),
    observations: [{ text: 'Invented', sourceIds: ['fake-id'] }],
  });
  const fallback = ok(
    await req(a, `/tasks/${ta.id}/suggestions`, { channel: 'PHONE', language: 'zh-CN' }),
  );
  assert.equal(fallback.source, 'template');
  assert.equal(fallback.messageDraft, null);
  assert.deepEqual(fallback.observations, []);
  provider.generate = async () => {
    throw new Error('Timeout');
  };
  const failed = ok(
    await req(a, `/tasks/${ta.id}/suggestions`, { channel: 'SMS', language: 'en-AU' }),
  );
  assert.equal(failed.source, 'template');
  assert.ok(failed.messageDraft);
  check(
    'AI scoped authorization, valid structured response, fake evidence and timeout fallback',
    () => {},
  );
  let details = await task(a, ta.id);
  const communication = {
    guardianNameSnapshot: 'Test Parent',
    channel: 'EMAIL',
    content: 'Parent wants to discuss next week.',
    occurredAt: now.toISOString(),
  };
  const follow = {
    expectedVersion: details.version,
    communication,
    outcome: 'CONSIDERING',
    nextDueAt: '2028-09-05T12:00:00+10:00',
  };
  ok(await req(a, `/tasks/${ta.id}/follow-up`, follow));
  details = await task(a, ta.id);
  assert.equal(details.status, 'OPEN');
  const enrolled = {
    expectedVersion: details.version,
    communication: { ...communication, content: 'Parent confirmed enrolment.' },
    outcome: 'ENROLLED',
    closeReason: 'Enrolment confirmed by parent',
    firstEnrolledOn: '2028-09-06',
  };
  const followKey = randomUUID();
  ok(await req(a, `/tasks/${ta.id}/follow-up`, enrolled, 'POST', followKey));
  ok(await req(a, `/tasks/${ta.id}/follow-up`, enrolled, 'POST', followKey));
  assert.equal(await db.communicationLog.count({ where: { taskId: ta.id } }), 2);
  assert.equal((await task(a, ta.id)).status, 'DONE');
  ok(
    await req(a, `/students/${s.id}/communications`, {
      ...communication,
      content: 'Independent communication after closure.',
    }),
  );
  assert.equal((await req(a, `/students/${s.id}`)).data.firstEnrolledOn, '2028-09-06');
  check('follow-up logs, manual enrolment, idempotency and independent communication', () => {});
  // Changing a student's lesson uses independent remove/add commands.
  const u = await student(a, 'Rebooking');
  const src = await lesson(a, '18'),
    dest = await lesson(a, '20');
  let p = ok(await req(a, `/sessions/${src.id}/participants`, { studentId: u.id, kind: 'TRIAL' }));
  ok(
    await req(a, `/participants/${p.id}/cancel`, {
      expectedVersion: 1,
      reason: 'Family unavailable',
    }),
  );
  const hidden = await db.task.findFirst({
    where: { participantId: p.id, type: 'TRIAL_FEEDBACK' },
  });
  assert.equal(hidden.status, 'CANCELLED');
  assert.equal(await db.task.count({ where: { participantId: p.id, type: 'TRIAL_FOLLOWUP' } }), 0);
  assert.equal(
    ok(await req(a, `/sessions/${src.id}/participants`, { studentId: u.id, kind: 'TRIAL' })).id,
    p.id,
  );
  ok(
    await req(a, `/participants/${p.id}/cancel`, {
      expectedVersion: 3,
      reason: 'Change requested',
    }),
  );
  p = ok(await req(a, `/sessions/${dest.id}/participants`, { studentId: u.id, kind: 'TRIAL' }));
  assert.equal((await roster(a, src)).participants.length, 0);
  assert.equal((await roster(a, dest)).participants.length, 1);
  r = await roster(a, dest);
  ok(
    await req(
      a,
      `/sessions/${dest.id}`,
      {
        expectedVersion: r.lesson.version,
        reason: 'Substitute teacher',
        teacherId: userIds[3],
      },
      'PATCH',
    ),
    200,
  );
  assert.equal((await req(t, `/sessions/${dest.id}/participants`)).status, 403);
  now = new Date('2028-09-04T11:01:00Z');
  r = await roster(t2, dest);
  ok(
    await req(t2, `/sessions/${dest.id}/feedback`, {
      expectedVersion: r.lesson.version,
      students: [{ participantId: p.id, attendance: 'NO_SHOW' }],
    }),
  );
  assert.equal(
    (await req(a, `/students/${u.id}/trial-eligibility?courseId=${courseIds[0]}`)).data.available,
    1,
  );
  assert.equal(
    (await db.task.findFirst({ where: { participantId: p.id, type: 'TRIAL_FOLLOWUP' } })).reason,
    'NO_SHOW',
  );
  check('remove/re-add, teacher reassignment and legacy no-show feedback', () => {});
  // Further object-level and scheduling boundaries use tomorrow's isolated lessons.
  const tomorrow = await lesson(a, '12', {
    startsAt: '2028-09-05T12:00:00+10:00',
    endsAt: '2028-09-05T13:00:00+10:00',
  });
  const simultaneous = await lesson(a, '12', {
    classGroupId: groupIds[1],
    teacherId: userIds[3],
    courseId: courseIds[1],
    startsAt: '2028-09-05T12:00:00+10:00',
    endsAt: '2028-09-05T13:00:00+10:00',
  });
  const conflict = {
    classGroupId: groupIds[2],
    courseId: courseIds[0],
    teacherId: userIds[2],
    startsAt: '2028-09-05T12:30:00+10:00',
    endsAt: '2028-09-05T13:30:00+10:00',
    capacity: 8,
  };
  assert.equal((await req(a, '/sessions', conflict)).status, 409);
  assert.equal(
    (await req(a, '/sessions', { ...conflict, classGroupId: groupIds[0], teacherId: userIds[3] }))
      .status,
    409,
  );
  const fresh = await student(a, 'Cross-subject conflict');
  const tomorrowP = ok(
    await req(a, `/sessions/${tomorrow.id}/participants`, { studentId: fresh.id, kind: 'TRIAL' }),
  );
  assert.equal(
    (
      await req(a, `/sessions/${simultaneous.id}/participants`, {
        studentId: fresh.id,
        kind: 'TRIAL',
      })
    ).data.code,
    'STUDENT_CONFLICT',
  );
  const unEnrolled = await student(a, 'Not enrolled');
  assert.equal(
    (
      await req(a, `/sessions/${tomorrow.id}/participants`, {
        studentId: unEnrolled.id,
        kind: 'REGULAR',
      })
    ).data.code,
    'PURCHASE_REQUIRED',
  );
  assert.equal(
    (
      await req(
        a,
        `/students/${s.id}`,
        {
          expectedVersion: (await req(a, `/students/${s.id}`)).data.version,
          firstEnrolledOn: '2028-10-01',
        },
        'PATCH',
      )
    ).status,
    400,
  );
  assert.equal((await req(t, `/sessions?week=2028-09-05&teacherId=${t2.user.id}`)).status, 403);
  assert.equal(
    (
      await req(a, '/students', {
        name: 'Null input',
        yearLevel: 'Year 4',
        preferredLanguage: null,
      })
    ).status,
    400,
  );
  check('teacher/student conflicts, enrolment rules, filtered scope and null rejection', () => {});
  r = await roster(a, tomorrow);
  assert.equal(
    (
      await req(
        a,
        `/sessions/${tomorrow.id}`,
        {
          expectedVersion: r.lesson.version,
          reason: 'Conflicting teacher',
          teacherId: userIds[3],
        },
        'PATCH',
      )
    ).status,
    409,
  );
  const cancelBody = {
    expectedVersion: r.lesson.version,
    reason: 'Lesson cancelled',
  };
  ok(await req(a, `/sessions/${tomorrow.id}/cancel`, cancelBody));
  assert.equal(await db.task.count({ where: { sessionId: tomorrow.id, status: 'OPEN' } }), 0);
  assert.equal(
    (await db.sessionParticipant.findUnique({ where: { id: tomorrowP.id } })).bookingStatus,
    'CANCELLED',
  );
  assert.equal(
    (
      await req(a, `/participants/${tomorrowP.id}/restore`, {
        expectedVersion: 2,
        reason: 'Cannot restore cancelled lesson',
      })
    ).status,
    409,
  );
  const completed = await task(a, ta.id);
  ok(
    await req(a, `/tasks/${ta.id}/reopen`, {
      expectedVersion: completed.version,
      reason: 'Family asked to speak again',
      nextDueAt: '2028-09-06T17:00:00+10:00',
    }),
  );
  assert.equal((await task(a, ta.id)).status, 'OPEN');
  check(
    'teacher conflict, lesson cancellation without follow-ups and explicit follow-up reopen',
    () => {},
  );
  for (let i = 0; i < 5; i++)
    ok(await req(a, `/tasks/${ta.id}/suggestions`, { channel: 'PHONE', language: 'en-AU' }));
  assert.equal(
    (await req(a, `/tasks/${ta.id}/suggestions`, { channel: 'PHONE', language: 'en-AU' })).status,
    429,
  );
  check('suggestion rate limit leaves manual follow-up available', () => {});
  check('new student seven-day boundary and DST deadlines', () => {
    assert.equal(category('REGULAR', new Date('2028-08-29'), new Date('2028-09-04T02:00Z')), 'NEW');
    assert.equal(
      category('REGULAR', new Date('2028-08-29'), new Date('2028-09-05T02:00Z')),
      'EXISTING',
    );
    assert.equal(
      nextDay17(new Date('2026-10-03T06:00Z')).toISOString(),
      '2026-10-04T06:00:00.000Z',
    );
    assert.throws(() => instant('2026-10-04T02:30:00+10:00', true));
    assert.throws(() => instant('2026-04-05T02:30:00+11:00', true));
    assert.throws(() =>
      validateSuggestion({ ...template('PHONE', 'en-AU', 'NO_SHOW'), extra: true }, 'PHONE', []),
    );
  });
  console.log(
    `Workflow integration passed (${passed} groups, actual PostgreSQL, injected Clock). Real Qwen not exercised.`,
  );
} finally {
  await db.communicationLog.deleteMany({ where: { createdBy: { in: userIds } } });
  await db.scheduleChange.deleteMany({ where: { actorId: { in: userIds } } });
  await db.task.deleteMany({ where: { assigneeId: { in: userIds } } });
  await db.entitlementEntry.deleteMany({ where: { student: { ownerAdminId: { in: userIds } } } });
  await db.sessionParticipant.deleteMany({ where: { session: { teacherId: { in: userIds } } } });
  await db.classSession.deleteMany({ where: { teacherId: { in: userIds } } });
  await db.student.deleteMany({ where: { ownerAdminId: { in: userIds } } });
  await db.mutationReceipt.deleteMany({ where: { userId: { in: userIds } } });
  await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await db.classGroup.deleteMany({ where: { id: { in: groupIds } } });
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
}
