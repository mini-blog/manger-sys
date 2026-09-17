import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { verifyBookingCreate } from './booking-create.mjs';
import { verifyStudentType } from './student-type.mjs';
import { verifyBookingCancel } from './booking-cancel.mjs';
import { verifyBookingRestore } from './booking-restore.mjs';
// Destructive test fixtures may only run in the disposable database created by the runner.
assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true', 'Run pnpm test:entitlements.');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/entitlement_test');
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/prisma.service');
const { Clock, Commands } = require('../dist/common/domain');
const { EntitlementsService } = require('../dist/workflow/entitlements.service');
const { TeachingService } = require('../dist/workflow/teaching.service');
const { ensureFollowup, closeRebooking } = require('../dist/workflow/followup-policy');
const { hashPassword } = require('../dist/auth/password');
let groups = 0;
const passed = (name) => {
  groups++;
  console.log(`✓ ${name}`);
};
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Verify expansion with existing rows, rather than only starting from an empty schema.
const client = await pool.connect();
try {
  await client.query('CREATE SCHEMA upgrade_test');
  await client.query('SET search_path TO upgrade_test');
  const root = new URL('../prisma/migrations/', import.meta.url);
  const migrations = (await readdir(root)).filter((n) => /^\d/.test(n)).sort();
  for (const name of migrations.slice(0, 2))
    await client.query(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
  await client.query(`INSERT INTO "User" VALUES ('legacy-a', 'legacy@test.invalid', 'Legacy', 'ADMIN', 'fixture');
    INSERT INTO "Student" (id, name, "yearLevel", "ownerAdminId", "firstEnrolledOn", "updatedAt") VALUES ('legacy-s', 'Existing', 'Year 4', 'legacy-a', '2026-09-01', now());
    INSERT INTO "Course" VALUES ('legacy-c', 'Math');
    INSERT INTO "ClassGroup" VALUES ('legacy-g', 'Group', 'Year 4');
    INSERT INTO "ClassSession" (id,"classGroupId","courseId","teacherId","startsAt","endsAt",capacity) VALUES ('legacy-l','legacy-g','legacy-c','legacy-a',now(),now()+interval '1 hour',10);
    INSERT INTO "SessionParticipant" (id,"sessionId","studentId",kind) VALUES ('legacy-p','legacy-l','legacy-s','TRIAL');
    INSERT INTO "Task" (id,type,"assigneeId","sessionId","participantId","availableAt","dueAt","updatedAt") VALUES ('legacy-t','TRIAL_FOLLOWUP','legacy-a','legacy-l','legacy-p',now(),now(),now());`);
  const before = (await client.query('SELECT * FROM "Student"')).rows[0];
  const taskBefore = (await client.query('SELECT * FROM "Task"')).rows[0];
  for (const name of migrations.slice(2))
    await client.query(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
  const {
    firstPurchasedAt,
    type,
    guardianOccupation,
    guardianAge,
    guardianGender,
    gender,
    age,
    ...after
  } = (await client.query('SELECT * FROM "Student"')).rows[0];
  assert.equal(firstPurchasedAt, null);
  assert.equal(type, 'TRIAL');
  assert.equal(guardianAge, null);
  assert.equal(age, null);
  assert.equal(gender, null);
  assert.equal(guardianGender, null);
  assert.equal(guardianOccupation, null);
  const legacyLink = (
    await client.query('SELECT * FROM "StudentAdminLink" WHERE "studentId" = $1', ['legacy-s'])
  ).rows[0];
  assert.equal(legacyLink.adminId, 'legacy-a');
  assert.equal(legacyLink.createdByAdminId, null);
  assert.deepEqual(after, before);
  const { purpose, resolvedByEntitlementEntryId, rebookedToParticipantId, ...taskAfter } = (
    await client.query('SELECT * FROM "Task"')
  ).rows[0];
  assert.deepEqual(taskAfter, taskBefore);
  assert.equal(purpose, null);
  assert.equal(resolvedByEntitlementEntryId, null);
  assert.equal(rebookedToParticipantId, null);
  assert.equal(
    (await client.query('SELECT count(*)::int AS n FROM "EntitlementEntry"')).rows[0].n,
    0,
  );
  passed(
    'incremental migrations preserve existing student, task and enrolment data without invented credits',
  );
} finally {
  await client.query('SET search_path TO public');
  await client.query('DROP SCHEMA upgrade_test CASCADE');
  client.release();
}

const { app, document } = await createApp();
app.useLogger(false);
const db = app.get(PrismaService),
  service = app.get(EntitlementsService),
  commands = app.get(Commands);
let now = new Date('2028-09-04T00:00:00.123Z');
app.get(Clock).now = () => now;
await app.listen(0, '127.0.0.1');
const base = `${await app.getUrl()}/api`;
const prefix = `credits-${randomUUID()}`;
const userIds = ['a', 'b', 't'].map((x) => `${prefix}-${x}`);
const courseId = `${prefix}-math`,
  otherCourseId = `${prefix}-english`,
  groupId = `${prefix}-group`;
async function req(u, path, body, { method = 'POST', key = randomUUID(), csrf = true } = {}) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : method,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      ...(u ? { cookie: u.cookie, ...(csrf ? { 'x-csrf-token': u.csrfToken } : {}) } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: await res.json() };
}
function ok(r, status = 201) {
  assert.equal(r.status, status, JSON.stringify(r.data));
  return r.data;
}
async function login(i) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${userIds[i]}@test.invalid`, password: 'TestPass2026!' }),
  });
  assert.equal(r.status, 200);
  return { cookie: r.headers.getSetCookie()[0].split(';')[0], ...(await r.json()) };
}
async function student(u, extra = {}) {
  return ok(await req(u, '/students', { name: 'Credit student', yearLevel: 'Year 4', ...extra }));
}
const write = (u, fn) =>
  commands.run(
    u.user,
    'test-fixture',
    randomUUID(),
    {},
    async () => {},
    async (tx) => (await fn(tx)) ?? null,
  );
async function participant(studentId, extra = {}, sessionExtra = {}) {
  const session = await db.classSession.create({
    data: {
      classGroupId: groupId,
      courseId,
      teacherId: userIds[2],
      capacity: 10,
      startsAt: new Date(now.getTime() + 3600000),
      endsAt: new Date(now.getTime() + 7200000),
      ...sessionExtra,
    },
  });
  return db.sessionParticipant.create({
    data: { sessionId: session.id, studentId, kind: 'TRIAL', ...extra },
  });
}
try {
  const passwordHash = await hashPassword('TestPass2026!');
  for (let i = 0; i < 3; i++)
    await db.user.create({
      data: {
        id: userIds[i],
        name: `Credit staff ${i}`,
        email: `${userIds[i]}@test.invalid`,
        role: i === 2 ? 'TEACHER' : 'ADMIN',
        passwordHash,
      },
    });
  await db.course.createMany({
    data: [
      { id: courseId, name: courseId },
      { id: otherCourseId, name: otherCourseId },
    ],
  });
  await db.classGroup.create({ data: { id: groupId, name: groupId, targetLevel: 'Year 4' } });
  const [a, b, t] = await Promise.all([0, 1, 2].map(login));
  const s = await student(a),
    zero = await student(a, { name: 'Zero', giftTrialCredit: false }),
    foreign = await student(b);
  let entries = await db.entitlementEntry.findMany({ where: { studentId: s.id } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'INITIAL_TRIAL');
  assert.equal(entries[0].quantity, 1);
  assert.equal(await db.entitlementEntry.count({ where: { studentId: zero.id } }), 0);
  assert.equal((await db.student.findUnique({ where: { id: s.id } })).firstPurchasedAt, null);
  const createKey = randomUUID(),
    createBody = { name: 'Retry', yearLevel: 'Year 4', giftTrialCredit: true };
  const retries = await Promise.all([
    req(a, '/students', createBody, { key: createKey }),
    req(a, '/students', createBody, { key: createKey }),
  ]);
  assert.deepEqual(ok(retries[0]), ok(retries[1]));
  assert.equal(await db.entitlementEntry.count({ where: { studentId: retries[0].data.id } }), 1);
  assert.equal(
    (await req(a, '/students', { ...createBody, giftTrialCredit: false }, { key: createKey }))
      .status,
    409,
  );
  for (const fields of [
    { giftTrialCredit: null },
    { giftTrialCredit: 'false' },
    { giftTrialCredit: 0 },
    { quantity: 5 },
    { initialTrialHours: 2 },
    { firstPurchasedAt: now.toISOString() },
    { firstEnrolledOn: '2026-01-01' },
  ])
    assert.equal(
      (await req(a, '/students', { name: 'Invalid', yearLevel: 'Year 4', ...fields })).status,
      400,
    );
  for (const fields of [{ giftTrialCredit: true }, { firstEnrolledOn: '2026-01-01' }])
    assert.equal(
      (await req(a, `/students/${s.id}`, { expectedVersion: 1, ...fields }, { method: 'PATCH' }))
        .status,
      400,
    );
  assert.equal((await req(t, '/students', createBody)).status, 403);
  // Fault inside initial grant must roll back both the student and idempotency receipt.
  const originalInitial = service.initialTrialGrant.bind(service);
  const faultKey = randomUUID();
  service.initialTrialGrant = async (...args) => {
    await originalInitial(...args);
    throw new Error('Injected gift failure');
  };
  assert.equal(
    (await req(a, '/students', { name: 'Rollback gift', yearLevel: 'Year 4' }, { key: faultKey }))
      .status,
    500,
  );
  service.initialTrialGrant = originalInitial;
  assert.equal(await db.student.count({ where: { name: 'Rollback gift' } }), 0);
  assert.equal(await db.mutationReceipt.count({ where: { key: faultKey } }), 0);
  passed('student optional gift, strict write fields, concurrent replay and complete rollback');

  const profile = await student(a, {
    guardianName: 'Test Guardian',
    guardianRelationship: 'Mother',
    guardianOccupation: 'Engineer',
    guardianAge: 38,
    guardianGender: 'FEMALE',
    guardianEmail: 'parent@example.test',
    guardianPhone: '0412345678',
    preferredChannel: 'EMAIL',
  });
  let detail = ok(await req(a, `/students/${profile.id}`), 200);
  assert.equal(detail.guardianAge, 38);
  assert.equal(detail.guardianOccupation, 'Engineer');
  assert.equal(detail.guardianPhone, '+61412345678');
  assert.equal(detail.responsibleAdmin.id, a.user.id);
  assert.equal(detail.recordedByAdmin.id, a.user.id);
  assert.equal(await db.studentAdminLink.count({ where: { studentId: retries[0].data.id } }), 1);
  const otherView = ok(await req(b, `/students/${profile.id}`), 200);
  for (const field of ['guardianAge', 'guardianGender', 'guardianOccupation', 'guardianEmail'])
    assert.equal(field in otherView, false);
  await participant(profile.id);
  const teacherView = ok(await req(t, `/students/${profile.id}`), 200);
  for (const field of [
    'guardianAge',
    'guardianGender',
    'guardianOccupation',
    'guardianPhone',
    'responsibleAdmin',
    'recordedByAdmin',
  ])
    assert.equal(field in teacherView, false);
  for (const fields of [
    { guardianAge: -1 },
    { guardianAge: 121 },
    { guardianAge: 3.5 },
    { guardianAge: '38' },
    { guardianGender: 'invalid' },
    { guardianOccupation: 'x'.repeat(121) },
    { guardianEmail: 'invalid' },
    { guardianPhone: '123' },
    { createdByAdminId: b.user.id },
    { adminLink: { adminId: b.user.id } },
  ])
    assert.equal(
      (await req(a, '/students', { name: 'Invalid profile', yearLevel: 'Year 4', ...fields }))
        .status,
      400,
    );
  assert.equal(
    (
      await req(
        a,
        `/students/${profile.id}`,
        { expectedVersion: detail.version, guardianAge: 40, clearGuardianAge: true },
        { method: 'PATCH' },
      )
    ).status,
    400,
  );
  ok(
    await req(
      a,
      `/students/${profile.id}`,
      { expectedVersion: detail.version, clearGuardianAge: true, guardianOccupation: 'Teacher' },
      { method: 'PATCH' },
    ),
    200,
  );
  detail = ok(await req(a, `/students/${profile.id}`), 200);
  assert.equal(detail.guardianAge, null);
  assert.equal(detail.guardianOccupation, 'Teacher');
  await db.student.update({ where: { id: profile.id }, data: { ownerAdminId: b.user.id } });
  const reassigned = await db.studentAdminLink.findUnique({ where: { studentId: profile.id } });
  assert.equal(reassigned.adminId, b.user.id);
  assert.equal(reassigned.createdByAdminId, a.user.id);
  await assert.rejects(
    db.studentAdminLink.update({
      where: { studentId: profile.id },
      data: { createdByAdminId: b.user.id },
    }),
  );
  await assert.rejects(
    db.studentAdminLink.update({ where: { studentId: profile.id }, data: { adminId: a.user.id } }),
  );
  await assert.rejects(db.studentAdminLink.delete({ where: { studentId: profile.id } }));
  passed(
    'guardian profile validation/privacy, authenticated recorder, migration backfill and consistent immutable admin link',
  );

  const demographic = await student(a, { name: 'Demographic student', gender: 'FEMALE', age: 10 });
  const demographicPage = ok(await req(a, '/students?q=Demographic'), 200);
  assert.equal(demographicPage.items[0].age, 10);
  assert.equal(demographicPage.items[0].gender, 'FEMALE');
  assert.equal(demographicPage.items[0].responsibleAdmin.id, a.user.id);
  assert.equal('adminLink' in demographicPage.items[0], false);
  for (const badFields of [
    { age: -1 },
    { age: 121 },
    { age: 1.5 },
    { age: '10' },
    { gender: 'invalid' },
  ])
    assert.equal(
      (await req(a, '/students', { name: 'Invalid age', yearLevel: 'Year 4', ...badFields }))
        .status,
      400,
    );
  assert.equal(
    (
      await req(
        a,
        `/students/${demographic.id}`,
        { expectedVersion: 1, age: 11, clearAge: true },
        { method: 'PATCH' },
      )
    ).status,
    400,
  );
  await participant(demographic.id);
  const teachingPage = ok(await req(t, '/students?q=Demographic'), 200);
  assert.equal(teachingPage.items[0].age, 10);
  assert.equal('responsibleAdmin' in teachingPage.items[0], false);
  assert.equal(ok(await req(t, `/students/${demographic.id}`), 200).gender, 'FEMALE');
  ok(
    await req(
      a,
      `/students/${demographic.id}`,
      { expectedVersion: 1, clearAge: true, gender: '' },
      { method: 'PATCH' },
    ),
    200,
  );
  assert.equal(ok(await req(a, `/students/${demographic.id}`), 200).age, null);
  assert.equal(ok(await req(a, '/students?q=Demographic'), 200).items[0].gender, '');
  passed('student age/gender validation, list/detail readback and responsible-admin visibility');

  const trialBody = { studentId: s.id, bucket: 'TRIAL', quantity: 3 },
    grantKey = randomUUID();
  const trial = ok(await req(a, '/entitlements/grants', trialBody, { key: grantKey }));
  assert.equal(trial.balances.TRIAL.available, 4);
  assert.equal(trial.firstPurchasedAt, null);
  assert.deepEqual(trial.closedTaskIds, []);
  assert.deepEqual(ok(await req(a, '/entitlements/grants', trialBody, { key: grantKey })), trial);
  assert.equal(
    (await req(a, '/entitlements/grants', { ...trialBody, quantity: 4 }, { key: grantKey })).status,
    409,
  );
  for (const fields of [
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 10001 },
    { quantity: '1' },
    { mode: 'CUSTOM' },
    { kind: 'PURCHASE' },
    { packageId: 'x' },
    { note: null },
    { priceAudCents: 10 },
  ])
    assert.equal((await req(a, '/entitlements/grants', { ...trialBody, ...fields })).status, 400);
  for (const u of [b, t]) {
    assert.equal((await req(u, '/entitlements/grants', trialBody)).status, 403);
    assert.equal((await req(u, `/students/${s.id}/entitlements`)).status, 403);
    assert.equal((await req(u, `/students/${s.id}/entitlement-entries`)).status, 403);
  }
  assert.equal((await req(null, '/entitlements')).status, 401);
  assert.equal((await req(a, '/entitlements/grants', trialBody, { csrf: false })).status, 403);
  assert.equal((await req(t, '/lesson-packages')).status, 403);
  assert.equal((await req(null, '/lesson-packages')).status, 401);
  assert.equal((await req(a, `/entitlements?studentId=${foreign.id}`)).status, 403);
  assert.equal((await req(a, '/entitlements?page=0')).status, 400);
  assert.equal((await req(a, '/entitlements?pageSize=101')).status, 400);
  assert.equal((await req(a, '/entitlements?excludedParticipantId=x')).status, 400);
  passed(
    'trial grants, owner isolation, CSRF, idempotency and mutually exclusive request validation',
  );

  const pending = await participant(s.id);
  await participant(s.id, {}, { startsAt: new Date('2028-09-01'), endsAt: new Date('2028-09-02') });
  await participant(s.id, { bookingStatus: 'CANCELLED' });
  await participant(s.id, { attendance: 'NO_SHOW' });
  let balance = ok(await req(a, `/students/${s.id}/entitlements`), 200).balances;
  assert.deepEqual(balance.TRIAL, { remaining: 4, reserved: 2, available: 2 });
  assert.deepEqual(balance.REGULAR, { remaining: 0, reserved: 0, available: 0 });
  await assert.rejects(
    write(a, (tx) => service.assertAvailable(tx, s.id, 'TRIAL', 3)),
    (e) => e.response.code === 'ENTITLEMENT_INSUFFICIENT',
  );
  await write(a, (tx) => service.assertAvailable(tx, s.id, 'TRIAL', 3, pending.id));
  await assert.rejects(
    write(a, (tx) => service.assertAvailable(tx, zero.id, 'TRIAL', 1, pending.id)),
  );
  await assert.rejects(
    write(a, (tx) => service.assertAvailable(tx, s.id, 'REGULAR', 1, pending.id)),
  );
  const invalidStudent = await student(a, { giftTrialCredit: false });
  await participant(invalidStudent.id);
  assert.equal(
    (await req(a, `/students/${invalidStudent.id}/entitlements`)).data.code,
    'ENTITLEMENT_DATA_INVALID',
  );
  // Remove only this synthetic invalid reservation so list tests operate on reconciled data.
  await db.sessionParticipant.updateMany({
    where: { studentId: invalidStudent.id },
    data: { bookingStatus: 'CANCELLED' },
  });
  // A RepeatableRead transaction keeps the old grant and reservation snapshot across a concurrent write.
  await db.$transaction(
    async (tx) => {
      const before = await service.getBalances(tx, s.id);
      ok(await req(a, '/entitlements/grants', trialBody));
      assert.deepEqual(await service.getBalances(tx, s.id), before);
    },
    { isolationLevel: 'RepeatableRead' },
  );
  assert.equal(ok(await req(a, `/students/${s.id}/entitlements`), 200).balances.TRIAL.remaining, 7);
  passed(
    'independent pools, past pending reservations, exclusion validation and stable concurrent read snapshot',
  );

  const attended = await participant(s.id, { attendance: 'ATTENDED' });
  const attended2 = await participant(s.id, { attendance: 'ATTENDED' });
  const noShow = await participant(s.id, { attendance: 'NO_SHOW' });
  const sale = await write(a, (tx) => ensureFollowup(tx, attended.id, 'TRIAL_COMPLETED', now));
  const sale2 = await write(a, (tx) => ensureFollowup(tx, attended2.id, 'TRIAL_COMPLETED', now));
  const rebook = await write(a, (tx) => ensureFollowup(tx, noShow.id, 'NO_SHOW', now));
  assert.equal(sale.purpose, 'FIRST_PURCHASE');
  assert.equal(rebook.purpose, 'REBOOKING');
  assert.equal(
    (await write(a, (tx) => ensureFollowup(tx, attended.id, 'TRIAL_COMPLETED', now))).id,
    sale.id,
  );
  const communication = await db.communicationLog.create({
    data: {
      studentId: s.id,
      taskId: sale.id,
      guardianNameSnapshot: 'Parent',
      channel: 'IN_PERSON',
      content: 'Observed interest',
      occurredAt: now,
      createdBy: a.user.id,
    },
  });
  const purchased = ok(
    await req(a, '/entitlements/grants', {
      studentId: s.id,
      bucket: 'REGULAR',
      mode: 'CUSTOM',
      quantity: 5,
    }),
  );
  assert.equal(purchased.entry.createdAt, now.toISOString());
  assert.equal(purchased.firstPurchasedAt, purchased.entry.createdAt);
  assert.equal(purchased.membershipCategory, 'NEW_MEMBER');
  assert.deepEqual(purchased.closedTaskIds.sort(), [sale.id, sale2.id].sort());
  assert.equal((await db.task.findUnique({ where: { id: rebook.id } })).status, 'OPEN');
  assert.equal(
    (await db.task.findUnique({ where: { id: sale.id } })).resolvedByEntitlementEntryId,
    purchased.entry.id,
  );
  assert.equal(
    (await db.communicationLog.findUnique({ where: { id: communication.id } })).content,
    'Observed interest',
  );
  assert.equal((await db.task.findUnique({ where: { id: sale.id } })).reason, 'PURCHASE_RECORDED');
  assert.equal(
    (await write(a, (tx) => ensureFollowup(tx, attended.id, 'TRIAL_COMPLETED', now))).status,
    'DONE',
  );
  const careP = await participant(s.id, { attendance: 'ATTENDED' });
  const care = await write(a, (tx) => ensureFollowup(tx, careP.id, 'TRIAL_COMPLETED', now));
  assert.equal(care.purpose, 'MEMBER_CARE');
  const previousVersion = (await db.student.findUnique({ where: { id: s.id } })).version;
  now = new Date('2028-09-12T00:00:00Z');
  const renewal = ok(
    await req(a, '/entitlements/grants', {
      studentId: s.id,
      bucket: 'REGULAR',
      mode: 'CUSTOM',
      quantity: 2,
    }),
  );
  assert.equal(renewal.firstPurchasedAt, purchased.firstPurchasedAt);
  assert.equal(renewal.membershipCategory, 'MEMBER');
  assert.deepEqual(renewal.closedTaskIds, []);
  assert.equal((await db.student.findUnique({ where: { id: s.id } })).version, previousVersion);
  assert.equal((await db.task.findUnique({ where: { id: care.id } })).status, 'OPEN');
  const trialMember = ok(await req(a, '/entitlements/grants', trialBody));
  assert.equal(trialMember.firstPurchasedAt, purchased.firstPurchasedAt);
  assert.equal((await db.task.findUnique({ where: { id: care.id } })).status, 'OPEN');
  // Buy first without taking a trial; the gift remains untouched.
  const direct = await student(a);
  const directPurchase = ok(
    await req(a, '/entitlements/grants', {
      studentId: direct.id,
      bucket: 'REGULAR',
      mode: 'CUSTOM',
      quantity: 1,
    }),
  );
  assert.equal(directPurchase.balances.TRIAL.remaining, 1);
  const consumed = await participant(direct.id, { kind: 'REGULAR', attendance: 'ATTENDED' });
  await db.entitlementEntry.create({
    data: {
      studentId: direct.id,
      bucket: 'REGULAR',
      kind: 'CONSUMPTION',
      quantity: -1,
      participantId: consumed.id,
      actorId: t.user.id,
      sourceKey: randomUUID(),
    },
  });
  assert.equal(
    ok(await req(a, `/students/${direct.id}/entitlements`), 200).membershipCategory,
    'NEW_MEMBER',
  );
  passed(
    'first purchase and follow-up closure are atomic; renewal, trial top-up and zero balance preserve membership',
  );

  const target = await participant(s.id);
  const otherStudentTarget = await participant(foreign.id);
  const otherSubjectTarget = await participant(s.id, {}, { courseId: otherCourseId });
  await assert.rejects(write(a, (tx) => closeRebooking(tx, rebook.id, otherStudentTarget.id, now)));
  await assert.rejects(write(a, (tx) => closeRebooking(tx, rebook.id, otherSubjectTarget.id, now)));
  await write(a, (tx) => closeRebooking(tx, rebook.id, target.id, now));
  assert.equal(
    (await db.task.findUnique({ where: { id: rebook.id } })).rebookedToParticipantId,
    target.id,
  );
  assert.equal((await db.task.findUnique({ where: { id: care.id } })).status, 'OPEN');
  await db.sessionParticipant.update({
    where: { id: noShow.id },
    data: { bookingStatus: 'CANCELLED' },
  });
  const reopened = await write(a, (tx) => ensureFollowup(tx, noShow.id, 'CANCELLED', now));
  assert.equal(reopened.rebookedToParticipantId, null);
  assert.equal(reopened.status, 'OPEN');
  passed(
    'rebooking closes only an explicit same-student/same-subject source; new events clear stale resolutions',
  );

  const pack = await db.lessonPackage.create({
    data: { name: 'Ten lessons', quantity: 10, priceAudCents: 30000 },
  });
  assert.equal(ok(await req(a, '/lesson-packages?q=Ten&pageSize=1'), 200).items[0].currency, 'AUD');
  assert.equal(ok(await req(a, '/lesson-packages?q=absent'), 200).total, 0);
  const packBody = {
    studentId: zero.id,
    bucket: 'REGULAR',
    mode: 'PACKAGE',
    packageId: pack.id,
    expectedPackageVersion: 1,
  };
  for (const fields of [
    { quantity: 10 },
    { expectedPackageVersion: 0 },
    { mode: null },
    { packageSnapshot: {} },
  ])
    assert.equal((await req(a, '/entitlements/grants', { ...packBody, ...fields })).status, 400);
  assert.equal(
    (await req(a, '/entitlements/grants', { ...packBody, expectedPackageVersion: 2 })).data.code,
    'PACKAGE_VERSION_CONFLICT',
  );
  assert.equal(
    (await req(a, '/entitlements/grants', { ...packBody, packageId: 'missing' })).status,
    404,
  );
  const packKey = randomUUID();
  const bought = ok(await req(a, '/entitlements/grants', packBody, { key: packKey }));
  assert.equal(bought.balances.REGULAR.remaining, 10);
  assert.deepEqual(bought.entry.packageSnapshot, {
    name: pack.name,
    quantity: 10,
    priceAudCents: 30000,
    currency: 'AUD',
    version: 1,
  });
  await db.lessonPackage.update({
    where: { id: pack.id },
    data: { active: false, version: 2, priceAudCents: 99999, name: 'Changed' },
  });
  assert.deepEqual(ok(await req(a, '/entitlements/grants', packBody, { key: packKey })), bought);
  const failedKey = randomUUID();
  assert.equal(
    (await req(a, '/entitlements/grants', packBody, { key: failedKey })).data.code,
    'PACKAGE_INACTIVE',
  );
  assert.equal(await db.mutationReceipt.count({ where: { key: failedKey } }), 0);
  assert.equal(ok(await req(a, '/lesson-packages'), 200).total, 0);
  assert.deepEqual(
    ok(await req(a, `/students/${zero.id}/entitlement-entries`), 200).items[0].packageSnapshot,
    bought.entry.packageSnapshot,
  );
  // Re-authorization precedes receipts, even when a previously successful request is retried.
  await db.student.update({ where: { id: zero.id }, data: { ownerAdminId: b.user.id } });
  assert.equal((await req(a, '/entitlements/grants', packBody, { key: packKey })).status, 403);
  await db.student.update({ where: { id: zero.id }, data: { ownerAdminId: a.user.id } });
  passed(
    'package server pricing, immutable snapshots, successful replay after deactivation, and authorization before replay',
  );

  const rollbackStudent = await student(a, { giftTrialCredit: false });
  const rp = await participant(rollbackStudent.id, { attendance: 'ATTENDED' });
  const rt = await write(a, (tx) => ensureFollowup(tx, rp.id, 'TRIAL_COMPLETED', now));
  const rollbackKey = randomUUID();
  await assert.rejects(
    commands.run(
      a.user,
      'test-purchase-rollback',
      rollbackKey,
      {},
      async () => {},
      async (tx) => {
        await service.grantPurchase(tx, {
          studentId: rollbackStudent.id,
          quantity: 3,
          actorId: a.user.id,
          sourceKey: randomUUID(),
          now,
        });
        throw new Error('Injected after purchase and task closure');
      },
    ),
  );
  assert.equal(await db.entitlementEntry.count({ where: { studentId: rollbackStudent.id } }), 0);
  assert.equal(
    (await db.student.findUnique({ where: { id: rollbackStudent.id } })).firstPurchasedAt,
    null,
  );
  assert.equal((await db.task.findUnique({ where: { id: rt.id } })).status, 'OPEN');
  assert.equal(await db.mutationReceipt.count({ where: { key: rollbackKey } }), 0);
  const concurrentStudent = await student(a, { giftTrialCredit: false });
  const concurrentBody = {
    studentId: concurrentStudent.id,
    bucket: 'REGULAR',
    mode: 'CUSTOM',
    quantity: 3,
  };
  const sameKey = randomUUID();
  const concurrent = await Promise.all([
    req(a, '/entitlements/grants', concurrentBody, { key: sameKey }),
    req(a, '/entitlements/grants', concurrentBody, { key: sameKey }),
  ]);
  assert.deepEqual(ok(concurrent[0]), ok(concurrent[1]));
  assert.equal(await db.entitlementEntry.count({ where: { studentId: concurrentStudent.id } }), 1);
  for (const r of await Promise.all([
    req(a, '/entitlements/grants', concurrentBody),
    req(a, '/entitlements/grants', concurrentBody),
  ]))
    ok(r);
  assert.equal(
    ok(await req(a, `/students/${concurrentStudent.id}/entitlements`), 200).balances.REGULAR
      .remaining,
    9,
  );
  passed(
    'purchase rollback covers ledger, membership, tasks and receipts; same-key and distinct-key concurrency',
  );

  const noCredit = await student(a, { name: 'No credit', giftTrialCredit: false });
  const page = ok(await req(a, '/entitlements?q=No%20credit&pageSize=1'), 200);
  assert.equal(page.total, 1);
  assert.equal(page.items[0].studentId, noCredit.id);
  assert.deepEqual(page.items[0].balances.TRIAL, { remaining: 0, reserved: 0, available: 0 });
  assert.equal(ok(await req(a, `/students/${noCredit.id}/entitlement-entries`), 200).total, 0);
  const ledger = ok(
    await req(a, `/students/${s.id}/entitlement-entries?bucket=TRIAL&pageSize=1`),
    200,
  );
  const secondPage = ok(
    await req(a, `/students/${s.id}/entitlement-entries?bucket=TRIAL&pageSize=1&page=2`),
    200,
  );
  assert.notEqual(ledger.items[0].id, secondPage.items[0].id);
  assert.equal(ledger.total, secondPage.total);
  assert.equal(ledger.items[0].bucket, 'TRIAL');
  assert.equal(ledger.items[0].actor.id, a.user.id);
  assert.equal('sourceKey' in ledger.items[0], false);
  assert.equal(
    document.paths['/api/entitlements/grants'].post.requestBody.content['application/json'].schema
      .oneOf.length,
    3,
  );
  passed('zero-credit students, stable filtered ledger pagination and generated OpenAPI oneOf');
  const classification = [];
  for (const [name, firstPurchasedAt, ownerAdminId] of [
    ['Tab A trial', null, a.user.id],
    ['Tab B first day', new Date('2028-09-12T13:59:00Z'), a.user.id],
    ['Tab C sixth day', new Date('2028-09-05T14:00:00Z'), a.user.id],
    ['Tab D seventh day', new Date('2028-09-05T13:59:59Z'), a.user.id],
    ['Tab E other admin', new Date('2028-09-01T00:00:00Z'), b.user.id],
  ])
    classification.push(
      await db.student.create({
        data: {
          name,
          firstPurchasedAt,
          type: firstPurchasedAt ? 'MEMBER' : 'TRIAL',
          ownerAdminId,
          yearLevel: 'Year 4',
          guardianEmail: 'private@example.test',
        },
      }),
    );
  const allTabs = ok(await req(a, '/students?q=Tab%20&pageSize=2'), 200);
  assert.deepEqual(allTabs.categoryCounts, { TRIAL_STUDENT: 1, NEW_MEMBER: 2, MEMBER: 2 });
  assert.equal(allTabs.total, 5);
  assert.equal(allTabs.items.length, 2);
  assert.equal(allTabs.membershipAsOfDate, '2028-09-12');
  assert.equal(allTabs.nextCategoryChangeAt, '2028-09-12T14:00:00.000Z');
  const newTab = ok(await req(a, '/students?q=Tab%20&category=NEW_MEMBER&pageSize=1&page=2'), 200);
  assert.equal(newTab.total, 2);
  assert.equal(newTab.items[0].id, classification[2].id);
  assert.deepEqual(newTab.categoryCounts, allTabs.categoryCounts);
  const mineTab = ok(await req(a, '/students?q=Tab%20&mine=true'), 200);
  assert.deepEqual(mineTab.categoryCounts, { TRIAL_STUDENT: 1, NEW_MEMBER: 2, MEMBER: 1 });
  assert.equal(
    mineTab.items.some((s) => s.id === classification[4].id),
    false,
  );
  assert.equal((await req(a, '/students?category=UNKNOWN')).status, 400);
  await participant(classification[1].id, { attendance: 'ATTENDED' });
  const teacherTab = ok(await req(t, '/students?q=Tab%20&category=NEW_MEMBER'), 200);
  assert.deepEqual(teacherTab.categoryCounts, { TRIAL_STUDENT: 0, NEW_MEMBER: 1, MEMBER: 0 });
  assert.equal(
    teacherTab.items.some((s) => 'firstPurchasedAt' in s || 'guardianEmail' in s),
    false,
  );
  for (const reader of [t, b]) {
    const detail = ok(await req(reader, `/students/${classification[1].id}`), 200);
    assert.equal(detail.membershipCategory, 'NEW_MEMBER');
    assert.equal('firstPurchasedAt' in detail, false);
    assert.equal('guardianEmail' in detail, false);
  }
  assert.equal(
    ok(await req(a, `/students/${classification[1].id}`), 200).firstPurchasedAt,
    '2028-09-12T13:59:00.000Z',
  );
  // The classification clock is captured once for both counts and rows, even across midnight.
  const fixedNow = now;
  let reads = 0;
  app.get(Clock).now = () =>
    reads++ === 0 ? new Date('2028-09-12T13:59:59.999Z') : new Date('2028-09-12T14:00:00Z');
  const midnight = ok(await req(a, '/students?q=Tab%20&category=NEW_MEMBER'), 200);
  assert.equal(midnight.items.length, 2);
  assert.equal(midnight.categoryCounts.NEW_MEMBER, 2);
  assert.equal(midnight.membershipAsOfDate, '2028-09-12');
  app.get(Clock).now = () => fixedNow;
  passed(
    'student category counts, calendar partition, pagination, mine filter, teacher privacy and midnight snapshot',
  );

  async function sqlEntry(overrides = {}) {
    const e = {
      id: randomUUID(),
      studentId: noCredit.id,
      bucket: 'TRIAL',
      kind: 'TRIAL_GRANT',
      quantity: 1,
      actorId: a.user.id,
      sourceKey: randomUUID(),
      participantId: null,
      packageId: null,
      packageSnapshot: null,
      ...overrides,
    };
    const keys = Object.keys(e);
    return pool.query(
      `INSERT INTO "EntitlementEntry" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`,
      Object.values(e),
    );
  }
  const constraint = (fn, code = '23514') => assert.rejects(fn, (e) => e.code === code);
  for (const bad of [
    { kind: 'INITIAL_TRIAL', quantity: 2 },
    { kind: 'INITIAL_TRIAL', bucket: 'REGULAR' },
    { kind: 'TRIAL_GRANT', bucket: 'REGULAR' },
    { quantity: 0 },
    { quantity: 10001 },
    { kind: 'PURCHASE', bucket: 'TRIAL' },
    { kind: 'PURCHASE', bucket: 'REGULAR', quantity: -1 },
    { kind: 'CONSUMPTION', quantity: -1 },
    { participantId: pending.id },
    { kind: 'MIGRATION', quantity: -1 },
    { kind: 'MIGRATION', quantity: 0 },
    { actorId: null },
    { packageId: pack.id },
    { packageSnapshot: {} },
    { packageId: pack.id, packageSnapshot: {} },
  ])
    await constraint(() => sqlEntry(bad));
  await sqlEntry({ kind: 'MIGRATION', bucket: 'REGULAR', quantity: 0, actorId: null });
  await sqlEntry({ kind: 'INITIAL_TRIAL' });
  await constraint(() => sqlEntry({ kind: 'INITIAL_TRIAL' }), '23505');
  const cp = await participant(noCredit.id, { attendance: 'ATTENDED' });
  await sqlEntry({ kind: 'CONSUMPTION', quantity: -1, participantId: cp.id });
  await constraint(
    () => sqlEntry({ kind: 'CONSUMPTION', quantity: -1, participantId: cp.id }),
    '23505',
  );
  await constraint(
    () => pool.query('DELETE FROM "SessionParticipant" WHERE id=$1', [cp.id]),
    '23503',
  );
  await constraint(() => pool.query('DELETE FROM "Student" WHERE id=$1', [noCredit.id]), '23503');
  await constraint(() => pool.query('DELETE FROM "LessonPackage" WHERE id=$1', [pack.id]), '23503');
  for (const [q, price, version] of [
    [0, 100, 1],
    [10001, 100, 1],
    [1, 0, 1],
    [1, -1, 1],
    [1, 100, 0],
  ])
    await constraint(() =>
      pool.query(
        'INSERT INTO "LessonPackage" (id,name,quantity,"priceAudCents",version,"updatedAt") VALUES ($1,$1,$2,$3,$4,now())',
        [randomUUID(), q, price, version],
      ),
    );
  const teacherSession = await db.classSession.findFirst({ where: { id: pending.sessionId } });
  await constraint(() =>
    pool.query(
      `INSERT INTO "Task" (id,type,"assigneeId","sessionId",purpose,"availableAt","dueAt","updatedAt") VALUES ($1,'LESSON_FEEDBACK',$2,$3,'FIRST_PURCHASE',now(),now(),now())`,
      [randomUUID(), t.user.id, teacherSession.id],
    ),
  );
  await constraint(
    () =>
      pool.query('UPDATE "Task" SET "resolvedByEntitlementEntryId"=$1 WHERE id=$2', [
        'absent',
        sale.id,
      ]),
    '23503',
  );
  await constraint(
    () => pool.query('UPDATE "Task" SET purpose=$1 WHERE id=$2', ['INVALID', sale.id]),
    '22P02',
  );
  passed(
    'direct SQL enforces quantity/pool, initial gift uniqueness, consumption uniqueness, package and history foreign keys',
  );
  await verifyStudentType({ db, req, ok, student, a, b, t, courseId, groupId, now, passed });
  await verifyBookingCreate({
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
    now: () => now,
    write,
    ensureFollowup,
    passed,
  });
  await verifyBookingCancel({
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
    teaching: app.get(TeachingService),
    write,
    ensureFollowup,
  });
  await verifyBookingRestore({
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
    passed,
    teaching: app.get(TeachingService),
  });
  console.log(
    `Entitlement integration passed (${groups} groups; isolated PostgreSQL; no production migration or real Qwen call).`,
  );
} finally {
  // Fixture deletion is limited to this test's users; the runner then removes its disposable container.
  await db.communicationLog.deleteMany({ where: { createdBy: { in: userIds } } });
  await db.scheduleChange.deleteMany({ where: { actorId: { in: userIds } } });
  await db.task.deleteMany({ where: { assigneeId: { in: userIds } } });
  await db.entitlementEntry.deleteMany({ where: { student: { ownerAdminId: { in: userIds } } } });
  await db.sessionParticipant.deleteMany({ where: { student: { ownerAdminId: { in: userIds } } } });
  await db.classSession.deleteMany({ where: { teacherId: userIds[2] } });
  await db.student.deleteMany({ where: { ownerAdminId: { in: userIds } } });
  await db.mutationReceipt.deleteMany({ where: { userId: { in: userIds } } });
  await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await pool.end();
}
