import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

export async function verifyRosterRead({
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
  document,
  userIds,
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  const local = (s) => DateTime.fromISO(s, { zone: 'Australia/Melbourne' });
  const createdStudents = [],
    createdLessons = [];
  async function profile(name, firstPurchasedAt = null, user = a) {
    const s = await student(user, {
      name,
      giftTrialCredit: false,
      guardianName: 'Private parent',
      guardianEmail: 'private@test.invalid',
    });
    createdStudents.push(s.id);
    // Read-only fixtures deliberately include historical dates and members with zero balance.
    if (firstPurchasedAt)
      await db.student.update({
        where: { id: s.id },
        data: { type: 'MEMBER', firstPurchasedAt: local(firstPurchasedAt).toJSDate() },
      });
    return s;
  }
  async function lesson(starts, extra = {}) {
    const startsAt = local(starts).toJSDate();
    const l = await db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        capacity: 20,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3600000),
        ...extra,
      },
    });
    createdLessons.push(l.id);
    return l;
  }
  const join = (s, l, extra = {}) =>
    db.sessionParticipant.create({
      data: { studentId: s.id, sessionId: l.id, kind: 'TRIAL', ...extra },
    });
  const roster = async (l, user = t) => ok(await req(user, `/sessions/${l.id}/participants`), 200);
  const detail = async (s, user = t) => ok(await req(user, `/students/${s.id}`), 200);
  const schedule = async (l, user = t) =>
    ok(
      await req(
        user,
        `/sessions?week=${DateTime.fromJSDate(l.startsAt, { zone: 'Australia/Melbourne' }).toISODate()}`,
      ),
      200,
    ).find((v) => v.id === l.id);
  const labels = (row) => ({ category: row.category, membershipCategory: row.membershipCategory });
  const expected = {
    TRIAL_STUDENT: { category: 'TRIAL', membershipCategory: 'TRIAL_STUDENT' },
    NEW_MEMBER: { category: 'NEW', membershipCategory: 'NEW_MEMBER' },
    MEMBER: { category: 'EXISTING', membershipCategory: 'MEMBER' },
  };
  const assertPrivate = (row) => {
    for (const field of [
      'guardianName',
      'guardianEmail',
      'guardianPhone',
      'guardianOccupation',
      'firstPurchasedAt',
      'balances',
      'entitlementEntries',
      'ownerAdminId',
      'responsibleAdmin',
      'recordedByAdmin',
    ])
      assert.equal(field in row, false, field);
  };
  const snapshot = async () => ({
    students: await db.student.findMany({
      where: { id: { in: createdStudents } },
      orderBy: { id: 'asc' },
    }),
    participants: await db.sessionParticipant.findMany({
      where: { sessionId: { in: createdLessons } },
      orderBy: { id: 'asc' },
    }),
    tasks: await db.task.findMany({
      where: { sessionId: { in: createdLessons } },
      orderBy: { id: 'asc' },
    }),
    ledgerCount: await db.entitlementEntry.count({ where: { studentId: { in: createdStudents } } }),
  });

  const l = await lesson('2028-09-12T09:00');
  const trial = await profile('Z Trial'),
    trialTwin = await profile('Z Trial');
  const fresh = await profile('B Fresh', '2028-09-10T23:30');
  const existing = await profile('A Member', '2028-08-01');
  const foreign = await profile('C Other admin', '2028-09-12', b);
  const cancelled = await profile('Cancelled trial');
  const pTrial = await join(trial, l, {
    categorySnapshot: 'EXISTING',
    membershipCategorySnapshot: 'MEMBER',
  });
  const pTwin = await join(trialTwin, l);
  const pFresh = await join(fresh, l, {
    categorySnapshot: 'TRIAL',
    membershipCategorySnapshot: 'TRIAL_STUDENT',
    feedback: 'Private feedback',
    abilityNote: 'Private ability',
    preferenceNote: 'Private preference',
  });
  await join(existing, l, { kind: 'REGULAR' });
  await join(foreign, l, {
    kind: 'REGULAR',
    feedback: 'Other owner feedback',
    abilityNote: 'Other owner ability',
    preferenceNote: 'Other owner preference',
  });
  await join(cancelled, l, { bookingStatus: 'CANCELLED' });
  const initial = await snapshot();
  const result = await roster(l);
  assert.deepEqual(
    result.participants.map((p) => p.category),
    ['TRIAL', 'TRIAL', 'NEW', 'NEW', 'EXISTING'],
  );
  assert.deepEqual(
    result.participants.slice(0, 2).map((p) => p.participantId),
    [pTrial.id, pTwin.id].sort(),
  );
  assert.deepEqual(result.cancelled, []);
  assert.equal(result.lesson.participantCount, 5);
  assert.equal(result.lesson.trialCount, 2);
  assert.equal(result.lesson.newCount, 2);
  assert.deepEqual(await schedule(l), result.lesson);
  assert.deepEqual(await schedule(l, a), result.lesson);
  const asAdmin = await roster(l, a);
  assert.equal(asAdmin.cancelled.length, 1);
  for (const row of result.participants) {
    const record = (await detail({ id: row.id })).teachingRecords.find(
      (v) => v.participantId === row.participantId,
    );
    assert.deepEqual(labels(record), labels(row));
    assert.deepEqual(record.lesson, result.lesson);
    assertPrivate(row);
    assertPrivate(record);
  }
  assert.deepEqual(labels(result.participants.find((p) => p.id === fresh.id)), expected.NEW_MEMBER);
  assert.deepEqual(labels(asAdmin.cancelled[0]), expected.TRIAL_STUDENT);
  assert.deepEqual(await snapshot(), initial);
  passed(
    'roster: live identity overrides funding cards and stale/null snapshots, trial-first stable ordering and active counts match schedule and teaching records without writes',
  );

  const cases = [
    ['2028-09-10T23:30', '2028-09-09T23:59:59', 'MEMBER'],
    ['2028-09-10T23:30', '2028-09-10T00:00:00', 'NEW_MEMBER'],
    ['2028-09-10T23:30', '2028-09-16T23:59:59', 'NEW_MEMBER'],
    ['2028-09-10T23:30', '2028-09-17T00:00:00', 'MEMBER'],
    ['2026-09-28T00:00', '2026-10-04T23:59:59', 'NEW_MEMBER'],
    ['2026-09-28T00:00', '2026-10-05T00:00:00', 'MEMBER'],
    ['2026-03-30T00:00', '2026-04-05T23:59:59', 'NEW_MEMBER'],
    ['2026-03-30T00:00', '2026-04-06T00:00:00', 'MEMBER'],
  ];
  for (const [purchaseDate, lessonDate, category] of cases) {
    const s = await profile('Temporal member', purchaseDate),
      lessonRow = await lesson(lessonDate);
    const p = await join(s, lessonRow, {
      categorySnapshot: 'TRIAL',
      membershipCategorySnapshot: 'TRIAL_STUDENT',
      attendance: lessonRow.endsAt < now ? 'ATTENDED' : 'PENDING',
    });
    const saved = await snapshot();
    const r = await roster(lessonRow);
    assert.deepEqual(labels(r.participants[0]), expected[category], lessonDate);
    assert.equal(r.participants[0].type, 'MEMBER');
    assert.equal(r.lesson.trialCount, 0);
    assert.equal(r.lesson.newCount, category === 'NEW_MEMBER' ? 1 : 0);
    assert.deepEqual(await schedule(lessonRow), r.lesson);
    const sDetail = await detail(s);
    assert.deepEqual(
      labels(sDetail.teachingRecords.find((v) => v.participantId === p.id)),
      expected[category],
    );
    if (lessonDate === '2028-09-17T00:00:00') {
      assert.equal(sDetail.membershipCategory, 'NEW_MEMBER'); // Student header uses today; row uses lesson date.
      assert.equal(r.participants[0].membershipCategory, 'MEMBER');
    }
    assertPrivate(sDetail);
    assert.deepEqual(await snapshot(), saved);
  }
  passed(
    'roster: same-day purchase, pre-purchase history, future day-six/day-seven and both DST boundaries use the lesson calendar date consistently, not Clock.today or snapshot labels',
  );

  const teacher = await db.user.create({
    data: {
      name: 'Other read teacher',
      email: `${randomUUID()}@test.invalid`,
      role: 'TEACHER',
      passwordHash: 'unused-read-fixture',
    },
  });
  userIds.push(teacher.id);
  const privateLesson = await lesson('2028-09-13T09:00', { teacherId: teacher.id });
  await join(fresh, privateLesson, { feedback: 'Another teacher private feedback' });
  const unseen = await profile('Not in my lessons');
  await join(unseen, privateLesson);
  const cancelledLesson = await lesson('2028-09-14T09:00', { status: 'CANCELLED' });
  await join(fresh, cancelledLesson);
  const cancelledBookingLesson = await lesson('2028-09-15T09:00');
  await join(fresh, cancelledBookingLesson, { bookingStatus: 'CANCELLED' });
  const saved = await snapshot();
  const freshDetail = await detail(fresh);
  assertPrivate(freshDetail);
  assert.deepEqual(
    freshDetail.teachingRecords.map((v) => v.lesson.id),
    [l.id],
  );
  assert.equal(freshDetail.teachingRecords[0].feedback, 'Private feedback');
  const teacherRow = (await roster(l)).participants.find((v) => v.id === fresh.id);
  assert.equal(teacherRow.abilityNote, 'Private ability');
  assert.equal(teacherRow.preferenceNote, 'Private preference');
  const foreignRow = (await roster(l, a)).participants.find((v) => v.id === foreign.id);
  for (const key of ['feedback', 'abilityNote', 'preferenceNote'])
    assert.equal(foreignRow[key], null);
  const otherAdminDetail = await detail(fresh, b);
  assert.equal('firstPurchasedAt' in otherAdminDetail, false);
  assert.equal('guardianEmail' in otherAdminDetail, false);
  assert.deepEqual(otherAdminDetail.teachingRecords, []);
  assert.equal((await req(t, `/sessions/${privateLesson.id}/participants`)).status, 403);
  assert.equal((await req(t, `/students/${unseen.id}`)).status, 403);
  assert.equal((await req(t, `/students/${cancelled.id}`)).status, 403);
  assert.equal((await req(t, `/students/${fresh.id}/entitlements`)).status, 403);
  assert.equal((await req(t, `/students/${fresh.id}/communications`)).status, 403);
  assert.equal((await req(null, `/sessions/${l.id}/participants`)).status, 401);
  const memberOwnerDetail = await detail(fresh, a);
  assert.equal(memberOwnerDetail.guardianEmail, 'private@test.invalid');
  assert(memberOwnerDetail.firstPurchasedAt);
  assert.deepEqual(
    new Set(memberOwnerDetail.teachingRecords.map((v) => v.lesson.id)),
    new Set([l.id, privateLesson.id]),
  );
  assert.deepEqual(await snapshot(), saved);
  passed(
    'roster: assigned teachers receive only their teaching records; other-admin feedback and guardian/credit/purchase data stay private, with cancelled and unrelated participation excluded',
  );

  const followup = await db.task.create({
    data: {
      type: 'TRIAL_FOLLOWUP',
      assigneeId: a.user.id,
      sessionId: l.id,
      participantId: pFresh.id,
      purpose: 'FIRST_PURCHASE',
      availableAt: now,
      dueAt: now,
    },
  });
  const taskBefore = await snapshot();
  const taskDetail = ok(await req(a, `/tasks/${followup.id}`), 200);
  assert.deepEqual(
    labels(taskDetail.participant),
    labels((await roster(l, a)).participants.find((v) => v.id === fresh.id)),
  );
  for (const name of ['ParticipantDto', 'TeachingRecordDto']) {
    const schema = document.components.schemas[name];
    assert.deepEqual(schema.properties.membershipCategory.enum, [
      'TRIAL_STUDENT',
      'NEW_MEMBER',
      'MEMBER',
    ]);
    assert(schema.required.includes('membershipCategory'));
    assert(schema.required.includes('category'));
  }
  assert.deepEqual(await snapshot(), taskBefore);
  passed(
    'roster: task participant labels share the same contract and OpenAPI declares both required teaching/roster categories',
  );
}
