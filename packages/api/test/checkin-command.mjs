import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyCheckinCommand({
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
  groupId,
  clock,
  teaching,
  passed,
  document,
}) {
  const originalNow = clock.now;
  const base = originalNow();
  let instant = base,
    offset = 200;
  clock.now = () => instant;
  const code = (r, expected) => {
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.code, expected);
  };
  const get = (id) => db.sessionParticipant.findUniqueOrThrow({ where: { id } });
  const balance = async (s) => ok(await req(a, `/students/${s.id}/entitlements`), 200).balances;
  const check = (p, u = t, key = randomUUID(), version = p.version ?? 1) =>
    req(u, `/participants/${p.id}/check-in`, { expectedVersion: version }, { key });
  async function lesson() {
    offset += 2;
    return db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        startsAt: new Date(base.getTime() + offset * 3600000),
        endsAt: new Date(base.getTime() + (offset + 1) * 3600000),
        capacity: 1,
      },
    });
  }
  async function booking(s, l, kind = 'TRIAL') {
    instant = base;
    return get(ok(await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind })).id);
  }
  async function grant(s, bucket, quantity = 1) {
    return ok(
      await req(a, '/entitlements/grants', {
        studentId: s.id,
        bucket,
        quantity,
        ...(bucket === 'REGULAR' ? { mode: 'CUSTOM' } : {}),
      }),
    );
  }
  const roster = async (l, u = t) => ok(await req(u, `/sessions/${l.id}/participants`), 200);
  try {
    assert.ok(document.paths['/api/participants/{id}/check-in']);
    assert.deepEqual(document.components.schemas.CheckInDto.required, ['expectedVersion']);
    assert.ok(document.components.schemas.ParticipantDto.required.includes('canCheckIn'));
    const originalTeacher = await db.user.findUniqueOrThrow({ where: { id: t.user.id } });
    const index = userIds.length;
    userIds.push(`checkin-${randomUUID()}`);
    await db.user.create({
      data: {
        id: userIds[index],
        name: 'Other check-in teacher',
        email: `${userIds[index]}@test.invalid`,
        role: 'TEACHER',
        passwordHash: originalTeacher.passwordHash,
      },
    });
    const other = await login(index);
    const s = await student(a),
      l = await lesson(),
      p = await booking(s, l);
    for (const u of [a, b, other]) assert.equal((await check(p, u)).status, 403);
    assert.equal((await check(p, null)).status, 401);
    for (const body of [
      {},
      { expectedVersion: 0 },
      { expectedVersion: 1, checkedInAt: base.toISOString() },
      { expectedVersion: '1' },
    ])
      assert.equal((await req(t, `/participants/${p.id}/check-in`, body)).status, 400);
    assert.equal(
      (await req(t, `/participants/${p.id}/check-in`, { expectedVersion: 1 }, { csrf: false }))
        .status,
      403,
    );
    assert.equal(
      (await req(t, `/participants/${p.id}/check-in`, { expectedVersion: 1 }, { key: 'bad' }))
        .status,
      400,
    );
    instant = new Date(l.startsAt.getTime() - 1);
    assert.equal((await roster(l)).participants[0].canCheckIn, false);
    code(await check(p), 'LESSON_NOT_STARTED');
    instant = l.startsAt;
    assert.equal((await roster(l)).participants[0].canCheckIn, true);
    assert.equal((await roster(l, a)).participants[0].canCheckIn, false);
    code(await check(p, t, randomUUID(), 99), 'VERSION_CONFLICT');
    passed(
      'check-in: strict DTO/CSRF, only current teacher, start-time boundary and version guard',
    );

    const key = randomUUID();
    const before = await db.classSession.findUniqueOrThrow({ where: { id: l.id } });
    const results = await Promise.all([check(p, t, key), check(p, t, key), check(p)]);
    results.forEach((r) => ok(r));
    assert.deepEqual(results[0].data, results[1].data);
    const after = await get(p.id);
    assert.equal(after.attendance, 'ATTENDED');
    assert.equal(after.checkedInAt.toISOString(), instant.toISOString());
    assert.equal(after.checkedInBy, t.user.id);
    assert.equal(after.version, p.version + 1);
    assert.equal(
      (await db.classSession.findUniqueOrThrow({ where: { id: l.id } })).version,
      before.version + 1,
    );
    assert.equal(await db.entitlementEntry.count({ where: { participantId: p.id } }), 1);
    assert.equal(
      await db.scheduleChange.count({ where: { participantId: p.id, action: 'CHECK_IN' } }),
      1,
    );
    assert.deepEqual((await balance(s)).TRIAL, { remaining: 0, reserved: 0, available: 0 });
    const row = (await roster(l)).participants[0];
    assert.equal(row.canCheckIn, false);
    assert.equal(row.checkedInAt, instant.toISOString());
    assert.equal('balances' in row, false);
    assert.equal('guardianEmail' in row, false);
    const task = await db.task.findFirstOrThrow({
      where: { participantId: p.id, type: 'TRIAL_FEEDBACK' },
    });
    assert.equal(task.status, 'OPEN');
    assert.equal((await req(t, `/tasks/${task.id}`)).status, 403);
    instant = l.endsAt;
    ok(await req(t, `/tasks/${task.id}`), 200);
    ok(await check(p)); // Fresh key plus old version is a harmless acknowledgment.
    code(await check(p, t, key, 2), 'IDEMPOTENCY_CONFLICT');
    code(
      await req(t, `/sessions/${l.id}/feedback`, {
        expectedVersion: before.version + 1,
        students: [{ participantId: p.id, attendance: 'NO_SHOW', feedback: '' }],
      }),
      'INDIVIDUAL_FEEDBACK_REQUIRED',
    );
    assert.equal((await get(p.id)).attendance, 'ATTENDED');
    passed(
      'check-in: concurrent and replayed requests consume once, update versions/audit once, preserve teaching obligation',
    );

    instant = base;
    const member = await student(a);
    await grant(member, 'REGULAR', 2);
    for (const kind of ['TRIAL', 'REGULAR']) {
      const ml = await lesson(),
        mp = await booking(member, ml, kind);
      instant = ml.startsAt;
      ok(await check(mp));
      assert.equal(
        (await db.entitlementEntry.findUniqueOrThrow({ where: { participantId: mp.id } })).bucket,
        kind,
      );
      assert.equal(
        await db.task.count({ where: { participantId: mp.id, type: 'TRIAL_FEEDBACK' } }),
        0,
      );
    }
    const converted = await student(a),
      cl = await lesson(),
      cp = await booking(converted, cl);
    await grant(converted, 'REGULAR');
    instant = cl.startsAt;
    ok(await check(cp));
    assert.equal(
      (await db.task.findFirstOrThrow({ where: { participantId: cp.id, type: 'TRIAL_FEEDBACK' } }))
        .status,
      'CANCELLED',
    );
    await grant(s, 'REGULAR');
    assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'OPEN');
    passed(
      'check-in: both funding pools, member has no trial evaluation, purchase-before cancels and purchase-after preserves evaluation',
    );

    const late = await student(a),
      lateLesson = await lesson(),
      lateP = await booking(late, lateLesson);
    instant = new Date(lateLesson.endsAt.getTime() - 1);
    assert.equal((await balance(late)).TRIAL.reserved, 1);
    instant = lateLesson.endsAt;
    assert.deepEqual((await balance(late)).TRIAL, { remaining: 1, reserved: 0, available: 1 });
    const list = ok(await req(a, `/entitlements?studentId=${late.id}`), 200);
    assert.deepEqual(list.items[0].balances, await balance(late));
    assert.equal((await get(lateP.id)).attendance, 'PENDING');
    const lateTask = await db.task.findFirstOrThrow({
      where: { participantId: lateP.id, type: 'TRIAL_FEEDBACK' },
    });
    assert.equal((await req(t, `/tasks/${lateTask.id}`)).status, 403);
    assert.equal((await roster(lateLesson)).participants[0].canCheckIn, true);
    ok(await check(lateP));
    assert.equal((await balance(late)).TRIAL.remaining, 0);
    ok(await req(t, `/tasks/${lateTask.id}`), 200);
    passed(
      'check-in: exact end boundary releases unconfirmed reservations without GET writes, late check-in consumes and unlocks detail',
    );

    const contested = await student(a),
      oldLesson = await lesson(),
      oldP = await booking(contested, oldLesson);
    const nextLesson = await lesson();
    instant = oldLesson.endsAt;
    const nextP = await get(
      ok(
        await req(a, `/sessions/${nextLesson.id}/participants`, {
          studentId: contested.id,
          kind: 'TRIAL',
        }),
      ).id,
    );
    const insufficient = await check(oldP);
    code(insufficient, 'ENTITLEMENT_INSUFFICIENT');
    assert.match(insufficient.data.message, /admin/);
    assert.equal((await get(oldP.id)).checkedInAt, null);
    assert.equal(await db.entitlementEntry.count({ where: { participantId: oldP.id } }), 0);
    assert.equal(
      await db.scheduleChange.count({ where: { participantId: oldP.id, action: 'CHECK_IN' } }),
      0,
    );
    await grant(contested, 'REGULAR');
    code(await check(oldP), 'ENTITLEMENT_INSUFFICIENT'); // Pools never substitute.
    await grant(contested, 'TRIAL');
    ok(await check(oldP));
    assert.equal((await get(nextP.id)).attendance, 'PENDING');
    assert.deepEqual((await balance(contested)).TRIAL, { remaining: 1, reserved: 1, available: 0 });
    passed(
      'check-in: released credit can fund a new booking; late check-in cannot steal its reservation or another pool',
    );

    const raceStudent = await student(a),
      r1 = await lesson(),
      rp1 = await booking(raceStudent, r1),
      r2 = await lesson();
    instant = r1.endsAt;
    const rp2 = await get(
      ok(
        await req(a, `/sessions/${r2.id}/participants`, {
          studentId: raceStudent.id,
          kind: 'TRIAL',
        }),
      ).id,
    );
    instant = r2.endsAt;
    const race = await Promise.all([check(rp1), check(rp2)]);
    assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
    code(
      race.find((r) => r.status === 409),
      'ENTITLEMENT_INSUFFICIENT',
    );
    assert.equal(
      await db.entitlementEntry.count({
        where: { studentId: raceStudent.id, kind: 'CONSUMPTION' },
      }),
      1,
    );
    assert.deepEqual((await balance(raceStudent)).TRIAL, {
      remaining: 0,
      reserved: 0,
      available: 0,
    });
    passed('check-in: concurrent late check-ins for the last credit cannot overdraw');

    const rollbackStudent = await student(a),
      rl = await lesson(),
      rollbackP = await booking(rollbackStudent, rl);
    await grant(rollbackStudent, 'REGULAR');
    const rollbackTask = await db.task.findFirstOrThrow({
      where: { participantId: rollbackP.id, type: 'TRIAL_FEEDBACK' },
    });
    instant = rl.startsAt;
    const beforeRollback = await db.classSession.findUniqueOrThrow({ where: { id: rl.id } });
    const originalLog = teaching.log;
    try {
      teaching.log = async function (...args) {
        if (args[3] === 'CHECK_IN') throw new Error('Injected audit failure');
        return originalLog.apply(this, args);
      };
      assert.equal((await check(rollbackP)).status, 500);
    } finally {
      teaching.log = originalLog;
    }
    assert.deepEqual(await get(rollbackP.id), rollbackP);
    assert.deepEqual(
      await db.task.findUniqueOrThrow({ where: { id: rollbackTask.id } }),
      rollbackTask,
    );
    assert.equal(
      (await db.classSession.findUniqueOrThrow({ where: { id: rl.id } })).version,
      beforeRollback.version,
    );
    assert.equal(await db.entitlementEntry.count({ where: { participantId: rollbackP.id } }), 0);
    ok(await check(rollbackP));
    assert.equal(
      (await db.task.findUniqueOrThrow({ where: { id: rollbackTask.id } })).status,
      'CANCELLED',
    );
    passed(
      'check-in: audit failure rolls back attendance, consumption and lesson version; retry succeeds',
    );

    const listStudent = await student(a),
      listLesson = await lesson();
    await booking(listStudent, listLesson);
    let listReads = 0;
    clock.now = () =>
      ++listReads === 1 ? new Date(listLesson.endsAt.getTime() - 1) : listLesson.endsAt;
    const boundaryList = ok(await req(a, `/entitlements?studentId=${listStudent.id}`), 200);
    assert.equal(listReads, 1);
    assert.equal(boundaryList.items[0].balances.TRIAL.reserved, 1);
    clock.now = () => instant;
    const edgeStudent = await student(a),
      el = await lesson(),
      ep = await booking(edgeStudent, el);
    let reads = 0;
    clock.now = () => {
      reads++;
      return reads === 1 ? new Date(el.endsAt.getTime() - 1) : el.endsAt;
    };
    ok(await check(ep));
    assert.equal(reads, 1);
    clock.now = () => instant;
    const cancelled = await student(a),
      cancelledL = await lesson(),
      cancelledP = await booking(cancelled, cancelledL);
    ok(
      await req(a, `/participants/${cancelledP.id}/cancel`, {
        expectedVersion: 1,
        reason: 'Test cancellation',
      }),
    );
    instant = cancelledL.startsAt;
    code(await check(cancelledP), 'BOOKING_INACTIVE');
    instant = base;
    const sessionStudent = await student(a),
      sl = await lesson(),
      sp = await booking(sessionStudent, sl);
    const sessionVersion = (await db.classSession.findUniqueOrThrow({ where: { id: sl.id } }))
      .version;
    ok(
      await req(a, `/sessions/${sl.id}/cancel`, {
        expectedVersion: sessionVersion,
        reason: 'Test cancellation',
      }),
    );
    instant = sl.startsAt;
    code(await check(sp), 'BOOKING_INACTIVE');
    // Even a successful receipt must not be returned to a former teacher.
    await db.classSession.update({ where: { id: l.id }, data: { teacherId: other.user.id } });
    assert.equal((await check(p, t, key)).status, 403);
    passed(
      'check-in: one clock snapshot, cancelled bookings/lessons rejected, receipt replay rechecks current teacher',
    );
  } finally {
    clock.now = originalNow;
  }
}
