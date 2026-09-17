import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyStudentType({
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
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  const read = async (s, u = a) => ok(await req(u, `/students/${s.id}`), 200);
  const gift = await student(a, {
    name: 'Identity gifted',
    guardianName: 'Parent',
    guardianEmail: 'parent@test.invalid',
  });
  const empty = await student(a, { giftTrialCredit: false });
  for (const s of [gift, empty]) assert.equal((await read(s)).type, 'TRIAL');
  assert.equal(await db.entitlementEntry.count({ where: { studentId: empty.id } }), 0);
  const entries = await db.entitlementEntry.findMany({ where: { studentId: gift.id } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'INITIAL_TRIAL');
  assert.equal(entries[0].quantity, 1);
  assert.equal(
    (await req(a, '/students', { name: 'Forged', yearLevel: 'Year 4', type: 'MEMBER' })).status,
    400,
  );
  assert.equal(
    (
      await req(
        a,
        `/students/${gift.id}`,
        { expectedVersion: 1, type: 'MEMBER' },
        { method: 'PATCH' },
      )
    ).status,
    400,
  );

  const lesson = await db.classSession.create({
    data: {
      classGroupId: groupId,
      courseId,
      teacherId: t.user.id,
      capacity: 10,
      startsAt: new Date(now.getTime() + 3600000),
      endsAt: new Date(now.getTime() + 7200000),
    },
  });
  ok(await req(a, `/sessions/${lesson.id}/participants`, { studentId: gift.id, kind: 'TRIAL' }));
  const roster = async () => ok(await req(t, `/sessions/${lesson.id}/participants`), 200);
  assert.equal((await roster()).lesson.trialCount, 1);
  assert.equal((await roster()).participants[0].type, 'TRIAL');
  const grant = async (s, body) =>
    ok(await req(a, '/entitlements/grants', { studentId: s.id, ...body }));
  await grant(gift, { bucket: 'TRIAL', quantity: 2 });
  assert.equal((await read(gift)).type, 'TRIAL');
  const purchase = await grant(gift, { bucket: 'REGULAR', mode: 'CUSTOM', quantity: 10 });
  assert.equal(purchase.type, 'MEMBER');
  const member = await read(gift);
  assert.equal(member.type, 'MEMBER');
  assert.equal(member.membershipCategory, 'NEW_MEMBER');
  assert.equal((await read(gift, b)).type, 'MEMBER');
  // A member can rebook an old trial student's cancelled lesson using a regular card.
  const original = await db.sessionParticipant.create({
    data: {
      studentId: empty.id,
      sessionId: lesson.id,
      kind: 'TRIAL',
      bookingStatus: 'CANCELLED',
    },
  });
  const rebooking = await db.task.create({
    data: {
      type: 'TRIAL_FOLLOWUP',
      purpose: 'REBOOKING',
      assigneeId: a.user.id,
      sessionId: lesson.id,
      participantId: original.id,
      reason: 'CANCELLED',
      availableAt: now,
      dueAt: now,
    },
  });
  const r = await roster();
  assert.equal(r.lesson.trialCount, 0);
  assert.equal(r.lesson.newCount, 1);
  assert.equal(r.participants[0].kind, 'TRIAL'); // Same card reservation; different student identity.
  assert.equal(r.participants[0].type, 'MEMBER');
  assert.equal(r.participants[0].category, 'NEW');
  assert.equal((await read(gift, t)).type, 'MEMBER');
  const tab = ok(await req(a, '/students?q=Identity%20gifted&category=TRIAL_STUDENT'), 200);
  assert.equal(tab.total, 0);
  assert.equal(tab.categoryCounts.NEW_MEMBER, 1);
  await grant(gift, { bucket: 'TRIAL', quantity: 1 });
  await grant(gift, { bucket: 'REGULAR', mode: 'CUSTOM', quantity: 1 });
  assert.equal((await read(gift)).type, 'MEMBER');
  assert.equal((await read(gift)).firstPurchasedAt, member.firstPurchasedAt);

  const pack = await db.lessonPackage.create({
    data: { name: `Identity ${randomUUID()}`, quantity: 5, priceAudCents: 10000 },
  });
  const packaged = await grant(empty, {
    bucket: 'REGULAR',
    mode: 'PACKAGE',
    packageId: pack.id,
    expectedPackageVersion: 1,
  });
  assert.equal(packaged.type, 'MEMBER');
  assert.equal((await read(empty)).type, 'MEMBER');
  const emptyVersion = (await read(empty)).version;
  ok(
    await req(
      a,
      `/students/${empty.id}`,
      {
        expectedVersion: emptyVersion,
        guardianName: 'Parent',
        guardianEmail: 'parent@test.invalid',
      },
      { method: 'PATCH' },
    ),
    200,
  );
  const target = await db.classSession.create({
    data: {
      classGroupId: groupId,
      courseId,
      teacherId: t.user.id,
      capacity: 10,
      startsAt: new Date(now.getTime() + 10800000),
      endsAt: new Date(now.getTime() + 14400000),
    },
  });
  const moved = ok(
    await req(a, `/sessions/${target.id}/participants`, {
      studentId: empty.id,
      kind: 'REGULAR',
    }),
  );
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: rebooking.id } })).rebookedToParticipantId,
    null,
  );
  // Member attending with trial credits is never treated as a trial student by feedback.
  const past = await db.classSession.create({
    data: {
      classGroupId: groupId,
      courseId,
      teacherId: t.user.id,
      capacity: 10,
      startsAt: new Date(now.getTime() - 7200000),
      endsAt: new Date(now.getTime() - 3600000),
    },
  });
  const p = await db.sessionParticipant.create({
    data: { sessionId: past.id, studentId: gift.id, kind: 'TRIAL' },
  });
  ok(
    await req(t, `/sessions/${past.id}/feedback`, {
      expectedVersion: 1,
      summary: '',
      students: [{ participantId: p.id, attendance: 'ATTENDED', feedback: '' }],
    }),
  );
  assert.equal(await db.task.count({ where: { participantId: p.id, type: 'TRIAL_FOLLOWUP' } }), 0);
  assert.equal((await read(gift)).type, 'MEMBER');
  await assert.rejects(() =>
    db.student.update({ where: { id: gift.id }, data: { type: 'TRIAL' } }),
  );
  passed(
    'student type: optional gift defaults to trial; purchases atomically convert identity; trial-funded members are not trial students in tabs, roster or feedback',
  );
}
