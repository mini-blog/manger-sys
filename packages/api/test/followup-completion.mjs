import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifyFollowupCompletion({
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
  studentsService,
}) {
  const original = clock.now,
    base = original();
  let now = base,
    offset = 900;
  clock.now = () => now;
  async function ready() {
    now = base;
    const s = await student(a, { guardianName: 'Parent', guardianEmail: 'test@example.com' });
    offset += 2;
    const l = await db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        startsAt: new Date(+base + offset * 3600000),
        endsAt: new Date(+base + (offset + 1) * 3600000),
      },
    });
    const id = ok(
      await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind: 'TRIAL' }),
    ).id;
    now = l.startsAt;
    ok(await req(t, `/participants/${id}/check-in`, { expectedVersion: 1 }));
    now = l.endsAt;
    ok(
      await req(t, `/participants/${id}/feedback`, {
        expectedVersion: 2,
        feedback: 'Engaged with fractions.',
      }),
    );
    const task = await db.task.findFirstOrThrow({
      where: { participantId: id, type: 'TRIAL_FOLLOWUP' },
    });
    return { s, l, task };
  }
  const body = (task, outcome) => ({
    expectedVersion: task.version,
    outcome,
    communication: {
      guardianNameSnapshot: 'Parent',
      channel: 'EMAIL',
      occurredAt: now.toISOString(),
      content:
        outcome === 'UNREACHABLE'
          ? 'Sent email; no reply.'
          : 'Family says weekend travel makes lessons difficult.',
      concerns: 'Travel',
      coreQuestion: 'Weekend options?',
      reasonTags: ['TIME', 'FAMILY_PLAN'],
    },
  });
  const grant = (s) =>
    req(a, '/entitlements/grants', {
      studentId: s.id,
      bucket: 'REGULAR',
      mode: 'CUSTOM',
      quantity: 5,
    });
  try {
    for (const outcome of ['INTERESTED', 'CONSIDERING', 'NOT_INTERESTED', 'UNREACHABLE']) {
      const { s, task } = await ready(),
        data = body(task, outcome),
        key = randomUUID();
      for (const u of [b, t])
        assert.equal((await req(u, `/tasks/${task.id}/follow-up`, data)).status, 403);
      assert.equal(
        (await req(a, `/tasks/${task.id}/follow-up`, { ...data, outcome: 'PURCHASE_RECORDED' }))
          .status,
        400,
      );
      assert.equal(
        (await req(a, `/tasks/${task.id}/follow-up`, { ...data, nextDueAt: now.toISOString() }))
          .status,
        400,
      );
      assert.equal(
        (
          await req(a, `/tasks/${task.id}/follow-up`, {
            ...data,
            communication: { ...data.communication, content: '  ' },
          })
        ).status,
        400,
      );
      const results = await Promise.all([
        req(a, `/tasks/${task.id}/follow-up`, data, { key }),
        req(a, `/tasks/${task.id}/follow-up`, data, { key }),
      ]);
      results.forEach((r) => ok(r));
      const done = ok(await req(a, `/tasks/${task.id}`), 200);
      assert.equal(done.status, 'DONE');
      assert.equal(done.followupOutcome, outcome);
      assert.equal(done.completedAt, now.toISOString());
      assert.equal(done.communications.length, 1);
      assert.equal(done.communications[0].concerns, 'Travel');
      assert.equal(done.communications[0].coreQuestion, 'Weekend options?');
      assert.equal(done.membershipCategory, 'TRIAL_STUDENT');
      ok(await grant(s));
      const after = ok(await req(a, `/tasks/${task.id}`), 200);
      assert.equal(after.followupOutcome, outcome);
      assert.equal(after.membershipCategory, 'NEW_MEMBER');
    }
    passed(
      'follow-up: all four results complete once, preserve communication and do not imply purchase',
    );
    const f = await ready(),
      data = body(f.task, 'CONSIDERING');
    const originalLog = studentsService.log;
    studentsService.log = async function (...args) {
      await originalLog.apply(this, args);
      throw new Error('Injected after communication insert');
    };
    try {
      assert.equal((await req(a, `/tasks/${f.task.id}/follow-up`, data)).status, 500);
    } finally {
      studentsService.log = originalLog;
    }
    assert.equal(await db.communicationLog.count({ where: { taskId: f.task.id } }), 0);
    assert.equal((await db.task.findUniqueOrThrow({ where: { id: f.task.id } })).status, 'OPEN');
    const race = await Promise.all([grant(f.s), req(a, `/tasks/${f.task.id}/follow-up`, data)]);
    ok(race[0]);
    assert.ok([201, 409].includes(race[1].status));
    const final = ok(await req(a, `/tasks/${f.task.id}`), 200);
    assert.equal(final.status, 'DONE');
    if (race[1].status === 409) {
      assert.equal(final.followupOutcome, 'PURCHASE_RECORDED');
      assert.equal(final.communications.length, 0);
      assert.ok(final.resolvedByEntitlementEntryId);
    } else {
      assert.equal(final.followupOutcome, 'CONSIDERING');
      assert.equal(final.communications.length, 1);
    }
    assert.equal((await req(a, `/tasks/${f.task.id}/follow-up`, data)).status, 409);
    passed(
      'follow-up: transaction rollback and purchase-versus-completion race preserve the winning outcome',
    );
    for (const path of [
      `/participants/${f.task.participantId}/restore`,
      `/participants/${f.task.participantId}/move`,
      `/sessions/${f.l.id}/feedback`,
      `/tasks/${f.task.id}/reopen`,
    ])
      assert.equal((await req(a, path, {})).status, 404);
    assert.equal(
      (await req(a, `/students/${f.s.id}/trial-eligibility?courseId=${courseId}`)).status,
      404,
    );
    passed('retired endpoints reject direct calls; no hidden legacy write path');
  } finally {
    clock.now = original;
  }
}
