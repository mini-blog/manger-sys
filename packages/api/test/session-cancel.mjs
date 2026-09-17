import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifySessionCancel({
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
  teaching,
  passed,
  document,
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  let day = 1;
  const create = async () => {
    const date = `2032-01-${String(day++).padStart(2, '0')}`;
    return ok(
      await req(a, '/sessions', {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        capacity: 10,
        startsAt: `${date}T10:00:00+11:00`,
        endsAt: `${date}T11:00:00+11:00`,
      }),
    );
  };
  const get = (l) => db.classSession.findUniqueOrThrow({ where: { id: l.id } });
  const cancel = (l, expectedVersion, options = {}, actor = a, extra = {}) =>
    req(
      actor,
      `/sessions/${l.id}/cancel`,
      { expectedVersion, reason: 'Teacher unavailable', ...extra },
      options,
    );
  const add = (l, s, actor = a, kind = 'TRIAL') =>
    req(actor, `/sessions/${l.id}/participants`, { studentId: s.id, kind });
  const newStudent = (actor = a) =>
    student(actor, {
      name: 'Session cancellation',
      guardianName: 'Parent',
      guardianEmail: 'parent@test.invalid',
    });
  const grant = (s, bucket, quantity, actor = a) =>
    req(actor, '/entitlements/grants', {
      studentId: s.id,
      bucket,
      quantity,
      ...(bucket === 'REGULAR' ? { mode: 'CUSTOM' } : {}),
    });
  const balance = async (s, actor = a) =>
    ok(await req(actor, `/students/${s.id}/entitlements`), 200).balances;
  const evaluation = async (l, p, status = 'OPEN') => {
    const lesson = await get(l);
    const prior = await db.task.findFirst({
      where: { type: 'TRIAL_FEEDBACK', participantId: p.id },
    });
    if (prior)
      return db.task.update({
        where: { id: prior.id },
        data: { status, completedAt: status === 'DONE' ? now : null },
      });
    return db.task.create({
      data: {
        type: 'TRIAL_FEEDBACK',
        sessionId: l.id,
        participantId: p.id,
        assigneeId: t.user.id,
        availableAt: lesson.endsAt,
        dueAt: new Date(lesson.endsAt.getTime() + 86400000),
        status,
        ...(status === 'DONE' ? { completedAt: now } : {}),
      },
    });
  };
  const snapshot = async (l) => ({
    lesson: await get(l),
    participants: await db.sessionParticipant.findMany({
      where: { sessionId: l.id },
      orderBy: { id: 'asc' },
    }),
    tasks: await db.task.findMany({ where: { sessionId: l.id }, orderBy: { id: 'asc' } }),
    logs: await db.scheduleChange.findMany({ where: { sessionId: l.id }, orderBy: { id: 'asc' } }),
  });
  const ledger = () => db.entitlementEntry.findMany({ orderBy: { id: 'asc' } });

  const l = await create(),
    other = await create();
  const sa = await newStudent(),
    sb = await newStudent(b),
    member = await newStudent(b);
  ok(await grant(sa, 'TRIAL', 2));
  ok(await grant(member, 'REGULAR', 3, b));
  const pa = ok(await add(l, sa)),
    pb = ok(await add(l, sb, b)),
    pm = ok(await add(l, member, b, 'REGULAR'));
  const po = ok(await add(other, sa));
  await evaluation(l, pa);
  await evaluation(l, pb);
  await evaluation(other, po);
  // Previously removed participants and non-open tasks are not modified by course cancellation.
  for (const status of ['DONE', 'CANCELLED']) {
    const s = await newStudent();
    const p = await db.sessionParticipant.create({
      data: { sessionId: l.id, studentId: s.id, kind: 'TRIAL', bookingStatus: 'CANCELLED' },
    });
    await evaluation(l, p, status);
  }
  const before = await snapshot(l),
    otherBefore = await snapshot(other),
    ledgerBefore = await ledger();
  const balancesBefore = await Promise.all([balance(sa), balance(sb, b), balance(member, b)]);
  const key = randomUUID();
  const response = ok(await cancel(l, before.lesson.version, { key }));
  const after = await snapshot(l);
  assert.equal(after.lesson.status, 'CANCELLED');
  assert.equal(after.lesson.version, before.lesson.version + 1);
  for (const original of before.participants) {
    const p = after.participants.find((v) => v.id === original.id);
    assert.deepEqual(
      p,
      original.bookingStatus === 'BOOKED'
        ? { ...original, bookingStatus: 'CANCELLED', version: original.version + 1 }
        : original,
    );
  }
  for (const original of before.tasks) {
    const task = after.tasks.find((v) => v.id === original.id);
    assert.deepEqual(
      task,
      original.status === 'OPEN'
        ? {
            ...original,
            status: 'CANCELLED',
            version: original.version + 1,
            updatedAt: task.updatedAt,
          }
        : original,
    );
  }
  assert.deepEqual(
    after.tasks.filter((v) => v.status === 'OPEN'),
    [],
  );
  assert.equal(after.tasks.length, before.tasks.length);
  assert.equal(await db.task.count({ where: { sessionId: l.id, type: 'TRIAL_FOLLOWUP' } }), 0);
  assert.deepEqual(await ledger(), ledgerBefore);
  assert.deepEqual(await snapshot(other), otherBefore);
  const balancesAfter = await Promise.all([balance(sa), balance(sb, b), balance(member, b)]);
  for (const [i, bucket] of ['TRIAL', 'TRIAL', 'REGULAR'].entries()) {
    assert.deepEqual(balancesAfter[i], {
      ...balancesBefore[i],
      [bucket]: {
        remaining: balancesBefore[i][bucket].remaining,
        reserved: balancesBefore[i][bucket].reserved - 1,
        available: balancesBefore[i][bucket].available + 1,
      },
    });
  }
  const log = after.logs.find((v) => v.action === 'CANCEL');
  assert.equal(log.actorId, a.user.id);
  assert.equal(log.reason, 'Teacher unavailable');
  assert.equal(log.before.status, 'SCHEDULED');
  assert.equal(log.after.status, 'CANCELLED');
  assert.equal(log.requestKey, key);
  const roster = ok(await req(t, `/sessions/${l.id}/participants`), 200);
  assert.equal(roster.lesson.status, 'CANCELLED');
  assert.equal(roster.participants.length, 0);
  assert.equal(roster.cancelled.length, 0);
  assert.equal(
    ok(await req(a, `/sessions/${l.id}/participants`), 200).cancelled.length,
    before.participants.length,
  );
  passed(
    'session cancel: mixed-admin/card reservations released atomically, pending evaluations cancelled, no ledger or sales task added',
  );

  assert.deepEqual(ok(await cancel(l, before.lesson.version, { key })), response);
  assert.deepEqual(await snapshot(l), after);
  assert.equal(
    (await cancel(l, before.lesson.version, { key }, a, { reason: 'Changed' })).data.code,
    'IDEMPOTENCY_CONFLICT',
  );
  assert.equal((await cancel(l, after.lesson.version)).status, 409);
  assert.equal((await cancel(l, before.lesson.version, { key }, t)).status, 403);
  assert.equal((await add(l, await newStudent())).status, 409);
  assert.equal(
    (
      await req(t, `/sessions/${l.id}/feedback`, {
        expectedVersion: after.lesson.version,
        students: [],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(
        a,
        `/sessions/${l.id}`,
        { expectedVersion: after.lesson.version, reason: 'Edit cancelled', courseId },
        { method: 'PATCH' },
      )
    ).status,
    409,
  );
  assert.deepEqual(await snapshot(l), after);
  const empty = await create();
  ok(await cancel(empty, 1, {}, b)); // Shared lessons are manageable by any Admin.
  assert.equal(await db.task.count({ where: { sessionId: empty.id } }), 0);
  passed(
    'session cancel: idempotent retries, cancelled course blocks writes, history readable, empty course creates no task',
  );

  const active = await create(),
    original = await snapshot(active);
  for (const actor of [null, t])
    assert.equal((await cancel(active, 1, {}, actor)).status, actor ? 403 : 401);
  assert.equal((await cancel(active, 1, { csrf: false })).status, 403);
  assert.equal((await cancel(active, 1, { key: 'bad-key' })).status, 400);
  assert.equal((await cancel(active, 2)).data.code, 'VERSION_CONFLICT');
  for (const extra of [
    { reason: '' },
    { reason: ' '.repeat(2) },
    { reason: 'x'.repeat(501) },
    { expectedVersion: null },
    { expectedVersion: 0 },
    { confirmedAffectedParticipantIds: [] },
  ])
    assert.equal((await cancel(active, 1, {}, a, extra)).status, 400);
  assert.equal((await cancel({ id: 'missing' }, 1)).status, 404);
  assert.deepEqual(await snapshot(active), original);
  await db.classSession.update({
    where: { id: active.id },
    data: { startsAt: now, endsAt: new Date(now.getTime() + 3600000) },
  });
  assert.equal((await cancel(active, 1)).data.code, 'SESSION_STARTED');
  const submitted = await create();
  await db.classSession.update({ where: { id: submitted.id }, data: { feedbackSubmittedAt: now } });
  assert.equal((await cancel(submitted, 1)).status, 409);
  for (const facts of [
    { attendance: 'ATTENDED', checkedInAt: now, checkedInBy: t.user.id },
    { attendance: 'ATTENDED', feedbackSubmittedAt: now },
  ]) {
    const lesson = await create(),
      s = await newStudent();
    await db.sessionParticipant.create({
      data: { sessionId: lesson.id, studentId: s.id, kind: 'TRIAL', ...facts },
    });
    const unchanged = await snapshot(lesson);
    assert.equal((await cancel(lesson, 1)).data.code, 'RESULT_ALREADY_SUBMITTED');
    assert.deepEqual(await snapshot(lesson), unchanged);
  }
  passed(
    'session cancel: permissions, input, version, course start and recorded attendance/feedback guarded without side effects',
  );

  const rollback = await create(),
    rs = await newStudent(),
    rp = ok(await add(rollback, rs));
  await evaluation(rollback, rp);
  const saved = await snapshot(rollback),
    credits = await balance(rs),
    failureKey = randomUUID();
  const originalLog = teaching.log;
  teaching.log = async function (...args) {
    await originalLog.apply(this, args);
    throw new Error('Injected cancel audit failure');
  };
  try {
    assert.equal((await cancel(rollback, saved.lesson.version, { key: failureKey })).status, 500);
  } finally {
    teaching.log = originalLog;
  }
  assert.deepEqual(await snapshot(rollback), saved);
  assert.deepEqual(await balance(rs), credits);
  assert.equal(await db.mutationReceipt.count({ where: { key: failureKey } }), 0);
  ok(await cancel(rollback, saved.lesson.version, { key: failureKey }));
  passed(
    'session cancel: audit failure rolls back lesson, participants, evaluations and receipt; retry succeeds',
  );

  for (const sameKey of [true, false]) {
    const race = await create(),
      s = await newStudent(),
      p = ok(await add(race, s));
    await evaluation(race, p);
    const version = (await get(race)).version,
      k = randomUUID();
    const results = await Promise.all([
      cancel(race, version, { key: k }),
      cancel(race, version, { key: sameKey ? k : randomUUID() }),
    ]);
    assert.deepEqual(results.map((v) => v.status).sort(), sameKey ? [201, 201] : [201, 409]);
    assert.equal(
      await db.scheduleChange.count({ where: { sessionId: race.id, action: 'CANCEL' } }),
      1,
    );
    assert.equal((await get(race)).version, version + 1);
    assert.equal((await balance(s)).TRIAL.reserved, 0);
  }
  const racingAdd = await create(),
    racingStudent = await newStudent();
  const [cancelResult, addResult] = await Promise.all([
    cancel(racingAdd, 1),
    add(racingAdd, racingStudent),
  ]);
  assert.deepEqual([cancelResult.status, addResult.status].sort(), [201, 409]);
  if (cancelResult.status === 409) {
    assert.equal(cancelResult.data.code, 'VERSION_CONFLICT');
    ok(await cancel(racingAdd, (await get(racingAdd)).version));
  }
  assert.equal(
    await db.sessionParticipant.count({
      where: { sessionId: racingAdd.id, bookingStatus: 'BOOKED' },
    }),
    0,
  );
  assert.equal((await balance(racingStudent)).TRIAL.reserved, 0);
  assert.equal(
    document.components.schemas.CancelSessionDto.properties.confirmedAffectedParticipantIds,
    undefined,
  );
  assert.deepEqual(document.components.schemas.CancelSessionDto.required.sort(), [
    'expectedVersion',
    'reason',
  ]);
  passed(
    'session cancel: concurrent duplicates and booking race preserve one cancellation, no stranded reservation; OpenAPI minimal contract',
  );
}
