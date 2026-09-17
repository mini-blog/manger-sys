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
    target = await lesson({ capacity: 1 });
  const key = randomUUID(),
    first = ok(await book(guarded, target, {}, a, key));
  assert.deepEqual(ok(await book(guarded, target, {}, a, key)), first);
  code(await book(guarded, target, { kind: 'REGULAR' }, a, key), 'IDEMPOTENCY_CONFLICT');
  code(await book(guarded, target), 'ALREADY_BOOKED');
  const noContact = await student(a, {});
  ok(await book(noContact, target)); // Over capacity and missing contact are permitted.
  assert.equal((await book(guarded, await lesson(), {}, b)).status, 403);
  assert.equal((await book(guarded, await lesson(), {}, t)).status, 403);
  code(await book(guarded, await lesson({ status: 'CANCELLED' })), 'SESSION_STARTED');
  code(await book(guarded, historical), 'SESSION_STARTED');
  await grant(guarded, 'TRIAL', 2);
  code(
    await book(
      guarded,
      await lesson({ courseId: otherCourseId, startsAt: target.startsAt, endsAt: target.endsAt }),
    ),
    'STUDENT_CONFLICT',
  );
  ok(
    await book(
      guarded,
      await lesson({
        startsAt: target.endsAt,
        endsAt: new Date(target.endsAt.getTime() + 3600000),
      }),
    ),
  );
  const tasks = await db.task.findMany({ where: { participantId: first.id } });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].type, 'TRIAL_FEEDBACK');
  assert.equal(tasks[0].assigneeId, t.user.id);
  assert.equal(tasks[0].availableAt.toISOString(), target.endsAt.toISOString());
  assert.equal((await req(t, `/tasks/${tasks[0].id}`)).status, 403);
  assert.equal(
    (await req(t, '/tasks')).data.items.some((x) => x.id === tasks[0].id),
    false,
  );
  assert.equal(
    await db.task.count({
      where: { participant: { studentId: member.id }, type: 'TRIAL_FEEDBACK' },
    }),
    0,
  );
  const invalid = await lesson();
  assert.equal(
    (await book(guarded, invalid, { sourceRebookingTaskId: 'removed-contract' })).status,
    400,
  );
  assert.equal(await db.sessionParticipant.count({ where: { sessionId: invalid.id } }), 0);
  passed(
    'booking: ignores capacity/contact; enforces owner, future, overlap, duplicate and credit rules; trial tasks hidden and old source rejected',
  );
}
