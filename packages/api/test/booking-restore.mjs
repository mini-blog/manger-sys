import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyBookingRestore({
  db,
  req,
  ok,
  student,
  a,
  b,
  t,
  courseId,
  otherCourseId,
  groupId,
  now,
  passed,
  teaching,
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  let hour = 100;
  const createStudent = () =>
    student(a, {
      name: 'Restore student',
      guardianName: 'Parent',
      guardianEmail: 'parent@test.invalid',
    });
  const grant = async (s, bucket, quantity) =>
    ok(
      await req(a, '/entitlements/grants', {
        studentId: s.id,
        bucket,
        quantity,
        ...(bucket === 'REGULAR' ? { mode: 'CUSTOM' } : {}),
      }),
    );
  async function book(s, kind = 'TRIAL', extra = {}) {
    hour += 2;
    const l = await db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        capacity: 10,
        startsAt: new Date(now.getTime() + hour * 3600000),
        endsAt: new Date(now.getTime() + (hour + 1) * 3600000),
        ...extra,
      },
    });
    const p = ok(await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind }));
    return { p, l, s };
  }
  const cancel = async (x) =>
    ok(
      await req(a, `/participants/${x.p.id}/cancel`, {
        expectedVersion: 1,
        reason: 'Family unavailable',
      }),
    );
  const restore = (x, body = {}, options = {}, user = a) =>
    req(
      user,
      `/participants/${x.p.id}/restore`,
      {
        expectedVersion: 2,
        reason: 'Family confirmed',
        ...body,
      },
      options,
    );
  const balance = async (s) => ok(await req(a, `/students/${s.id}/entitlements`), 200).balances;
  const task = (x) =>
    db.task.findFirst({ where: { type: 'TRIAL_FOLLOWUP', participantId: x.p.id } });
  const state = async (x) => ({
    participant: await db.sessionParticipant.findUniqueOrThrow({ where: { id: x.p.id } }),
    lesson: await db.classSession.findUniqueOrThrow({ where: { id: x.l.id } }),
    task: await task(x),
    logs: await db.scheduleChange.findMany({
      where: { participantId: x.p.id },
      orderBy: { id: 'asc' },
    }),
    entries: await db.entitlementEntry.findMany({
      where: { studentId: x.s.id },
      orderBy: { id: 'asc' },
    }),
  });
  async function rejected(x, expectedCode, body = {}) {
    const before = await state(x),
      key = randomUUID();
    const result = await restore(x, body, { key });
    assert.equal(result.status, 409, JSON.stringify(result));
    assert.equal(result.data.code, expectedCode);
    assert.deepEqual(await state(x), before);
    assert.equal(await db.mutationReceipt.count({ where: { userId: a.user.id, key } }), 0);
  }

  const s = await createStudent();
  await grant(s, 'TRIAL', 1);
  const first = await book(s),
    second = await book(s);
  await cancel(first);
  await cancel(second);
  const before = await state(first),
    independent = await state(second);
  const key = randomUUID(),
    result = ok(await restore(first, {}, { key }));
  const after = await state(first);
  assert.equal(result.id, first.p.id);
  assert.equal(after.participant.bookingStatus, 'BOOKED');
  assert.equal(after.participant.attendance, 'PENDING');
  assert.equal(after.participant.kind, before.participant.kind);
  assert.equal(after.participant.version, 3);
  assert.equal(after.lesson.version, before.lesson.version + 1);
  assert.equal(
    await db.sessionParticipant.count({ where: { sessionId: first.l.id, studentId: s.id } }),
    1,
  );
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual((await balance(s)).TRIAL, { remaining: 2, reserved: 1, available: 1 });
  assert.equal(after.task.status, 'DONE');
  assert.equal(after.task.reason, 'REBOOKED');
  assert.equal(after.task.rebookedToParticipantId, first.p.id);
  assert.equal(after.task.version, before.task.version + 1);
  assert.equal(
    after.logs.find((l) => l.action === 'RESTORE_BOOKING').after.followupTaskId,
    after.task.id,
  );
  // Both bookings share a student and subject; only the restored source may change.
  assert.deepEqual(await state(second), independent);
  assert.deepEqual(ok(await restore(first, {}, { key })), result);
  assert.deepEqual(await state(first), after);
  await rejected(first, 'VERSION_CONFLICT');
  await rejected(first, 'ALREADY_BOOKED', { expectedVersion: 3 });
  assert.equal(
    (await restore(first, { reason: 'Different request' }, { key })).data.code,
    'IDEMPOTENCY_CONFLICT',
  );
  passed(
    'restore: reuses the original row and funding card, reserves one credit and closes only its exact rebooking task with idempotent replay',
  );

  const scarce = await createStudent(),
    occupied = await book(scarce);
  await cancel(occupied);
  const elsewhere = await book(scarce, 'TRIAL', { courseId: otherCourseId });
  const elsewhereBefore = await state(elsewhere);
  await rejected(occupied, 'ENTITLEMENT_INSUFFICIENT');
  assert.deepEqual(await state(elsewhere), elsewhereBefore);
  const full = await book(await createStudent(), 'TRIAL', { capacity: 1 });
  await cancel(full);
  const replacement = await createStudent();
  ok(
    await req(a, `/sessions/${full.l.id}/participants`, {
      studentId: replacement.id,
      kind: 'TRIAL',
    }),
  );
  await rejected(full, 'SESSION_FULL');
  const overlapStudent = await createStudent();
  await grant(overlapStudent, 'TRIAL', 1);
  const overlap = await book(overlapStudent);
  await cancel(overlap);
  await book(overlapStudent, 'TRIAL', {
    courseId: otherCourseId,
    startsAt: overlap.l.startsAt,
    endsAt: overlap.l.endsAt,
  });
  await rejected(overlap, 'STUDENT_CONFLICT');
  passed(
    'restore: rechecks cross-subject available credits, capacity and time conflicts; failed restores keep the original cancellation and task open',
  );

  const converted = await createStudent(),
    convertedBooking = await book(converted);
  await cancel(convertedBooking);
  await grant(converted, 'REGULAR', 2);
  const existingRebooking = await task(convertedBooking);
  ok(await restore(convertedBooking));
  assert.equal((await task(convertedBooking)).rebookedToParticipantId, convertedBooking.p.id);
  assert.equal((await task(convertedBooking)).id, existingRebooking.id);
  assert.equal(
    (await db.student.findUniqueOrThrow({ where: { id: converted.id } })).type,
    'MEMBER',
  );
  assert.equal((await state(convertedBooking)).participant.kind, 'TRIAL');
  const regular = await book(converted, 'REGULAR');
  await cancel(regular);
  assert.equal(await task(regular), null);
  ok(await restore(regular));
  assert.equal(await task(regular), null);
  assert.deepEqual((await balance(converted)).REGULAR, { remaining: 2, reserved: 1, available: 1 });
  for (const patch of [{ purpose: 'FIRST_PURCHASE' }, { status: 'DONE', completedAt: now }]) {
    const x = await book(await createStudent());
    await cancel(x);
    const source = await task(x);
    await db.task.update({ where: { id: source.id }, data: patch });
    const saved = await task(x);
    ok(await restore(x));
    assert.deepEqual(await task(x), saved);
  }
  passed(
    'restore: purchasing before restoration does not switch cards or lose the existing source; absent, closed and non-rebooking tasks remain untouched',
  );

  const guarded = await book(await createStudent());
  await cancel(guarded);
  const saved = await state(guarded);
  for (const user of [b, t]) assert.equal((await restore(guarded, {}, {}, user)).status, 403);
  assert.equal((await restore(guarded, {}, { csrf: false })).status, 403);
  for (const body of [
    { kind: 'REGULAR' },
    { reason: '' },
    { reason: '  ' },
    { expectedVersion: 0 },
  ])
    assert.equal((await restore(guarded, body)).status, 400);
  assert.deepEqual(await state(guarded), saved);
  await db.student.update({ where: { id: guarded.s.id }, data: { guardianEmail: null } });
  assert.equal((await restore(guarded)).status, 400);
  assert.deepEqual(await state(guarded), saved);
  for (const [lessonPatch, participantPatch, code] of [
    [{ startsAt: now }, {}, 'SESSION_STARTED'],
    [{ status: 'CANCELLED' }, {}, 'SESSION_STARTED'],
    [{ feedbackSubmittedAt: now }, {}, 'SESSION_STARTED'],
    [{}, { attendance: 'ATTENDED' }, 'RESULT_ALREADY_SUBMITTED'],
    [{}, { attendance: 'NO_SHOW' }, 'RESULT_ALREADY_SUBMITTED'],
  ]) {
    const x = await book(await createStudent());
    await cancel(x);
    await db.classSession.update({ where: { id: x.l.id }, data: lessonPatch });
    await db.sessionParticipant.update({ where: { id: x.p.id }, data: participantPatch });
    await rejected(x, code);
  }
  const invalidOwner = await book(await createStudent());
  await cancel(invalidOwner);
  const wrongTask = await task(invalidOwner);
  await db.task.update({ where: { id: wrongTask.id }, data: { assigneeId: b.user.id } });
  const wrongBefore = await state(invalidOwner);
  assert.equal((await restore(invalidOwner)).status, 400);
  assert.deepEqual(await state(invalidOwner), wrongBefore);
  passed(
    'restore: ownership, contact, CSRF, DTO, active lesson, pending attendance and source ownership are enforced without side effects',
  );

  const failure = await book(await createStudent());
  await cancel(failure);
  const failureBefore = await state(failure),
    failureBalance = await balance(failure.s);
  const originalLog = teaching.log,
    failureKey = randomUUID();
  teaching.log = async function (...args) {
    await originalLog.apply(this, args);
    if (args[3] === 'RESTORE_BOOKING' && args[9] === failure.p.id)
      throw new Error('Injected failure after restore audit insert');
  };
  try {
    assert.equal((await restore(failure, {}, { key: failureKey })).status, 500);
  } finally {
    teaching.log = originalLog;
  }
  assert.deepEqual(await state(failure), failureBefore);
  assert.deepEqual(await balance(failure.s), failureBalance);
  assert.equal(
    await db.mutationReceipt.count({ where: { userId: a.user.id, key: failureKey } }),
    0,
  );
  ok(await restore(failure, {}, { key: failureKey }));
  passed(
    'restore: late failure rolls back occupancy, closed task/link, versions, audit and receipt; same-key retry succeeds',
  );

  const raceStudent = await createStudent(),
    x = await book(raceStudent);
  await cancel(x);
  const y = await book(raceStudent, 'TRIAL', { courseId: otherCourseId });
  await cancel(y);
  const race = await Promise.all([restore(x), restore(y)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  assert.equal(race.find((r) => r.status === 409).data.code, 'ENTITLEMENT_INSUFFICIENT');
  assert.deepEqual((await balance(raceStudent)).TRIAL, { remaining: 1, reserved: 1, available: 0 });
  assert.deepEqual([(await task(x)).status, (await task(y)).status].sort(), ['DONE', 'OPEN']);
  for (const sameKey of [true, false]) {
    const item = await book(await createStudent());
    await cancel(item);
    const requestKey = randomUUID();
    const responses = await Promise.all([
      restore(item, {}, { key: requestKey }),
      restore(item, {}, { key: sameKey ? requestKey : randomUUID() }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), sameKey ? [201, 201] : [201, 409]);
    const final = await state(item);
    assert.equal(final.participant.version, 3);
    assert.equal(final.logs.filter((l) => l.action === 'RESTORE_BOOKING').length, 1);
    assert.equal(
      await db.sessionParticipant.count({ where: { sessionId: item.l.id, studentId: item.s.id } }),
      1,
    );
  }
  passed(
    'restore: concurrent restorations cannot overbook the last credit or duplicate a participant, source closure or audit',
  );
}
