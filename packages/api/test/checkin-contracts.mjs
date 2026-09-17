import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Schema/read-contract fixtures only: this task does not implement check-in or new feedback commands.
export async function verifyCheckinContracts({
  db,
  pool,
  req,
  ok,
  student,
  participant,
  a,
  b,
  t,
  now,
  passed,
  document,
}) {
  assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
  const s = await student(a, {
    name: 'Check-in contract fixture',
    guardianName: 'Parent',
    guardianEmail: 'parent@test.invalid',
  });
  const p = await participant(s.id);
  const s2 = await student(a);
  const p2 = await db.sessionParticipant.create({
    data: { sessionId: p.sessionId, studentId: s2.id, kind: 'TRIAL' },
  });
  const createTask = (type, participantId, extra = {}) =>
    db.task.create({
      data: {
        type,
        participantId,
        sessionId: p.sessionId,
        assigneeId: type === 'TRIAL_FOLLOWUP' ? a.user.id : t.user.id,
        availableAt: now,
        dueAt: now,
        ...extra,
      },
    });
  const failSql = async (sql, args, code) =>
    assert.rejects(pool.query(sql, args), (e) => e.code === code);
  const rawTask = (type, participantId) => [
    randomUUID(),
    type,
    t.user.id,
    p.sessionId,
    participantId,
  ];
  const insertTask = `INSERT INTO "Task" (id,type,"assigneeId","sessionId","participantId","availableAt","dueAt","updatedAt") VALUES ($1,$2,$3,$4,$5,now(),now(),now())`;

  const teacher = await createTask('TRIAL_FEEDBACK', p.id);
  await createTask('TRIAL_FEEDBACK', p2.id); // Two evaluation tasks in one class are legal.
  const admin = await createTask('TRIAL_FOLLOWUP', p.id, { purpose: 'FIRST_PURCHASE' });
  await createTask('LESSON_FEEDBACK', null); // Legacy class-level history remains legal.
  await failSql(insertTask, rawTask('TRIAL_FEEDBACK', p.id), '23505');
  await failSql(insertTask, rawTask('TRIAL_FEEDBACK', null), '23514');
  await failSql(insertTask, rawTask('TRIAL_FOLLOWUP', p.id), '23505');
  await failSql(insertTask, rawTask('TRIAL_FOLLOWUP', null), '23514');
  await failSql(insertTask, rawTask('LESSON_FEEDBACK', p2.id), '23514');
  await failSql(insertTask, rawTask('LESSON_FEEDBACK', null), '23505');
  await failSql(
    'UPDATE "Task" SET purpose=$1 WHERE id=$2',
    ['FIRST_PURCHASE', teacher.id],
    '23514',
  );
  passed(
    'individual teacher tasks are unique per participant, separate from admin tasks and legacy lesson history',
  );

  let roster = ok(await req(t, `/sessions/${p.sessionId}/participants`), 200);
  let row = roster.participants.find((r) => r.participantId === p.id);
  assert.deepEqual(
    [row.attendance, row.checkedInAt, row.checkedInBy, row.feedbackSubmittedAt],
    ['PENDING', null, null, null],
  );
  await failSql('UPDATE "SessionParticipant" SET "checkedInAt"=now() WHERE id=$1', [p.id], '23514');
  await failSql(
    'UPDATE "SessionParticipant" SET "checkedInBy"=$1 WHERE id=$2',
    [t.user.id, p.id],
    '23514',
  );
  await failSql(
    'UPDATE "SessionParticipant" SET "checkedInAt"=now(), "checkedInBy"=$1 WHERE id=$2',
    [t.user.id, p.id],
    '23514',
  );
  await failSql(
    'UPDATE "SessionParticipant" SET "feedbackSubmittedAt"=now() WHERE id=$1',
    [p.id],
    '23514',
  );
  await failSql(
    `UPDATE "SessionParticipant" SET attendance='ATTENDED', "checkedInAt"=now(), "checkedInBy"=$1 WHERE id=$2`,
    ['missing-user', p.id],
    '23503',
  );
  // Seed a signed record to verify storage and serialization, not the future command's business rules.
  await db.sessionParticipant.update({
    where: { id: p.id },
    data: {
      attendance: 'ATTENDED',
      checkedInAt: now,
      checkedInBy: t.user.id,
      feedbackSubmittedAt: now,
    },
  });
  roster = ok(await req(t, `/sessions/${p.sessionId}/participants`), 200);
  row = roster.participants.find((r) => r.participantId === p.id);
  assert.deepEqual(
    [row.checkedInAt, row.checkedInBy, row.feedbackSubmittedAt],
    [now.toISOString(), t.user.id, now.toISOString()],
  );
  assert.equal(row.attendance, 'ATTENDED');
  // Existing attendance from the old workflow is explicitly allowed without invented sign-in data.
  await db.sessionParticipant.update({ where: { id: p2.id }, data: { attendance: 'ATTENDED' } });
  assert.equal(
    (await db.sessionParticipant.findUnique({ where: { id: p2.id } })).checkedInAt,
    null,
  );
  passed(
    'check-in audit fields enforce paired attendance facts and serialize without fabricating legacy timestamps',
  );

  await failSql(
    'UPDATE "Task" SET "followupOutcome"=$1 WHERE id=$2',
    ['MADE_UP', admin.id],
    '22P02',
  );
  await failSql(
    'UPDATE "Task" SET "followupOutcome"=$1 WHERE id=$2',
    ['CONSIDERING', admin.id],
    '23514',
  );
  await failSql(
    `UPDATE "Task" SET status='DONE', "completedAt"=now(), "followupOutcome"='CONSIDERING' WHERE id=$1`,
    [teacher.id],
    '23514',
  );
  await failSql(
    `UPDATE "Task" SET status='DONE', "followupOutcome"='CONSIDERING' WHERE id=$1`,
    [admin.id],
    '23514',
  );
  await failSql(
    `UPDATE "Task" SET status='DONE', "completedAt"=now(), "followupOutcome"='PURCHASE_RECORDED' WHERE id=$1`,
    [admin.id],
    '23514',
  );
  for (const followupOutcome of ['INTERESTED', 'CONSIDERING', 'NOT_INTERESTED', 'UNREACHABLE']) {
    await db.task.update({
      where: { id: admin.id },
      data: { status: 'DONE', completedAt: now, followupOutcome },
    });
    const detail = ok(await req(a, `/tasks/${admin.id}`), 200);
    assert.equal(detail.status, 'DONE');
    assert.equal(detail.followupOutcome, followupOutcome);
    assert.equal(detail.student.type, 'TRIAL');
  }
  assert.equal((await req(b, `/tasks/${admin.id}`)).status, 403);
  assert.equal((await req(t, `/tasks/${admin.id}`)).status, 403);
  passed('final follow-up outcomes require completed admin tasks and do not confer membership');

  const communication = {
    guardianNameSnapshot: 'Parent',
    channel: 'EMAIL',
    occurredAt: now.toISOString(),
    content: 'The parent is comparing lesson times.',
    concerns: 'Time and price',
    coreQuestion: 'Is Sunday possible?',
    reasonTags: ['TIME', 'PRICE'],
  };
  const key = randomUUID();
  const created = ok(await req(a, `/students/${s.id}/communications`, communication, { key }));
  assert.deepEqual(
    ok(await req(a, `/students/${s.id}/communications`, communication, { key })),
    created,
  );
  const list = ok(await req(a, `/students/${s.id}/communications`), 200);
  const log = list.items.find((r) => r.id === created.id);
  assert.equal(log.concerns, communication.concerns);
  assert.equal(log.coreQuestion, communication.coreQuestion);
  assert.deepEqual(log.reasonTags, communication.reasonTags);
  assert.equal(list.total, 1);
  for (const fields of [
    { reasonTags: ['TIME', 'TIME'] },
    { reasonTags: ['INVALID'] },
    { reasonTags: 'TIME' },
    { reasonTags: [null] },
    { concerns: 'x'.repeat(2001) },
    { coreQuestion: 'x'.repeat(1001) },
    { concerns: null },
    { followupOutcome: 'PURCHASE_RECORDED' },
  ])
    assert.equal(
      (await req(a, `/students/${s.id}/communications`, { ...communication, ...fields })).status,
      400,
    );
  const plain = { ...communication };
  delete plain.concerns;
  delete plain.coreQuestion;
  delete plain.reasonTags;
  const empty = ok(await req(a, `/students/${s.id}/communications`, plain));
  const emptyLog = await db.communicationLog.findUnique({ where: { id: empty.id } });
  assert.deepEqual(
    [emptyLog.concerns, emptyLog.coreQuestion, emptyLog.reasonTags],
    [null, null, []],
  );
  assert.equal((await req(b, `/students/${s.id}/communications`)).status, 403);
  assert.equal((await req(t, `/students/${s.id}/communications`)).status, 403);
  assert.equal(await db.communicationLog.count({ where: { studentId: s.id } }), 2);
  passed(
    'guardian concerns and core questions round-trip privately with validation and idempotency',
  );

  const schemas = document.components.schemas;
  assert.ok(schemas.TaskDto.properties.type.enum.includes('TRIAL_FEEDBACK'));
  assert.ok(schemas.TaskDto.properties.followupOutcome.enum.includes('UNREACHABLE'));
  assert.equal(schemas.TaskDto.properties.followupOutcome.nullable, true);
  for (const field of ['checkedInAt', 'checkedInBy', 'feedbackSubmittedAt']) {
    assert.ok(schemas.ParticipantDto.required.includes(field));
    assert.equal(schemas.ParticipantDto.properties[field].nullable, true);
  }
  assert.equal(schemas.CommunicationDto.properties.reasonTags.maxItems, 7);
  assert.equal(schemas.CommunicationDto.properties.reasonTags.uniqueItems, true);
  assert.ok(schemas.CommunicationDto.properties.reasonTags.items.enum.includes('PRICE'));
  // No new endpoint is advertised until its actual command is implemented.
  assert.equal(document.paths['/api/participants/{id}/check-in'], undefined);
  assert.equal(document.paths['/api/participants/{id}/feedback'], undefined);
  passed(
    'OpenAPI describes new read and communication contracts without claiming unimplemented endpoints',
  );
}
