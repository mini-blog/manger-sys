import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Runs inside the entitlement suite's disposable PG and scoped fixture cleanup.
export async function verifyBookingCreate({
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
  write,
  ensureFollowup,
  passed,
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  let offset = 24;
  async function lesson(extra = {}) {
    offset += 2;
    return db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        capacity: 10,
        startsAt: new Date(now().getTime() + offset * 3600000),
        endsAt: new Date(now().getTime() + (offset + 1) * 3600000),
        ...extra,
      },
    });
  }
  const enrol = (u = a, extra = {}) =>
    student(u, {
      guardianName: 'Booking Parent',
      guardianEmail: 'booking@test.invalid',
      ...extra,
    });
  const book = (s, l, extra = {}, u = a, key = randomUUID()) =>
    req(u, `/sessions/${l.id}/participants`, { studentId: s.id, kind: 'TRIAL', ...extra }, { key });
  const grant = (s, bucket, quantity) =>
    req(a, '/entitlements/grants', {
      studentId: s.id,
      bucket,
      quantity,
      ...(bucket === 'REGULAR' ? { mode: 'CUSTOM' } : {}),
    }).then(ok);
  const summary = (s) => req(a, `/students/${s.id}/entitlements`).then((r) => ok(r, 200));
  const code = (r, expected) => {
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.code, expected);
  };

  const last = await enrol(),
    math = await lesson(),
    english = await lesson({ courseId: otherCourseId });
  const race = await Promise.all([book(last, math), book(last, english)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  code(
    race.find((r) => r.status === 409),
    'ENTITLEMENT_INSUFFICIENT',
  );
  assert.equal(await db.sessionParticipant.count({ where: { studentId: last.id } }), 1);
  assert.deepEqual((await summary(last)).balances.TRIAL, {
    remaining: 1,
    reserved: 1,
    available: 0,
  });
  assert.equal(
    await db.entitlementEntry.count({ where: { studentId: last.id, kind: 'CONSUMPTION' } }),
    0,
  );
  passed(
    'booking: cross-subject concurrent requests reserve the last trial once without consumption',
  );

  const member = await enrol();
  await grant(member, 'REGULAR', 1);
  const memberBefore = await db.student.findUniqueOrThrow({ where: { id: member.id } });
  assert.equal(memberBefore.firstEnrolledOn, null);
  const trial = await lesson(),
    regular = await lesson();
  ok(await book(member, trial));
  ok(await book(member, regular, { kind: 'REGULAR' }));
  code(await book(member, await lesson()), 'ENTITLEMENT_INSUFFICIENT');
  code(await book(member, await lesson(), { kind: 'REGULAR' }), 'ENTITLEMENT_INSUFFICIENT');
  await grant(member, 'TRIAL', 2);
  ok(await book(member, await lesson())); // Same subject may have several funded future trials.
  // An attended historical trial no longer disqualifies another funded booking.
  const historical = await lesson({
    startsAt: new Date(now().getTime() - 7200000),
    endsAt: new Date(now().getTime() - 3600000),
  });
  await db.sessionParticipant.create({
    data: { sessionId: historical.id, studentId: member.id, kind: 'TRIAL', attendance: 'ATTENDED' },
  });
  ok(await book(member, await lesson()));
  assert.equal(
    (
      await db.student.findUniqueOrThrow({ where: { id: member.id } })
    ).firstPurchasedAt.toISOString(),
    memberBefore.firstPurchasedAt.toISOString(),
  );
  const onlyRegular = await enrol(a, { giftTrialCredit: false });
  await grant(onlyRegular, 'REGULAR', 2);
  code(await book(onlyRegular, await lesson()), 'ENTITLEMENT_INSUFFICIENT');
  const unpaid = await enrol();
  await db.student.update({
    where: { id: unpaid.id },
    data: { firstEnrolledOn: new Date('2020-01-01') },
  });
  code(await book(unpaid, await lesson(), { kind: 'REGULAR' }), 'PURCHASE_REQUIRED');
  const regularRace = await enrol(a, { giftTrialCredit: false });
  await grant(regularRace, 'REGULAR', 1);
  const regularTargets = [await lesson(), await lesson({ courseId: otherCourseId })];
  const results = await Promise.all(
    regularTargets.map((l) => book(regularRace, l, { kind: 'REGULAR' })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.deepEqual((await summary(regularRace)).balances.REGULAR, {
    remaining: 1,
    reserved: 1,
    available: 0,
  });
  passed(
    'booking: purchased members can trial again; separate pools and first-purchase eligibility apply',
  );

  const guarded = await enrol(),
    target = await lesson();
  const key = randomUUID();
  const first = ok(await book(guarded, target, {}, a, key));
  assert.deepEqual(ok(await book(guarded, target, {}, a, key)), first);
  code(await book(guarded, target, { kind: 'REGULAR' }, a, key), 'IDEMPOTENCY_CONFLICT');
  code(await book(guarded, target), 'ALREADY_BOOKED');
  await db.sessionParticipant.update({
    where: { id: first.id },
    data: { bookingStatus: 'CANCELLED' },
  });
  const cancelled = await book(guarded, target, { kind: 'REGULAR' });
  code(cancelled, 'ALREADY_BOOKED');
  assert.match(cancelled.data.message, /Restore/);
  assert.equal(
    (await db.sessionParticipant.findUniqueOrThrow({ where: { id: first.id } })).kind,
    'TRIAL',
  );
  const noContact = await student(a, { guardianName: 'Parent without contact' });
  assert.equal((await book(noContact, await lesson())).status, 400);
  assert.equal((await book(guarded, await lesson(), {}, b)).status, 403);
  assert.equal((await book(guarded, await lesson(), {}, t)).status, 403);
  code(await book(guarded, await lesson({ status: 'CANCELLED' })), 'SESSION_STARTED');
  code(await book(guarded, historical), 'SESSION_STARTED');
  const full = await lesson({ capacity: 1 });
  ok(await book(guarded, full));
  code(await book(await enrol(), full), 'SESSION_FULL');
  await grant(guarded, 'TRIAL', 1);
  code(
    await book(
      guarded,
      await lesson({ courseId: otherCourseId, startsAt: full.startsAt, endsAt: full.endsAt }),
    ),
    'STUDENT_CONFLICT',
  );
  ok(
    await book(
      guarded,
      await lesson({ startsAt: full.endsAt, endsAt: new Date(full.endsAt.getTime() + 3600000) }),
    ),
  );
  passed(
    'booking: permissions, contact, capacity, future lessons, overlap, cancelled records and idempotency enforced',
  );

  const followStudent = await enrol();
  await grant(followStudent, 'TRIAL', 8);
  async function follow(s = followStudent, owner = a, purpose = 'REBOOKING', subject = courseId) {
    const l = await lesson({ courseId: subject });
    const p = await db.sessionParticipant.create({
      data: { sessionId: l.id, studentId: s.id, kind: 'TRIAL', bookingStatus: 'CANCELLED' },
    });
    const task = await write(owner, (tx) => ensureFollowup(tx, p.id, 'CANCELLED', now()));
    if (purpose !== 'REBOOKING')
      return db.task.update({ where: { id: task.id }, data: { purpose } });
    return task;
  }
  const source = await follow(),
    independent = await follow(),
    sales = await follow(followStudent, a, 'FIRST_PURCHASE');
  ok(await book(followStudent, await lesson()));
  for (const task of [source, independent, sales])
    assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'OPEN');
  const linkedLesson = await lesson(),
    linkedKey = randomUUID();
  const linked = ok(
    await book(followStudent, linkedLesson, { sourceRebookingTaskId: source.id }, a, linkedKey),
  );
  const closed = await db.task.findUniqueOrThrow({ where: { id: source.id } });
  assert.equal(closed.status, 'DONE');
  assert.equal(closed.reason, 'REBOOKED');
  assert.equal(closed.rebookedToParticipantId, linked.id);
  const log = await db.scheduleChange.findFirstOrThrow({
    where: { participantId: linked.id, action: 'ADD_STUDENT' },
  });
  assert.equal(log.after.sourceRebookingTaskId, source.id);
  assert.deepEqual(
    ok(await book(followStudent, linkedLesson, { sourceRebookingTaskId: source.id }, a, linkedKey)),
    linked,
  );
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: source.id } })).version,
    closed.version,
  );
  for (const task of [independent, sales])
    assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'OPEN');
  passed(
    'booking: explicit rebooking source closes once with audit linkage; unrelated follow-ups remain open',
  );

  const foreignStudent = await enrol(b),
    otherStudent = await enrol();
  const foreignSource = await follow(foreignStudent, b),
    wrongStudent = await follow(otherStudent),
    wrongSubject = await follow(followStudent, a, 'REBOOKING', otherCourseId);
  for (const [sourceId, kind, expected] of [
    [foreignSource.id, 'TRIAL', 403],
    [sales.id, 'TRIAL', 409],
    [wrongStudent.id, 'TRIAL', 400],
    [wrongSubject.id, 'TRIAL', 400],
    [source.id, 'TRIAL', 409],
    [independent.id, 'REGULAR', 409],
    ['missing-task', 'TRIAL', 404],
    ['', 'TRIAL', 400],
    [null, 'TRIAL', 400],
  ]) {
    const l = await lesson(),
      failureKey = randomUUID();
    const before = await db.task.findUnique({ where: { id: sourceId ?? 'missing-task' } });
    const result = await book(
      followStudent,
      l,
      { kind, sourceRebookingTaskId: sourceId },
      a,
      failureKey,
    );
    assert.equal(result.status, expected, JSON.stringify(result));
    assert.equal(await db.sessionParticipant.count({ where: { sessionId: l.id } }), 0);
    assert.equal(
      (await db.classSession.findUniqueOrThrow({ where: { id: l.id } })).version,
      l.version,
    );
    assert.equal(await db.scheduleChange.count({ where: { sessionId: l.id } }), 0);
    assert.equal(
      await db.mutationReceipt.count({ where: { userId: a.user.id, key: failureKey } }),
      0,
    );
    if (before) assert.deepEqual(await db.task.findUnique({ where: { id: before.id } }), before);
  }
  // Two funded requests racing to resolve one source cannot both persist a reservation.
  const rebookTargets = [await lesson(), await lesson()];
  const rebookRace = await Promise.all(
    rebookTargets.map((l) => book(followStudent, l, { sourceRebookingTaskId: independent.id })),
  );
  assert.deepEqual(rebookRace.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    await db.sessionParticipant.count({
      where: { sessionId: { in: rebookTargets.map((l) => l.id) } },
    }),
    1,
  );
  passed(
    'booking: foreign/invalid sources and competing rebookings roll back reservations, versions, receipts and logs',
  );
}
