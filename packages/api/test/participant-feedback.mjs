import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

export async function verifyParticipantFeedback({
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
  const originalNow = clock.now,
    base = originalNow();
  let now = base,
    offset = 400;
  clock.now = () => now;
  const person = (id) => db.sessionParticipant.findUniqueOrThrow({ where: { id } });
  const teacherTask = (id) =>
    db.task.findFirstOrThrow({ where: { participantId: id, type: 'TRIAL_FEEDBACK' } });
  const sales = (id) => db.task.findMany({ where: { participantId: id, type: 'TRIAL_FOLLOWUP' } });
  const code = (r, c) => {
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.code, c);
  };
  const evaluate = (p, extra = {}, u = t, key = randomUUID()) =>
    req(
      u,
      `/participants/${p.id}/feedback`,
      { expectedVersion: p.version, feedback: 'Engaged with fractions.', ...extra },
      { key },
    );
  const purchase = (s, u = a) =>
    req(u, '/entitlements/grants', {
      studentId: s.id,
      bucket: 'REGULAR',
      mode: 'CUSTOM',
      quantity: 5,
    });
  async function lesson() {
    offset += 2;
    return db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        startsAt: new Date(base.getTime() + offset * 3600000),
        endsAt: new Date(base.getTime() + (offset + 1) * 3600000),
      },
    });
  }
  async function book(s, l, u = a) {
    now = base;
    return person(
      ok(await req(u, `/sessions/${l.id}/participants`, { studentId: s.id, kind: 'TRIAL' })).id,
    );
  }
  async function arrive(p, l) {
    now = l.startsAt;
    ok(await req(t, `/participants/${p.id}/check-in`, { expectedVersion: p.version }));
    return person(p.id);
  }
  async function ready(u = a) {
    const s = await student(u),
      l = await lesson(),
      p = await book(s, l, u);
    return { s, l, p: await arrive(p, l) };
  }
  try {
    assert.ok(document.paths['/api/participants/{id}/feedback']);
    assert.deepEqual(document.components.schemas.ParticipantFeedbackDto.required, [
      'expectedVersion',
      'feedback',
    ]);
    const index = userIds.length,
      source = await db.user.findUniqueOrThrow({ where: { id: t.user.id } });
    userIds.push(`evaluation-${randomUUID()}`);
    await db.user.create({
      data: {
        id: userIds[index],
        name: 'Other evaluator',
        email: `${userIds[index]}@test.invalid`,
        role: 'TEACHER',
        passwordHash: source.passwordHash,
      },
    });
    const other = await login(index);
    const students = [await student(a), await student(b), await student(a)],
      l = await lesson();
    const ps = [
      await book(students[0], l),
      await book(students[1], l, b),
      await book(students[2], l),
    ];
    ps[0] = await arrive(ps[0], l);
    ps[1] = await arrive(ps[1], l);
    for (const u of [a, b, other]) assert.equal((await evaluate(ps[0], {}, u)).status, 403);
    assert.equal((await evaluate(ps[0], {}, null)).status, 401);
    const path = `/participants/${ps[0].id}/feedback`;
    for (const fields of [
      { feedback: '' },
      { feedback: '  ' },
      { feedback: null },
      { feedback: 'x'.repeat(2001) },
      { abilityNote: null },
      { preferenceNote: 3 },
      { expectedVersion: 0 },
      { students: [] },
      { summary: 'class' },
      { attendance: 'ATTENDED' },
    ])
      assert.equal((await evaluate(ps[0], fields)).status, 400);
    assert.equal((await req(t, path, { expectedVersion: ps[0].version })).status, 400);
    assert.equal(
      (await req(t, path, { expectedVersion: ps[0].version, feedback: 'Test' }, { csrf: false }))
        .status,
      403,
    );
    assert.equal(
      (await req(t, path, { expectedVersion: ps[0].version, feedback: 'Test' }, { key: 'invalid' }))
        .status,
      400,
    );
    now = new Date(l.endsAt.getTime() - 1);
    code(await evaluate(ps[0]), 'LESSON_NOT_ENDED');
    now = l.endsAt;
    code(await evaluate(ps[2]), 'CHECK_IN_REQUIRED');
    code(await evaluate(ps[0], { expectedVersion: 99 }), 'VERSION_CONFLICT');
    assert.equal((await teacherTask(ps[0].id)).status, 'OPEN');
    assert.equal((await sales(ps[0].id)).length, 0);
    passed(
      'individual evaluation: strict input, current teacher only, exact end boundary, check-in and version required',
    );

    const key = randomUUID(),
      body = {
        feedback: '  Line one\r\nLine two  ',
        abilityNote: '  Developing confidence  ',
        preferenceNote: '  ',
      };
    const before = await db.classSession.findUniqueOrThrow({ where: { id: l.id } });
    const races = await Promise.all([
      evaluate(ps[0], body, t, key),
      evaluate(ps[0], body, t, key),
      evaluate(ps[0], { ...body, feedback: 'Line one\nLine two', preferenceNote: '' }),
    ]);
    races.forEach((r) => ok(r));
    assert.deepEqual(races[0].data, races[1].data);
    const saved = await person(ps[0].id);
    assert.equal(saved.feedback, 'Line one\nLine two');
    assert.equal(saved.abilityNote, 'Developing confidence');
    assert.equal(saved.preferenceNote, null);
    assert.equal(saved.version, ps[0].version + 1);
    assert.equal(saved.feedbackSubmittedAt.toISOString(), now.toISOString());
    assert.equal((await teacherTask(ps[0].id)).status, 'DONE');
    assert.equal((await teacherTask(ps[1].id)).status, 'OPEN');
    assert.equal((await teacherTask(ps[2].id)).status, 'OPEN');
    assert.equal(
      'feedbackSubmittedAt' in (await db.classSession.findUniqueOrThrow({ where: { id: l.id } })),
      false,
    );
    assert.equal(
      (await db.classSession.findUniqueOrThrow({ where: { id: l.id } })).version,
      before.version + 1,
    );
    const follow = (await sales(ps[0].id))[0];
    assert.equal((await sales(ps[0].id)).length, 1);
    assert.equal(follow.purpose, 'FIRST_PURCHASE');
    assert.equal(follow.assigneeId, a.user.id);
    assert.equal(follow.availableAt.toISOString(), now.toISOString());
    assert.equal(follow.sourceSnapshot.studentName, students[0].name);
    assert.equal(follow.sourceSnapshot.feedback, saved.feedback);
    assert.equal(follow.sourceSnapshot.teacherId, t.user.id);
    assert.equal(follow.sourceSnapshot.participantId, ps[0].id);
    ok(await req(a, `/tasks/${follow.id}`), 200);
    assert.equal((await req(b, `/tasks/${follow.id}`)).status, 403);
    assert.equal((await req(t, `/tasks/${follow.id}`)).status, 403);
    ok(await evaluate(ps[1]));
    assert.equal((await sales(ps[1].id))[0].assigneeId, b.user.id);
    assert.equal((await sales(ps[2].id)).length, 0);
    for (const p of ps.slice(0, 2))
      assert.equal(
        await db.entitlementEntry.count({ where: { participantId: p.id, kind: 'CONSUMPTION' } }),
        1,
      );
    assert.equal(
      await db.scheduleChange.count({
        where: { participantId: ps[0].id, action: 'STUDENT_FEEDBACK' },
      }),
      1,
    );
    code(await evaluate(ps[0], { feedback: 'Overwrite' }), 'RESULT_ALREADY_SUBMITTED');
    code(
      await evaluate(ps[0], { ...body, abilityNote: 'different' }, t, key),
      'IDEMPOTENCY_CONFLICT',
    );
    passed(
      'individual evaluation: three students/two arrivals, independent tasks and private owners, normalized concurrent retries without duplicate debit or follow-up',
    );

    const converted = await ready();
    ok(await purchase(converted.s));
    now = converted.l.endsAt;
    ok(await evaluate(converted.p));
    assert.equal((await teacherTask(converted.p.id)).status, 'DONE');
    assert.equal((await sales(converted.p.id)).length, 0);
    assert.equal((await person(converted.p.id)).membershipCategorySnapshot, 'TRIAL_STUDENT');
    now = l.endsAt;
    ok(await purchase(students[0]));
    const resolved = (await sales(ps[0].id))[0];
    assert.equal(resolved.status, 'DONE');
    assert.equal(resolved.followupOutcome, 'PURCHASE_RECORDED');
    assert.ok(resolved.resolvedByEntitlementEntryId);
    ok(await evaluate(ps[0], body));
    assert.deepEqual((await sales(ps[0].id))[0], resolved);
    const raceBuy = await ready();
    now = raceBuy.l.endsAt;
    const combined = await Promise.all([evaluate(raceBuy.p), purchase(raceBuy.s)]);
    combined.forEach((r) => ok(r));
    assert.equal((await teacherTask(raceBuy.p.id)).status, 'DONE');
    assert.equal((await sales(raceBuy.p.id)).filter((x) => x.status === 'OPEN').length, 0);
    assert.ok((await sales(raceBuy.p.id)).length <= 1);
    passed(
      'individual evaluation: purchase before/after submission and concurrent purchase preserve teaching and never leave open member sales work',
    );

    const reassigned = await ready();
    await db.student.update({ where: { id: reassigned.s.id }, data: { ownerAdminId: b.user.id } });
    now = new Date(reassigned.l.endsAt.getTime() + 7 * 86400000);
    ok(await evaluate(reassigned.p));
    const movedTask = (await sales(reassigned.p.id))[0];
    assert.equal(movedTask.assigneeId, b.user.id);
    assert.equal(movedTask.availableAt.toISOString(), now.toISOString());
    assert.equal(
      movedTask.dueAt.toISOString(),
      DateTime.fromJSDate(now, { zone: 'Australia/Melbourne' })
        .plus({ days: 1 })
        .set({ hour: 17, minute: 0, second: 0, millisecond: 0 })
        .toJSDate()
        .toISOString(),
    );
    assert.ok(movedTask.dueAt > now);
    assert.equal((await req(a, `/tasks/${movedTask.id}`)).status, 403);
    ok(await req(b, `/tasks/${movedTask.id}`), 200);
    passed(
      'individual evaluation: current responsible admin receives late feedback, next Melbourne-day deadline begins at submission',
    );

    const rollback = await ready();
    now = rollback.l.endsAt;
    const rollbackTask = await teacherTask(rollback.p.id),
      rollbackLesson = await db.classSession.findUniqueOrThrow({ where: { id: rollback.l.id } });
    const originalLog = teaching.log;
    try {
      teaching.log = async function (...args) {
        if (args[3] === 'STUDENT_FEEDBACK') throw new Error('Injected evaluation audit failure');
        return originalLog.apply(this, args);
      };
      assert.equal((await evaluate(rollback.p)).status, 500);
    } finally {
      teaching.log = originalLog;
    }
    assert.deepEqual(await person(rollback.p.id), rollback.p);
    assert.deepEqual(await teacherTask(rollback.p.id), rollbackTask);
    assert.equal((await sales(rollback.p.id)).length, 0);
    assert.equal(
      (await db.classSession.findUniqueOrThrow({ where: { id: rollback.l.id } })).version,
      rollbackLesson.version,
    );
    assert.equal(await db.entitlementEntry.count({ where: { participantId: rollback.p.id } }), 1);
    ok(await evaluate(rollback.p));
    passed(
      'individual evaluation: late failure rolls back feedback, teacher completion, follow-up and version while preserving the original check-in debit',
    );

    const conflict = await ready();
    now = conflict.l.endsAt;
    const conflictResults = await Promise.all([
      evaluate(conflict.p, { feedback: 'A' }),
      evaluate(conflict.p, { feedback: 'B' }),
    ]);
    assert.deepEqual(conflictResults.map((r) => r.status).sort(), [201, 409]);
    code(
      conflictResults.find((r) => r.status === 409),
      'RESULT_ALREADY_SUBMITTED',
    );
    assert.equal((await sales(conflict.p.id)).length, 1);
    const closed = await ready();
    const closedTask = await teacherTask(closed.p.id);
    await db.task.update({ where: { id: closedTask.id }, data: { status: 'CANCELLED' } });
    now = closed.l.endsAt;
    code(await evaluate(closed.p), 'TASK_CLOSED');
    const cancelled = await ready();
    await db.classSession.update({ where: { id: cancelled.l.id }, data: { status: 'CANCELLED' } });
    now = cancelled.l.endsAt;
    code(await evaluate(cancelled.p), 'BOOKING_INACTIVE');
    const member = await student(a);
    ok(await purchase(member));
    const memberLesson = await lesson(),
      memberP = await arrive(await book(member, memberLesson), memberLesson);
    now = memberLesson.endsAt;
    assert.equal((await evaluate(memberP)).status, 403);
    assert.equal((await sales(memberP.id)).length, 0);
    await db.classSession.update({ where: { id: l.id }, data: { teacherId: other.user.id } });
    assert.equal((await evaluate(ps[0], body, t, key)).status, 403);
    assert.equal((await evaluate(ps[0], body, other)).status, 403);
    passed(
      'individual evaluation: conflicting concurrent content, closed tasks, cancelled lessons, member without evaluation and receipt authorization denied',
    );
  } finally {
    clock.now = originalNow;
  }
}
