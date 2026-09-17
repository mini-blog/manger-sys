import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// The parent entitlement runner supplies a disposable PG, fixed Clock and scoped cleanup.
export async function verifyBookingCancel({
  db,
  req,
  ok,
  student,
  a,
  b,
  t,
  courseId,
  groupId,
  now,
  passed,
  teaching,
  write,
  ensureFollowup,
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  let offset = 24;
  const createStudent = () =>
    student(a, {
      name: 'Cancellation student',
      guardianName: 'Parent',
      guardianEmail: 'parent@test.invalid',
    });
  async function book(s, kind = 'TRIAL') {
    offset += 2;
    const l = await db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        capacity: 10,
        startsAt: new Date(now.getTime() + offset * 3600000),
        endsAt: new Date(now.getTime() + (offset + 1) * 3600000),
      },
    });
    const p = ok(await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind }));
    return { p, l };
  }
  const cancel = (p, body = {}, options = {}, u = a) =>
    req(
      u,
      `/participants/${p.id}/cancel`,
      {
        expectedVersion: 1,
        reason: 'Family unavailable',
        ...body,
      },
      options,
    );
  const balance = async (s) => ok(await req(a, `/students/${s.id}/entitlements`), 200).balances;
  const grant = async (s, bucket, quantity) =>
    ok(
      await req(a, '/entitlements/grants', {
        studentId: s.id,
        bucket,
        quantity,
        ...(bucket === 'REGULAR' ? { mode: 'CUSTOM' } : {}),
      }),
    );
  const task = (p) => db.task.findFirst({ where: { type: 'TRIAL_FOLLOWUP', participantId: p.id } });
  const logs = (p) =>
    db.scheduleChange.findMany({ where: { participantId: p.id, action: 'CANCEL_BOOKING' } });
  const ledger = (s) =>
    db.entitlementEntry.findMany({ where: { studentId: s.id }, orderBy: { id: 'asc' } });
  const state = async ({ p, l }) => ({
    participant: await db.sessionParticipant.findUniqueOrThrow({ where: { id: p.id } }),
    lesson: await db.classSession.findUniqueOrThrow({ where: { id: l.id } }),
    task: await task(p),
    logs: await logs(p),
  });
  const reject = (r, code) => {
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.code, code);
  };

  const s = await createStudent();
  await grant(s, 'TRIAL', 2);
  const one = await book(s),
    other = await book(s),
    old = await book(s);
  ok(await cancel(old.p));
  const unrelated = await task(old.p),
    otherBefore = await state(other);
  const ledgerBefore = await ledger(s),
    before = await state(one),
    key = randomUUID();
  assert.deepEqual((await balance(s)).TRIAL, { remaining: 3, reserved: 2, available: 1 });
  const result = ok(await cancel(one.p, {}, { key }));
  const after = await state(one);
  assert.deepEqual(await ledger(s), ledgerBefore);
  assert.deepEqual((await balance(s)).TRIAL, { remaining: 3, reserved: 1, available: 2 });
  assert.deepEqual(await state(other), otherBefore);
  assert.deepEqual(await db.task.findUnique({ where: { id: unrelated.id } }), unrelated);
  assert.equal(after.participant.bookingStatus, 'CANCELLED');
  assert.equal(after.participant.attendance, 'PENDING');
  assert.equal(after.participant.kind, 'TRIAL');
  assert.equal(after.participant.version, before.participant.version + 1);
  assert.equal(after.lesson.version, before.lesson.version + 1);
  assert.equal(after.task.purpose, 'REBOOKING');
  assert.equal(after.task.assigneeId, a.user.id);
  assert.equal(after.task.reason, 'CANCELLED');
  assert.equal(after.task.status, 'OPEN');
  assert.equal(after.task.sourceSnapshot.participantVersion, after.participant.version);
  assert.equal(after.task.sourceSnapshot.startsAt, one.l.startsAt.toISOString());
  assert.equal(after.task.dueAt.toISOString(), '2028-09-13T07:00:00.000Z');
  assert.equal(after.logs.length, 1);
  assert.equal(after.logs[0].after.followupTaskId, after.task.id);
  assert.equal(after.logs[0].after.kind, 'TRIAL');
  assert.equal((await req(b, `/tasks/${after.task.id}`)).status, 403);
  assert.equal((await req(t, `/tasks/${after.task.id}`)).status, 403);
  assert.deepEqual(ok(await cancel(one.p, {}, { key })), result);
  assert.deepEqual(await state(one), after);
  reject(await cancel(one.p, { reason: 'Changed reason' }, { key }), 'IDEMPOTENCY_CONFLICT');
  reject(await cancel(one.p), 'VERSION_CONFLICT');
  reject(await cancel(one.p, { expectedVersion: 2 }), 'BOOKING_CANCELLED');
  assert.equal((await cancel(one.p, {}, { key }, b)).status, 403);
  passed(
    'cancel: releases only its reservation, preserves ledger and other bookings/tasks, records private rebooking with replay protection',
  );

  const member = await createStudent();
  await grant(member, 'REGULAR', 2);
  const trialCard = await book(member),
    regularCard = await book(member, 'REGULAR');
  const memberLedger = await ledger(member);
  ok(await cancel(trialCard.p));
  assert.deepEqual((await balance(member)).TRIAL, { remaining: 1, reserved: 0, available: 1 });
  assert.deepEqual((await balance(member)).REGULAR, { remaining: 2, reserved: 1, available: 1 });
  ok(await cancel(regularCard.p));
  assert.deepEqual((await balance(member)).REGULAR, { remaining: 2, reserved: 0, available: 2 });
  assert.deepEqual(await ledger(member), memberLedger);
  assert.equal(await task(trialCard.p), null);
  assert.equal(await task(regularCard.p), null);
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: member.id } })).type, 'MEMBER');
  passed(
    'cancel: member identity is preserved for either funding card without a trial-student follow-up',
  );

  const communication = await db.communicationLog.create({
    data: {
      studentId: s.id,
      taskId: after.task.id,
      participantId: one.p.id,
      guardianNameSnapshot: 'Parent',
      channel: 'IN_PERSON',
      content: 'Family contacted',
      createdBy: a.user.id,
      occurredAt: now,
    },
  });
  await db.task.update({
    where: { id: after.task.id },
    data: {
      status: 'DONE',
      completedAt: now,
      version: { increment: 1 },
    },
  });
  const handled = await task(one.p);
  await write(a, (tx) => ensureFollowup(tx, one.p.id, 'CANCELLED', now));
  assert.deepEqual(await task(one.p), handled); // Same source event stays handled.
  ok(
    await req(a, `/participants/${one.p.id}/restore`, {
      expectedVersion: 2,
      reason: 'Family confirmed',
    }),
  );
  ok(await cancel(one.p, { expectedVersion: 3, reason: 'Family unavailable again' }));
  const reopened = await task(one.p);
  assert.equal(reopened.id, handled.id);
  assert.equal(reopened.status, 'OPEN');
  assert.equal(reopened.purpose, 'REBOOKING');
  assert.equal(reopened.sourceSnapshot.participantVersion, 4);
  assert.equal(reopened.version, handled.version + 1);
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.rebookedToParticipantId, null);
  assert.equal(reopened.resolvedByEntitlementEntryId, null);
  assert.deepEqual(
    await db.communicationLog.findUnique({ where: { id: communication.id } }),
    communication,
  );
  assert.deepEqual(await db.task.findUnique({ where: { id: unrelated.id } }), unrelated);
  assert.equal(await db.task.count({ where: { participantId: one.p.id } }), 1);
  passed(
    'cancel: a later cancellation reopens only the same source task; repeated event delivery and communication history stay unchanged',
  );

  const guarded = await book(await createStudent());
  const guardedBefore = await state(guarded);
  assert.equal((await cancel(guarded.p, {}, {}, b)).status, 403);
  assert.equal((await cancel(guarded.p, {}, {}, t)).status, 403);
  assert.equal((await cancel(guarded.p, {}, { csrf: false })).status, 403);
  for (const body of [
    { reason: '' },
    { reason: '  ' },
    { expectedVersion: 0 },
    { kind: 'REGULAR' },
  ])
    assert.equal((await cancel(guarded.p, body)).status, 400);
  reject(await cancel(guarded.p, { expectedVersion: 99 }), 'VERSION_CONFLICT');
  assert.deepEqual(await state(guarded), guardedBefore);
  for (const [lessonPatch, participantPatch, code] of [
    [{ startsAt: now }, {}, 'SESSION_STARTED'],
    [{ status: 'CANCELLED' }, {}, 'SESSION_STARTED'],
    [{ feedbackSubmittedAt: now }, {}, 'SESSION_STARTED'],
    [{}, { attendance: 'ATTENDED' }, 'RESULT_ALREADY_SUBMITTED'],
    [{}, { attendance: 'NO_SHOW' }, 'RESULT_ALREADY_SUBMITTED'],
  ]) {
    const test = await book(await createStudent());
    await db.classSession.update({ where: { id: test.l.id }, data: lessonPatch });
    await db.sessionParticipant.update({ where: { id: test.p.id }, data: participantPatch });
    const saved = await state(test),
      attempt = randomUUID();
    reject(await cancel(test.p, {}, { key: attempt }), code);
    assert.deepEqual(await state(test), saved);
    assert.equal(await db.mutationReceipt.count({ where: { userId: a.user.id, key: attempt } }), 0);
  }
  passed(
    'cancel: rejects foreign/teacher/CSRF, invalid input, stale versions, started/cancelled lessons and recorded attendance without side effects',
  );

  const rollbackStudent = await createStudent(),
    rollback = await book(rollbackStudent);
  const rollbackBefore = await state(rollback),
    rollbackBalance = await balance(rollbackStudent);
  const originalLog = teaching.log,
    failureKey = randomUUID();
  teaching.log = async function (...args) {
    await originalLog.apply(this, args);
    if (args[3] === 'CANCEL_BOOKING' && args[9] === rollback.p.id)
      throw new Error('Injected failure after cancellation audit insert');
  };
  try {
    assert.equal((await cancel(rollback.p, {}, { key: failureKey })).status, 500);
  } finally {
    teaching.log = originalLog;
  }
  assert.deepEqual(await state(rollback), rollbackBefore);
  assert.deepEqual(await balance(rollbackStudent), rollbackBalance);
  assert.equal(
    await db.mutationReceipt.count({ where: { userId: a.user.id, key: failureKey } }),
    0,
  );
  ok(await cancel(rollback.p, {}, { key: failureKey }));
  assert.equal((await logs(rollback.p)).length, 1);
  passed(
    'cancel: late failure rolls back reservation, task, lesson version, audit and receipt; same key can then succeed',
  );

  for (const sameKey of [true, false]) {
    const item = await book(await createStudent()),
      requestKey = randomUUID();
    const results = await Promise.all([
      cancel(item.p, {}, { key: requestKey }),
      cancel(item.p, {}, { key: sameKey ? requestKey : randomUUID() }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), sameKey ? [201, 201] : [201, 409]);
    const final = await state(item);
    assert.equal(final.participant.version, 2);
    assert.equal(final.logs.length, 1);
    assert.equal(await db.task.count({ where: { participantId: item.p.id } }), 1);
    assert.equal(await db.entitlementEntry.count({ where: { participantId: item.p.id } }), 0);
  }
  passed(
    'cancel: concurrent retries and distinct requests produce exactly one cancellation, one follow-up and one audit',
  );
}
