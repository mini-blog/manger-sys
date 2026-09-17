import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifyBookingCancel({
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
  teaching,
}) {
  let offset = 200;
  async function setup() {
    const s = await student(a, {});
    offset += 2;
    const l = await db.classSession.create({
      data: {
        classGroupId: groupId,
        courseId,
        teacherId: t.user.id,
        capacity: 1,
        startsAt: new Date(+now + offset * 3600000),
        endsAt: new Date(+now + (offset + 1) * 3600000),
      },
    });
    const p = ok(
      await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind: 'TRIAL' }),
    );
    return { s, l, p };
  }
  const cancel = (x, version = 1, actor = a, key = randomUUID()) =>
    req(
      actor,
      `/participants/${x.p.id}/cancel`,
      { expectedVersion: version, reason: 'Family unavailable' },
      { key },
    );
  const add = (x, kind = 'TRIAL') =>
    req(a, `/sessions/${x.l.id}/participants`, { studentId: x.s.id, kind });
  const state = async (x) => ({
    p: await db.sessionParticipant.findUniqueOrThrow({ where: { id: x.p.id } }),
    l: await db.classSession.findUniqueOrThrow({ where: { id: x.l.id } }),
    tasks: await db.task.findMany({ where: { participantId: x.p.id } }),
    ledger: await db.entitlementEntry.findMany({ where: { studentId: x.s.id } }),
  });
  const x = await setup(),
    before = await state(x),
    key = randomUUID();
  assert.equal((await cancel(x, 1, b)).status, 403);
  assert.equal((await cancel(x, 1, t)).status, 403);
  ok(await cancel(x, 1, a, key));
  ok(await cancel(x, 1, a, key));
  const after = await state(x);
  assert.equal(after.p.version, 2);
  assert.equal(after.l.version, before.l.version + 1);
  assert.equal(after.tasks.length, 1);
  assert.equal(after.tasks[0].status, 'CANCELLED');
  assert.deepEqual(after.ledger, before.ledger);
  assert.equal((await req(a, `/students/${x.s.id}/entitlements`)).data.balances.TRIAL.available, 1);
  assert.equal((await cancel(x, 2)).status, 409);
  assert.equal(ok(await add(x)).id, x.p.id);
  const readded = await state(x);
  assert.equal(readded.p.version, 3);
  assert.equal(readded.tasks.length, 1);
  assert.equal(readded.tasks[0].id, before.tasks[0].id);
  assert.equal(readded.tasks[0].status, 'OPEN');
  ok(await cancel(x, 3));
  ok(
    await req(a, '/entitlements/grants', {
      studentId: x.s.id,
      bucket: 'REGULAR',
      mode: 'CUSTOM',
      quantity: 2,
    }),
  );
  ok(await add(x, 'REGULAR'));
  assert.equal((await state(x)).p.kind, 'REGULAR');
  assert.equal((await state(x)).tasks[0].status, 'CANCELLED'); // Member does not reopen trial evaluation.
  assert.equal(
    await db.task.count({ where: { participantId: x.p.id, type: 'TRIAL_FOLLOWUP' } }),
    0,
  );
  passed(
    'cancel/add: preserves ledger, releases credit, reuses row and hidden task, allows new card and never creates rebooking',
  );

  const y = await setup(),
    saved = await state(y),
    original = teaching.log,
    failureKey = randomUUID();
  teaching.log = async function (...args) {
    await original.apply(this, args);
    if (args[3] === 'CANCEL_BOOKING' && args[9] === y.p.id)
      throw new Error('Injected cancel failure');
  };
  try {
    assert.equal((await cancel(y, 1, a, failureKey)).status, 500);
  } finally {
    teaching.log = original;
  }
  assert.deepEqual(await state(y), saved);
  assert.equal(await db.mutationReceipt.count({ where: { key: failureKey } }), 0);
  const race = await Promise.all([cancel(y), cancel(y)]);
  assert.deepEqual(race.map((x) => x.status).sort(), [201, 409]);
  const addOriginal = teaching.log;
  teaching.log = async function (...args) {
    await addOriginal.apply(this, args);
    if (args[3] === 'ADD_STUDENT' && args[9] === y.p.id) throw new Error('Injected re-add failure');
  };
  const cancelled = await state(y);
  try {
    assert.equal((await add(y)).status, 500);
  } finally {
    teaching.log = addOriginal;
  }
  assert.deepEqual(await state(y), cancelled);
  const rerace = await Promise.all([add(y), add(y)]);
  assert.deepEqual(rerace.map((x) => x.status).sort(), [201, 409]);
  assert.equal(await db.task.count({ where: { participantId: y.p.id } }), 1);
  passed(
    'cancel/add: concurrent requests, foreign roles, audit/task/receipt rollback and retry remain atomic',
  );

  const z = await setup();
  await db.sessionParticipant.update({
    where: { id: z.p.id },
    data: {
      bookingStatus: 'CANCELLED',
      attendance: 'ATTENDED',
      checkedInAt: now,
      checkedInBy: t.user.id,
      feedbackSubmittedAt: now,
    },
  });
  assert.equal((await add(z)).data.code, 'ALREADY_BOOKED');
  await db.sessionParticipant.update({
    where: { id: z.p.id },
    data: { feedbackSubmittedAt: null, attendance: 'ATTENDED' },
  });
  assert.equal((await add(z)).data.code, 'ALREADY_BOOKED');
  passed('cancel/add: completed participant records cannot be reused');
}
