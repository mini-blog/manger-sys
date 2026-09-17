import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { taskDto } = require('../dist/workflow/read.service');
const { nextDay17 } = require('../dist/common/domain');

export async function verifySessionCommands({
  db,
  req,
  ok,
  student,
  a,
  b,
  t,
  login,
  userIds,
  courseId,
  otherCourseId,
  groupId,
  teaching,
  passed,
  document,
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  const teacherId = `session-teacher-${randomUUID()}`;
  const teacherIndex = userIds.push(teacherId) - 1;
  const passwordHash = (await db.user.findUnique({ where: { id: t.user.id } })).passwordHash;
  await db.user.create({
    data: {
      id: teacherId,
      email: `${teacherId}@test.invalid`,
      name: 'Replacement teacher',
      role: 'TEACHER',
      passwordHash,
    },
  });
  const t2 = await login(teacherIndex);
  const at = (day, hour, minute = 0) =>
    `2031-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+11:00`;
  const body = (day, hour, extra = {}) => ({
    classGroupId: groupId,
    courseId,
    teacherId: t.user.id,
    startsAt: at(day, hour),
    endsAt: at(day, hour + 1),
    ...extra,
  });
  const create = async (day, hour, extra = {}) =>
    ok(await req(a, '/sessions', body(day, hour, extra)));
  const get = (l) => db.classSession.findUnique({ where: { id: l.id } });
  const patch = async (l, fields, options = {}, user = a) =>
    req(
      user,
      `/sessions/${l.id}`,
      {
        expectedVersion: (await get(l)).version,
        reason: 'Adjust the lesson',
        ...fields,
      },
      { method: 'PATCH', ...options },
    );
  const join = (s, l, extra = {}) =>
    db.sessionParticipant.create({
      data: {
        studentId: s.id,
        sessionId: l.id,
        kind: 'TRIAL',
        ...extra,
      },
    });
  const state = async (l) => ({
    lesson: await get(l),
    participants: await db.sessionParticipant.findMany({
      where: { sessionId: l.id },
      orderBy: { id: 'asc' },
    }),
    tasks: await db.task.findMany({ where: { sessionId: l.id }, orderBy: { id: 'asc' } }),
    logs: await db.scheduleChange.findMany({ where: { sessionId: l.id }, orderBy: { id: 'asc' } }),
  });

  const key = randomUUID();
  const first = ok(await req(a, '/sessions', body(10, 10), { key }));
  assert.deepEqual(ok(await req(a, '/sessions', body(10, 10), { key })), first);
  assert.equal('capacity' in (await get(first)), false);
  assert.equal(await db.task.count({ where: { sessionId: first.id } }), 0);
  assert.equal(await db.scheduleChange.count({ where: { sessionId: first.id } }), 1);
  assert.equal(
    (await req(a, '/sessions', body(10, 11), { key })).data.code,
    'IDEMPOTENCY_CONFLICT',
  );
  await create(10, 10, { teacherId, courseId: otherCourseId }); // Same class, different teacher.
  assert.equal(
    (await req(a, '/sessions', body(10, 10, { startsAt: at(10, 10, 30), endsAt: at(10, 11, 30) })))
      .data.code,
    'SCHEDULE_CONFLICT',
  );
  await create(10, 11); // Adjacent is not overlap.
  const cancelled = await create(10, 12);
  await db.classSession.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
  await create(10, 12); // A cancelled lesson does not block the teacher.
  passed(
    'session create: optional legacy capacity, no class-level task, teacher-only overlap, adjacency and replay',
  );

  const source = await create(11, 10, {});
  const sa = await student(a, { name: 'Session owner A' });
  const sb = await student(b, { name: 'Session owner B' });
  const sc = await student(a, { name: 'Cancelled history' });
  const pa = await join(sa, source),
    pb = await join(sb, source);
  const pc = await join(sc, source, { bookingStatus: 'CANCELLED' });
  const evaluation = async (p, extra = {}) =>
    db.task.create({
      data: {
        type: 'TRIAL_FEEDBACK',
        sessionId: source.id,
        participantId: p.id,
        assigneeId: t.user.id,
        availableAt: new Date(at(11, 11)),
        dueAt: new Date(at(12, 17)),
        sourceSnapshot: {
          courseName: 'Old subject',
          teacherName: 'Old teacher',
          startsAt: at(11, 10),
        },
        ...extra,
      },
    });
  const ea = await evaluation(pa),
    eb = await evaluation(pb);
  const inactive = await evaluation(pc, { status: 'CANCELLED' });
  const entriesBefore = await db.entitlementEntry.findMany({
    where: { studentId: { in: [sa.id, sb.id] } },
    orderBy: { id: 'asc' },
  });
  const participantsBefore = (await state(source)).participants;
  const balancesBefore = await Promise.all(
    [
      [a, sa],
      [b, sb],
    ].map(
      async ([actor, s]) => ok(await req(actor, `/students/${s.id}/entitlements`), 200).balances,
    ),
  );
  const editKey = randomUUID();
  const edit = {
    expectedVersion: 1,
    reason: 'Change subject and teacher',
    courseId: otherCourseId,
    teacherId,
    startsAt: at(11, 14),
    endsAt: at(11, 15),
  };
  ok(await req(a, `/sessions/${source.id}`, edit, { method: 'PATCH', key: editKey }), 200);
  const after = await state(source);
  assert.equal(after.lesson.version, 2);
  assert.equal(after.lesson.courseId, otherCourseId);
  assert.equal('capacity' in after.lesson, false); // Two students are permitted above this legacy value.
  assert.deepEqual(after.participants, participantsBefore);
  assert.deepEqual(
    await db.entitlementEntry.findMany({
      where: { studentId: { in: [sa.id, sb.id] } },
      orderBy: { id: 'asc' },
    }),
    entriesBefore,
  );
  assert.deepEqual(
    await Promise.all(
      [
        [a, sa],
        [b, sb],
      ].map(
        async ([actor, s]) => ok(await req(actor, `/students/${s.id}/entitlements`), 200).balances,
      ),
    ),
    balancesBefore,
  );
  for (const id of [ea.id, eb.id]) {
    const task = after.tasks.find((v) => v.id === id);
    assert.equal(task.assigneeId, teacherId);
    assert.equal(task.availableAt.toISOString(), new Date(at(11, 15)).toISOString());
    assert.equal(task.dueAt.toISOString(), nextDay17(new Date(at(11, 15))).toISOString());
    assert.equal(task.version, 2);
  }
  assert.deepEqual(
    after.tasks.find((v) => v.id === inactive.id),
    inactive,
  );
  const updateLog = after.logs.find((v) => v.action === 'UPDATE');
  assert.equal(updateLog.actorId, a.user.id);
  assert.equal(updateLog.before.courseId, courseId);
  assert.equal(updateLog.after.courseId, otherCourseId);
  assert.equal((await req(t, `/sessions/${source.id}/participants`)).status, 403);
  assert.equal((await req(t2, `/sessions/${source.id}/participants`)).status, 200);
  assert.equal((await req(t, `/tasks/${ea.id}`)).status, 403);
  // Current task readers do not yet surface the new hidden type; verify its DTO context directly.
  const full = await db.task.findUnique({
    where: { id: ea.id },
    include: {
      session: {
        include: {
          classGroup: true,
          course: true,
          teacher: true,
          participants: { include: { student: true } },
        },
      },
      participant: { include: { student: true } },
    },
  });
  assert.equal(
    taskDto(full, full.session.endsAt).courseName,
    (await db.course.findUnique({ where: { id: otherCourseId } })).name,
  );
  assert.equal(taskDto(full, full.session.endsAt).teacherName, 'Replacement teacher');
  assert.equal(taskDto({ ...full, status: 'DONE' }, full.session.endsAt).courseName, 'Old subject');
  ok(await req(a, `/sessions/${source.id}`, edit, { method: 'PATCH', key: editKey }), 200);
  assert.deepEqual(await state(source), after);
  assert.equal(
    (await req(a, `/sessions/${source.id}`, edit, { method: 'PATCH' })).data.code,
    'VERSION_CONFLICT',
  );
  passed(
    'session update: occupied subject changes, all pending teacher tasks reassigned, historical tasks retained, credits unchanged',
  );

  const other = await create(12, 10);
  await join(sb, other); // Cross-admin student's time must be checked when A edits the shared class.
  let before = await state(source);
  assert.equal(
    (await patch(source, { startsAt: at(12, 10), endsAt: at(12, 11) })).data.code,
    'STUDENT_CONFLICT',
  );
  assert.deepEqual(await state(source), before);
  const cancelledConflict = await create(12, 12);
  await join(sc, cancelledConflict); // Source's cancelled member does not block editing.
  ok(await patch(source, { startsAt: at(12, 12), endsAt: at(12, 13) }), 200);
  await create(12, 14, { teacherId });
  before = await state(source);
  assert.equal(
    (await patch(source, { startsAt: at(12, 14), endsAt: at(12, 15) })).data.code,
    'SCHEDULE_CONFLICT',
  );
  assert.deepEqual(await state(source), before);
  ok(await patch(source, { startsAt: at(12, 15), endsAt: at(12, 16) }), 200);
  assert.equal('capacity' in (await get(source)), false); // Omitted legacy value is preserved.
  passed(
    'session update: all active students are checked across admins, cancelled students ignored, failed changes roll back',
  );

  const unchanged = await state(source);
  for (const invalid of [
    { courseId: 'missing' },
    { classGroupId: 'missing' },
    { teacherId: 'missing' },
  ])
    assert.equal((await patch(source, invalid)).status, 404);
  assert.equal((await patch(source, { teacherId: a.user.id })).status, 400);
  assert.equal((await patch(source, { confirmedAffectedParticipantIds: [] })).status, 400);
  assert.equal((await patch(source, {}, {}, t2)).status, 403);
  assert.equal((await req(null, '/sessions', body(13, 10))).status, 401);
  assert.equal((await req(t, '/sessions', body(13, 10))).status, 403);
  assert.equal((await req(a, '/sessions', body(13, 10), { csrf: false })).status, 403);
  for (const invalid of [
    { capacity: 0 },
    { capacity: null },
    { capacity: 1.5 },
    { capacity: 10 },
    { startsAt: at(13, 11), endsAt: at(13, 10) },
    { startsAt: '2031-01-13T10:00:00', endsAt: at(13, 11) },
    { startsAt: '2029-10-07T02:30:00+10:00', endsAt: '2029-10-07T04:00:00+11:00' },
    { startsAt: '2029-04-01T02:30:00+11:00', endsAt: '2029-04-01T04:00:00+10:00' },
  ])
    assert.equal(
      (await req(a, '/sessions', body(13, 10, invalid))).status,
      400,
      JSON.stringify(invalid),
    );
  assert.deepEqual(await state(source), unchanged);
  const past = await create(13, 10);
  await db.classSession.update({
    where: { id: past.id },
    data: { startsAt: new Date('2020-01-01T00:00:00Z'), endsAt: new Date('2020-01-01T01:00:00Z') },
  });
  assert.equal(
    (await patch(past, { startsAt: at(13, 12), endsAt: at(13, 13) })).data.code,
    'SESSION_STARTED',
  );
  assert.equal((await patch(cancelled, { courseId: otherCourseId })).data.code, 'SESSION_STARTED');
  const evaluated = await create(14, 10);
  await join(sa, evaluated, { attendance: 'ATTENDED', feedbackSubmittedAt: new Date() });
  assert.equal(
    (await patch(evaluated, { courseId: otherCourseId })).data.code,
    'RESULT_ALREADY_SUBMITTED',
  );
  passed(
    'session boundaries: admin permission, valid references, stale contract rejection, DST inputs and submitted history',
  );

  const failureKey = randomUUID();
  const saved = await state(source);
  const originalLog = teaching.log;
  teaching.log = async function (...args) {
    await originalLog.apply(this, args);
    throw new Error('Injected session audit failure');
  };
  try {
    assert.equal((await patch(source, { courseId }, { key: failureKey })).status, 500);
  } finally {
    teaching.log = originalLog;
  }
  assert.deepEqual(await state(source), saved);
  assert.equal(await db.mutationReceipt.count({ where: { key: failureKey } }), 0);
  ok(await patch(source, { courseId }, { key: failureKey }), 200);
  // Two edits based on one version cannot overwrite each other.
  const version = (await get(source)).version;
  const races = await Promise.all([
    patch(source, { expectedVersion: version, startsAt: at(15, 10), endsAt: at(15, 11) }),
    patch(source, { expectedVersion: version, startsAt: at(15, 12), endsAt: at(15, 13) }),
  ]);
  assert.deepEqual(races.map((v) => v.status).sort(), [200, 409]);
  const same = randomUUID();
  const sameBody = { expectedVersion: (await get(source)).version, courseId: otherCourseId };
  const repeated = await Promise.all([
    patch(source, sameBody, { key: same }),
    patch(source, sameBody, { key: same }),
  ]);
  assert.deepEqual(ok(repeated[0], 200), ok(repeated[1], 200));
  const clashes = await Promise.all([
    req(a, '/sessions', body(16, 10)),
    req(b, '/sessions', body(16, 10)),
  ]);
  assert.deepEqual(clashes.map((v) => v.status).sort(), [201, 409]);
  passed(
    'session writes: late failures roll back task and audit updates; concurrent edits and teacher reservations stay consistent',
  );

  const schema = document.components.schemas;
  assert.ok(!schema.CreateSessionDto.required.includes('capacity'));
  assert.equal('capacity' in schema.CreateSessionDto.properties, false);
  assert.equal(schema.UpdateSessionDto.properties.confirmedAffectedParticipantIds, undefined);
  assert.ok(schema.UpdateSessionDto.required.includes('expectedVersion'));
  passed('session contracts: optional capacity and version-only edits documented');
}
