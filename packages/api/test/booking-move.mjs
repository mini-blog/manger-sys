import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyBookingMove({
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
  let hour = 500;
  const createStudent = () =>
    student(a, {
      name: 'Move student',
      guardianName: 'Parent',
      guardianEmail: 'parent@test.invalid',
    });
  const grant = async (s, bucket, quantity = 1) =>
    ok(
      await req(a, '/entitlements/grants', {
        studentId: s.id,
        bucket,
        quantity,
        ...(bucket === 'REGULAR' ? { mode: 'CUSTOM' } : {}),
      }),
    );
  const lesson = (extra = {}) => {
    hour += 2;
    return db.classSession.create({
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
  };
  const book = async (s, kind = 'TRIAL', l = undefined, extra = {}) => {
    l ??= await lesson();
    const p = ok(
      await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind, ...extra }),
    );
    return { s, l, p };
  };
  const cancel = async (x) =>
    ok(
      await req(a, `/participants/${x.p.id}/cancel`, {
        expectedVersion: 1,
        reason: 'Family unavailable',
      }),
    );
  const cancelled = async (s) => {
    const x = await book(s);
    await cancel(x);
    return x;
  };
  const task = (x) =>
    db.task.findFirst({ where: { type: 'TRIAL_FOLLOWUP', participantId: x.p.id } });
  const participant = (x) => db.sessionParticipant.findUniqueOrThrow({ where: { id: x.p.id } });
  const balance = async (s) => ok(await req(a, `/students/${s.id}/entitlements`), 200).balances;
  const move = (x, target, body = {}, options = {}, user = a) =>
    req(
      user,
      `/participants/${x.p.id}/move`,
      {
        expectedVersion: 1,
        reason: 'Family requested a different time',
        targetSessionId: target.id,
        ...body,
      },
      options,
    );
  // Snapshot both rosters, all of this student's follow-ups, ledger and audit, not just the source.
  const state = async (x, target) => ({
    lessons: await db.classSession.findMany({
      where: { id: { in: [x.l.id, target.id] } },
      orderBy: { id: 'asc' },
    }),
    participants: await db.sessionParticipant.findMany({
      where: { sessionId: { in: [x.l.id, target.id] } },
      orderBy: { id: 'asc' },
    }),
    tasks: await db.task.findMany({
      where: {
        OR: [{ participant: { studentId: x.s.id } }, { sessionId: { in: [x.l.id, target.id] } }],
      },
      orderBy: { id: 'asc' },
    }),
    logs: await db.scheduleChange.findMany({
      where: { OR: [{ studentId: x.s.id }, { sessionId: { in: [x.l.id, target.id] } }] },
      orderBy: { id: 'asc' },
    }),
    entries: await db.entitlementEntry.findMany({
      where: { studentId: x.s.id },
      orderBy: { id: 'asc' },
    }),
    communications: await db.communicationLog.findMany({
      where: { studentId: x.s.id },
      orderBy: { id: 'asc' },
    }),
  });
  async function rejected(x, target, status, code, body = {}, user = a, options = {}) {
    const before = await state(x, target),
      key = randomUUID();
    const result = await move(x, target, body, { key, ...options }, user);
    assert.equal(result.status, status, JSON.stringify(result));
    if (code) assert.equal(result.data.code, code);
    assert.deepEqual(await state(x, target), before);
    assert.equal(await db.mutationReceipt.count({ where: { key } }), 0);
  }

  const first = await book(await createStudent());
  // Overlap with the outgoing booking is allowed; it is the only excluded booking.
  const target = await lesson({ startsAt: first.l.startsAt, endsAt: first.l.endsAt });
  const before = await state(first, target),
    credits = await balance(first.s),
    key = randomUUID();
  assert.equal(credits.TRIAL.available, 0);
  const next = ok(await move(first, target, {}, { key }));
  const after = await state(first, target);
  assert.equal((await participant(first)).bookingStatus, 'CANCELLED');
  const moved = await db.sessionParticipant.findUniqueOrThrow({ where: { id: next.id } });
  assert.equal(moved.sessionId, target.id);
  assert.equal(moved.kind, 'TRIAL');
  assert.equal(moved.bookingStatus, 'BOOKED');
  assert.equal(moved.attendance, 'PENDING');
  assert.deepEqual(await balance(first.s), credits);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.tasks, before.tasks);
  for (const l of after.lessons)
    assert.equal(l.version, before.lessons.find((v) => v.id === l.id).version + 1);
  const logs = after.logs.filter((v) => v.requestKey === key);
  assert.equal(logs.length, 2);
  for (const log of logs) {
    assert.equal(log.before.participantId, first.p.id);
    assert.equal(log.after.participantId, next.id);
    assert.equal(log.after.kind, 'TRIAL');
    assert.equal(log.after.participantCount, 1);
    assert.equal(log.after.version, target.version + 1);
    assert.deepEqual(log.after.followupChanges, []);
    assert.equal(log.actorId, a.user.id);
  }
  const outgoing = logs.find((v) => v.action === 'MOVE_STUDENT');
  const incoming = logs.find((v) => v.action === 'MOVE_STUDENT_IN');
  assert.equal(outgoing.sessionId, first.l.id);
  assert.equal(outgoing.targetSessionId, target.id);
  assert.equal(outgoing.participantId, first.p.id);
  assert.equal(incoming.sessionId, target.id);
  assert.equal(incoming.targetSessionId, first.l.id);
  assert.equal(incoming.participantId, next.id);
  for (const l of [first.l, target]) {
    const history = ok(await req(a, `/sessions/${l.id}/changes`), 200);
    assert(history.items.some((v) => v.id === outgoing.id));
    assert(history.items.some((v) => v.id === incoming.id));
  }
  assert.deepEqual(ok(await move(first, target, {}, { key })), next);
  assert.deepEqual(await state(first, target), after);
  assert.equal(
    (await move(first, target, { reason: 'Changed' }, { key })).data.code,
    'IDEMPOTENCY_CONFLICT',
  );
  await rejected(first, target, 409, 'VERSION_CONFLICT');
  await rejected(first, target, 409, 'BOOKING_CANCELLED', { expectedVersion: 2 });
  // Moving back restores the existing cancelled row without duplicating it.
  assert.equal(ok(await move({ ...first, l: target, p: next }, first.l)).id, first.p.id);
  assert.equal((await participant(first)).version, 3);
  assert.equal(await db.sessionParticipant.count({ where: { studentId: first.s.id } }), 2);
  assert.deepEqual(await balance(first.s), credits);
  passed(
    'move: zero available credits still allow a net-zero move; both directions audited, original card retained, retries and move-back reuse rows',
  );

  const linkedStudent = await createStudent();
  const unrelated = [];
  for (const purpose of ['REBOOKING', 'FIRST_PURCHASE', 'MEMBER_CARE']) {
    const item = await cancelled(linkedStudent);
    const followup = await task(item);
    unrelated.push(await db.task.update({ where: { id: followup.id }, data: { purpose } }));
  }
  const destination = await cancelled(linkedStudent),
    origin = await cancelled(linkedStudent);
  const originTask = await task(origin),
    targetTask = await task(destination);
  const communication = await db.communicationLog.create({
    data: {
      studentId: linkedStudent.id,
      taskId: originTask.id,
      participantId: origin.p.id,
      guardianNameSnapshot: 'Parent',
      channel: 'PHONE',
      content: 'Family asked to change time.',
      occurredAt: now,
      createdBy: a.user.id,
    },
  });
  ok(
    await req(a, `/participants/${origin.p.id}/restore`, {
      expectedVersion: 2,
      reason: 'Confirmed',
    }),
  );
  const resolved = await task(origin);
  const restored = ok(await move(origin, destination.l, { expectedVersion: 3 }));
  assert.equal(restored.id, destination.p.id);
  assert.equal((await participant(destination)).version, 3);
  const retargeted = await task(origin),
    closed = await task(destination);
  assert.equal(retargeted.rebookedToParticipantId, destination.p.id);
  assert.equal(retargeted.version, resolved.version + 1);
  assert.deepEqual(retargeted.sourceSnapshot, resolved.sourceSnapshot);
  assert.deepEqual(retargeted.completedAt, resolved.completedAt);
  assert.equal(closed.status, 'DONE');
  assert.equal(closed.reason, 'REBOOKED');
  assert.equal(closed.rebookedToParticipantId, destination.p.id);
  assert.equal(closed.version, targetTask.version + 1);
  const finalLesson = await lesson();
  const finalBooking = ok(await move(destination, finalLesson, { expectedVersion: 3 }));
  for (const item of [origin, destination])
    assert.equal((await task(item)).rebookedToParticipantId, finalBooking.id);
  for (const u of unrelated) assert.deepEqual(await db.task.findUnique({ where: { id: u.id } }), u);
  assert.deepEqual(
    await db.communicationLog.findUnique({ where: { id: communication.id } }),
    communication,
  );
  assert.deepEqual((await balance(linkedStudent)).TRIAL, {
    remaining: 1,
    reserved: 1,
    available: 0,
  });
  // A legacy OPEN source is also closed precisely, even if it was left open while booked.
  const legacy = await cancelled(await createStudent()),
    legacyTask = await task(legacy);
  ok(
    await req(a, `/participants/${legacy.p.id}/restore`, {
      expectedVersion: 2,
      reason: 'Confirmed',
    }),
  );
  await db.task.update({
    where: { id: legacyTask.id },
    data: { status: 'OPEN', rebookedToParticipantId: null, completedAt: null },
  });
  const legacyNext = ok(await move(legacy, await lesson(), { expectedVersion: 3 }));
  assert.equal((await task(legacy)).rebookedToParticipantId, legacyNext.id);
  assert.equal((await task(legacy)).status, 'DONE');
  passed(
    'move: restores a cancelled target, closes only exact source/target rebooking tasks and forwards resolved links across repeated moves without changing unrelated tasks or communications',
  );

  const member = await createStudent(),
    originalTrial = await cancelled(member);
  await grant(member, 'REGULAR');
  const regular = await book(member, 'REGULAR', undefined, {
    sourceRebookingTaskId: (await task(originalTrial)).id,
  });
  const regularBalance = await balance(member);
  const regularNext = ok(await move(regular, await lesson()));
  assert.equal((await task(originalTrial)).rebookedToParticipantId, regularNext.id);
  assert.equal(
    (await db.sessionParticipant.findUniqueOrThrow({ where: { id: regularNext.id } })).kind,
    'REGULAR',
  );
  assert.deepEqual(await balance(member), regularBalance);
  const trial = await book(member),
    trialNext = ok(await move(trial, await lesson()));
  assert.equal(
    (await db.sessionParticipant.findUniqueOrThrow({ where: { id: trialNext.id } })).kind,
    'TRIAL',
  );
  assert.equal(await task(trial), null);
  assert.equal(await task({ p: trialNext }), null);
  assert.equal((await db.student.findUniqueOrThrow({ where: { id: member.id } })).type, 'MEMBER');
  passed(
    'move: regular cards and member trial cards retain their pool and identity; a prior rebooking link follows a regular-card move without generating sales tasks',
  );

  const guarded = await book(await createStudent()),
    available = await lesson();
  await rejected(guarded, guarded.l, 409, 'COURSE_MISMATCH');
  await rejected(guarded, await lesson({ courseId: otherCourseId }), 409, 'COURSE_MISMATCH');
  const full = await lesson({ capacity: 1 });
  await book(await createStudent(), 'TRIAL', full);
  await rejected(guarded, full, 409, 'SESSION_FULL');
  await grant(guarded.s, 'TRIAL');
  const overlap = await lesson({
    courseId: otherCourseId,
    startsAt: available.startsAt,
    endsAt: available.endsAt,
  });
  await book(guarded.s, 'TRIAL', overlap);
  await rejected(guarded, available, 409, 'STUDENT_CONFLICT');
  for (const user of [b, t]) await rejected(guarded, full, 403, undefined, {}, user);
  await rejected(guarded, full, 401, undefined, {}, null);
  await rejected(guarded, full, 403, undefined, {}, a, { csrf: false });
  for (const body of [
    { kind: 'REGULAR' },
    { sourceRebookingTaskId: originTask.id },
    { reason: '' },
    { reason: ' ' },
    { expectedVersion: 0 },
    { targetSessionId: '' },
  ]) {
    await rejected(guarded, full, 400, undefined, body);
  }
  const contact = await book(await createStudent()),
    contactTarget = await lesson();
  await db.student.update({ where: { id: contact.s.id }, data: { guardianEmail: null } });
  await rejected(contact, contactTarget, 400);
  for (const patch of [{ startsAt: now }, { status: 'CANCELLED' }, { feedbackSubmittedAt: now }]) {
    const x = await book(await createStudent()),
      dest = await lesson();
    await db.classSession.update({ where: { id: dest.id }, data: patch });
    await rejected(x, dest, 409, 'SESSION_STARTED');
    const y = await book(await createStudent()),
      fresh = await lesson();
    await db.classSession.update({ where: { id: y.l.id }, data: patch });
    await rejected(y, fresh, 409, 'SESSION_STARTED');
  }
  for (const attendance of ['ATTENDED', 'NO_SHOW']) {
    const x = await book(await createStudent());
    await db.sessionParticipant.update({ where: { id: x.p.id }, data: { attendance } });
    await rejected(x, await lesson(), 409, 'RESULT_ALREADY_SUBMITTED');
  }
  for (const patch of [
    { bookingStatus: 'BOOKED' },
    { attendance: 'ATTENDED' },
    { attendance: 'NO_SHOW' },
    { kind: 'REGULAR' },
  ]) {
    const s = await createStudent(),
      dest = await cancelled(s),
      x = await book(s);
    await db.sessionParticipant.update({ where: { id: dest.p.id }, data: patch });
    await rejected(x, dest.l, 409, 'ALREADY_BOOKED');
  }
  const invalid = await cancelled(await createStudent()),
    invalidTask = await task(invalid);
  const invalidOrigin = await book(invalid.s);
  await db.task.update({ where: { id: invalidTask.id }, data: { assigneeId: b.user.id } });
  await rejected(invalidOrigin, invalid.l, 409, 'FOLLOWUP_DATA_INVALID');
  passed(
    'move: full, conflicting, cross-subject, incompatible target, stale source, contact, auth, CSRF and malformed requests preserve both rosters, tasks, ledger and receipts',
  );

  const rollbackStudent = await createStudent(),
    rollbackTarget = await cancelled(rollbackStudent),
    rollbackSource = await cancelled(rollbackStudent);
  ok(
    await req(a, `/participants/${rollbackSource.p.id}/restore`, {
      expectedVersion: 2,
      reason: 'Confirmed',
    }),
  );
  const rollbackBefore = await state(rollbackSource, rollbackTarget.l),
    rollbackBalance = await balance(rollbackStudent);
  const originalLog = teaching.log,
    failureKey = randomUUID();
  teaching.log = async function (...args) {
    await originalLog.apply(this, args);
    if (args[3] === 'MOVE_STUDENT_IN' && args[9] === rollbackTarget.p.id)
      throw new Error('Injected failure after destination move audit');
  };
  try {
    assert.equal(
      (await move(rollbackSource, rollbackTarget.l, { expectedVersion: 3 }, { key: failureKey }))
        .status,
      500,
    );
  } finally {
    teaching.log = originalLog;
  }
  assert.deepEqual(await state(rollbackSource, rollbackTarget.l), rollbackBefore);
  assert.deepEqual(await balance(rollbackStudent), rollbackBalance);
  assert.equal(await db.mutationReceipt.count({ where: { key: failureKey } }), 0);
  assert.equal(
    ok(await move(rollbackSource, rollbackTarget.l, { expectedVersion: 3 }, { key: failureKey }))
      .id,
    rollbackTarget.p.id,
  );
  passed(
    'move: late audit failure rolls back both participants, lesson versions, task closures/forwarded links and receipt; same-key retry succeeds',
  );

  for (const mode of ['same-key', 'different-key', 'different-target']) {
    const source = await book(await createStudent()),
      dest = await lesson(),
      other = mode === 'different-target' ? await lesson() : dest;
    const requestKey = randomUUID();
    const responses = await Promise.all([
      move(source, dest, {}, { key: requestKey }),
      move(source, other, {}, { key: mode === 'same-key' ? requestKey : randomUUID() }),
    ]);
    assert.deepEqual(
      responses.map((r) => r.status).sort(),
      mode === 'same-key' ? [201, 201] : [201, 409],
    );
    if (mode === 'same-key') assert.deepEqual(responses[0].data, responses[1].data);
    assert.equal(
      await db.sessionParticipant.count({
        where: { studentId: source.s.id, bookingStatus: 'BOOKED' },
      }),
      1,
    );
    assert.equal(
      await db.scheduleChange.count({
        where: { studentId: source.s.id, action: { in: ['MOVE_STUDENT', 'MOVE_STUDENT_IN'] } },
      }),
      2,
    );
    assert.deepEqual((await balance(source.s)).TRIAL, { remaining: 1, reserved: 1, available: 0 });
  }
  const one = await book(await createStudent()),
    two = await book(await createStudent()),
    lastSeat = await lesson({ capacity: 1 });
  const race = await Promise.all([move(one, lastSeat), move(two, lastSeat)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  assert.equal(race.find((r) => r.status === 409).data.code, 'SESSION_FULL');
  for (const [i, source] of [one, two].entries()) {
    assert.equal(
      (await participant(source)).bookingStatus,
      race[i].status === 201 ? 'CANCELLED' : 'BOOKED',
    );
    assert.deepEqual((await balance(source.s)).TRIAL, { remaining: 1, reserved: 1, available: 0 });
  }
  const creditRace = await book(await createStudent()),
    moveTarget = await lesson(),
    newTarget = await lesson({ courseId: otherCourseId });
  const [movedResponse, addedResponse] = await Promise.all([
    move(creditRace, moveTarget),
    req(a, `/sessions/${newTarget.id}/participants`, { studentId: creditRace.s.id, kind: 'TRIAL' }),
  ]);
  ok(movedResponse);
  assert.equal(addedResponse.status, 409);
  assert.equal(addedResponse.data.code, 'ENTITLEMENT_INSUFFICIENT');
  passed(
    'move: concurrent retries, competing targets, last-seat races and new-booking races cannot duplicate a move or free an extra credit',
  );
}
