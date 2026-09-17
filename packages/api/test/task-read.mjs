import assert from 'node:assert/strict';

export async function verifyTaskRead({
  db,
  req,
  ok,
  student,
  a,
  b,
  t,
  courseId,
  groupId,
  clock,
  passed,
}) {
  const original = clock.now,
    base = original();
  let now = base;
  clock.now = () => now;
  try {
    const marker = `Task read ${Date.now()}`;
    const l = await db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        startsAt: new Date(+base + 700 * 3600000),
        endsAt: new Date(+base + 701 * 3600000),
      },
    });
    const ps = [];
    for (let i = 0; i < 3; i++) {
      const s = await student(a, { name: `${marker} ${i}` });
      ps.push(
        ok(await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind: 'TRIAL' })).id,
      );
    }
    const tasks = await db.task.findMany({
      where: { participantId: { in: ps }, type: 'TRIAL_FEEDBACK' },
    });
    const taskFor = (id) => tasks.find((x) => x.participantId === id);
    const list = async (extra = '') =>
      ok(await req(t, `/tasks?q=${encodeURIComponent(marker)}${extra}`), 200);
    assert.equal((await list()).total, 0);
    now = l.startsAt;
    for (const id of ps.slice(0, 2)) {
      const p = await db.sessionParticipant.findUniqueOrThrow({ where: { id } });
      ok(await req(t, `/participants/${id}/check-in`, { expectedVersion: p.version }));
    }
    assert.equal((await list()).total, 0);
    assert.equal((await req(t, `/tasks/${taskFor(ps[0]).id}`)).status, 403);
    now = l.endsAt;
    const visible = await list(),
      badge = await list('&pageSize=5');
    assert.equal(visible.total, 2);
    assert.equal(badge.total, 2);
    assert.equal(visible.items.length, 2);
    assert.equal((await list('&pageSize=1&page=2')).items.length, 1);
    assert.equal((await req(t, `/tasks/${taskFor(ps[2]).id}`)).status, 403);
    assert.equal(
      (await db.task.findUniqueOrThrow({ where: { id: taskFor(ps[2]).id } })).status,
      'OPEN',
    );
    assert.equal((await req(a, `/tasks/${taskFor(ps[0]).id}`)).status, 403);
    passed('task read: three bookings, two check-ins, exact end visibility and badge totals');
    const p = await db.sessionParticipant.findUniqueOrThrow({ where: { id: ps[0] } });
    ok(
      await req(t, `/participants/${p.id}/feedback`, {
        expectedVersion: p.version,
        feedback: 'Works well with diagrams.',
      }),
    );
    await db.task.update({
      where: { id: taskFor(p.id).id },
      data: {
        sourceSnapshot: {
          feedback: 'Works well with diagrams.',
          guardianEmail: 'private',
          price: 500,
        },
      },
    });
    const done = ok(await req(t, `/tasks/${taskFor(p.id).id}`), 200);
    assert.equal(done.status, 'DONE');
    assert.equal(done.studentVersion, done.student.version);
    assert.equal(done.taskVersion, done.version);
    assert.deepEqual(done.sourceSnapshot, { feedback: 'Works well with diagrams.' });
    assert.equal('guardianEmail' in done.student, false);
    assert.equal('communications' in done, false);
    assert.equal((await list('&status=DONE')).total, 1);
    const follow = await db.task.findFirstOrThrow({
      where: { participantId: p.id, type: 'TRIAL_FOLLOWUP' },
    });
    await db.task.update({
      where: { id: follow.id },
      data: { status: 'DONE', followupOutcome: 'NOT_INTERESTED', completedAt: now },
    });
    await db.communicationLog.create({
      data: {
        studentId: p.studentId,
        taskId: follow.id,
        createdBy: a.user.id,
        guardianNameSnapshot: 'Guardian',
        channel: 'PHONE',
        content: 'Discussed lessons',
        concerns: 'Timing',
        coreQuestion: 'Weekend availability',
        reasonTags: [],
        outcome: 'NOT_INTERESTED',
        occurredAt: now,
      },
    });
    const sales = ok(await req(a, `/tasks/${follow.id}`), 200);
    assert.equal(sales.followupOutcome, 'NOT_INTERESTED');
    assert.equal(sales.membershipCategory, 'TRIAL_STUDENT');
    assert.equal(sales.communications[0].concerns, 'Timing');
    assert.equal((await req(b, `/tasks/${follow.id}`)).status, 403);
    assert.equal((await req(t, `/tasks/${follow.id}`)).status, 403);
    assert.ok(ok(await req(a, '/tasks?status=DONE'), 200).items.some((x) => x.id === follow.id));
    passed(
      'task read: completed evaluation privacy and actual admin follow-up outcome/communications',
    );
    const unsigned = await db.sessionParticipant.findUniqueOrThrow({ where: { id: ps[2] } });
    ok(
      await req(t, `/participants/${unsigned.id}/check-in`, { expectedVersion: unsigned.version }),
    );
    assert.equal((await list()).total, 2);
    await db.task.update({
      where: { id: taskFor(ps[2]).id },
      data: { status: 'CANCELLED', availableAt: new Date(+now + 86400000) },
    });
    await db.sessionParticipant.update({
      where: { id: ps[2] },
      data: { bookingStatus: 'CANCELLED' },
    });
    assert.equal(ok(await req(t, `/tasks/${taskFor(ps[2]).id}`), 200).status, 'CANCELLED');
    assert.equal((await list('&status=CANCELLED')).total, 1);
    // Simulate reassignment independently of command restrictions: reads must enforce both owners.
    await db.classSession.update({ where: { id: l.id }, data: { teacherId: a.user.id } });
    assert.equal((await list()).total, 0);
    assert.equal((await req(t, `/tasks/${taskFor(ps[0]).id}`)).status, 403);
    assert.equal((await list('&status=CANCELLED')).total, 0);
    await db.classSession.update({ where: { id: l.id }, data: { teacherId: t.user.id } });
    passed('task read: late check-in, cancelled history and reassignment revoke access');
  } finally {
    clock.now = original;
  }
}
