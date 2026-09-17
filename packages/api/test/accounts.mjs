import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
assert.equal(process.env.ENTITLEMENT_TEST_ISOLATED, 'true');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/entitlement_test');
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/prisma.service');
const { Commands, Clock } = require('../dist/common/domain');
const { AccountsService } = require('../dist/accounts/service');
const { bootstrapSuperAdmin } = require('../dist/accounts/bootstrap-super-admin');
const { app } = await createApp();
app.useLogger(false);
const db = app.get(PrismaService),
  accounts = app.get(AccountsService);
const now = new Date('2030-01-01T00:00:00Z');
app.get(Clock).now = () => now;
await app.listen(0, '127.0.0.1');
const base = `${await app.getUrl()}/api`,
  prefix = `accounts-${randomUUID()}`;
const pass = 'FictionalAccount2026!',
  nextPass = 'ReplacementAccount2026!';
const ids = [];
let groups = 0;
const passed = (s) => {
  groups++;
  console.log(`✓ ${s}`);
};
async function req(u, path, body, opts = {}) {
  const r = await fetch(base + path, {
    method: opts.method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(u
        ? { cookie: u.cookie, ...(opts.csrf === false ? {} : { 'x-csrf-token': u.csrfToken }) }
        : {}),
      'Idempotency-Key': opts.key ?? randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
}
const ok = (r, status = 201) => {
  assert.equal(r.status, status, JSON.stringify(r.data));
  return r.data;
};
async function login(email, password = pass, status = 200) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r.status, status);
  if (status !== 200) return;
  return { ...(await r.json()), cookie: r.headers.get('set-cookie').split(';')[0] };
}
let superUser;
async function create(role, name, extra = {}) {
  const body = {
    role,
    name,
    email: `${prefix}-${name.replace(/\W/g, '')}@test.invalid`,
    password: pass,
    ...extra,
  };
  const result = ok(await req(superUser, '/accounts', body));
  ids.push(result.id);
  return { ...result, ...body };
}
const detail = async (x) => ok(await req(superUser, `/accounts/${x.id}`), 200);
const deactivate = async (x, extra = {}, opts = {}) =>
  req(
    superUser,
    `/accounts/${x.id}/deactivate`,
    { expectedVersion: (await detail(x)).version, reason: 'Test handover', ...extra },
    opts,
  );
try {
  const input = { email: `${prefix}-super@test.invalid`, name: 'Test super', password: pass };
  const bootstrap = await Promise.all([
    bootstrapSuperAdmin(db, input),
    bootstrapSuperAdmin(db, input),
  ]);
  assert.equal(bootstrap[0].id, bootstrap[1].id);
  assert.equal(bootstrap.filter((x) => x.created).length, 1);
  ids.push(bootstrap[0].id);
  const hash = (await db.user.findUniqueOrThrow({ where: { id: bootstrap[0].id } })).passwordHash;
  await bootstrapSuperAdmin(db, { ...input, password: nextPass });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: bootstrap[0].id } })).passwordHash,
    hash,
  );
  await assert.rejects(
    bootstrapSuperAdmin(db, { ...input, email: `${prefix}-second@test.invalid` }),
  );
  superUser = await login(`  ${input.email.toUpperCase()}  `);
  assert.equal(superUser.user.isSuperAdmin, true);
  const admin = await create('ADMIN', 'Advisor'),
    teacher = await create('TEACHER', 'Teacher'),
    successor = await create('ADMIN', 'Successor');
  const a = await login(admin.email),
    t = await login(teacher.email),
    b = await login(successor.email);
  await assert.rejects(bootstrapSuperAdmin(db, { ...input, email: admin.email }));
  assert.equal((await detail(admin)).isSuperAdmin, false);
  passed(
    'bootstrap: concurrent singleton, idempotent hash, normalized login and no ordinary-account promotion',
  );
  for (const u of [null, a, t])
    for (const path of [
      '/accounts',
      `/accounts/${admin.id}`,
      `/accounts/${admin.id}/deactivation-impact`,
    ])
      assert.equal((await req(u, path)).status, u ? 403 : 401);
  assert.equal(
    (
      await req(a, '/accounts', {
        name: 'forged',
        email: 'forged@test.invalid',
        role: 'ADMIN',
        password: pass,
        isSuperAdmin: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(a, '/accounts', {
        name: 'forged',
        email: 'forged@test.invalid',
        role: 'ADMIN',
        password: pass,
      })
    ).status,
    403,
  );
  const list = ok(
    await req(superUser, `/accounts?q=${prefix}&role=ADMIN&status=ACTIVE&page=1&pageSize=1`),
    200,
  );
  assert.equal(list.total, 3);
  assert.equal(list.items.length, 1);
  assert.equal('passwordHash' in list.items[0], false);
  assert.equal(ok(await req(superUser, '/accounts?q=not-found-ever'), 200).total, 0);
  assert.equal((await req(superUser, '/accounts?pageSize=101')).status, 400);
  for (const field of [{ isSuperAdmin: true }, { status: 'DISABLED' }, { passwordHash: 'fake' }])
    assert.equal(
      (
        await req(superUser, '/accounts', {
          name: 'x',
          email: 'x@test.invalid',
          role: 'TEACHER',
          password: pass,
          ...field,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await req(
        superUser,
        '/accounts',
        { name: 'x', email: 'x@test.invalid', role: 'TEACHER', password: pass },
        { csrf: false },
      )
    ).status,
    403,
  );
  passed(
    'account access: only super reads/writes, strict DTO/CSRF, filters/pages and safe response fields',
  );
  const key = randomUUID(),
    body = {
      name: 'Concurrent',
      email: `${prefix}-concurrent@test.invalid`,
      role: 'TEACHER',
      password: pass,
    };
  const races = await Promise.all([
    req(superUser, '/accounts', body, { key }),
    req(superUser, '/accounts', body, { key }),
  ]);
  const created = ok(races[0]);
  assert.deepEqual(ok(races[1]), created);
  ids.push(created.id);
  assert.equal(
    (await req(superUser, '/accounts', { ...body, password: nextPass }, { key })).data.code,
    'IDEMPOTENCY_CONFLICT',
  );
  assert.equal(
    (await req(superUser, '/accounts', { ...body, email: body.email.toUpperCase() })).data.code,
    'EMAIL_IN_USE',
  );
  const savedSecret = process.env.ACCOUNT_COMMAND_HASH_SECRET;
  delete process.env.ACCOUNT_COMMAND_HASH_SECRET;
  assert.equal(
    (await req(superUser, '/accounts', { ...body, email: `${prefix}-no-secret@test.invalid` }))
      .status,
    503,
  );
  process.env.ACCOUNT_COMMAND_HASH_SECRET = savedSecret;
  const payload = JSON.stringify(
    await db.mutationReceipt.findMany({ where: { userId: superUser.user.id } }),
  );
  const audits = JSON.stringify(
    await db.accountAudit.findMany({ where: { actorId: superUser.user.id } }),
  );
  for (const text of [payload, audits]) {
    assert.equal(text.includes(pass), false);
    assert.equal(text.includes('passwordHash'), false);
  }
  passed(
    'credentials: idempotency and different-password conflict, case-insensitive uniqueness, missing-secret denial, redacted receipts/audits',
  );
  const current = await detail(teacher),
    newEmail = `${prefix}-newemail@test.invalid`;
  ok(
    await req(
      superUser,
      `/accounts/${teacher.id}`,
      { name: 'Updated teacher', email: newEmail, expectedVersion: current.version },
      { method: 'PATCH' },
    ),
    200,
  );
  assert.equal((await req(t, '/auth/me')).status, 401);
  const teacherLogin = await login(newEmail);
  assert.equal(
    (
      await req(
        superUser,
        `/accounts/${teacher.id}`,
        { role: 'ADMIN', expectedVersion: 2 },
        { method: 'PATCH' },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        superUser,
        `/accounts/${teacher.id}`,
        { name: 'stale', expectedVersion: 1 },
        { method: 'PATCH' },
      )
    ).data.code,
    'VERSION_CONFLICT',
  );
  const resetKey = randomUUID(),
    resetBody = { password: nextPass, expectedVersion: 2 };
  ok(await req(superUser, `/accounts/${teacher.id}/reset-password`, resetBody, { key: resetKey }));
  assert.equal((await req(teacherLogin, '/auth/me')).status, 401);
  await login(newEmail, pass, 401);
  const newLogin = await login(newEmail, nextPass);
  ok(await req(superUser, `/accounts/${teacher.id}/reset-password`, resetBody, { key: resetKey }));
  assert.equal((await req(newLogin, '/auth/me')).status, 200);
  for (const path of ['', '/reset-password', '/deactivate'])
    assert.equal(
      (
        await req(
          superUser,
          `/accounts/${superUser.user.id}${path}`,
          path === ''
            ? { name: 'no', expectedVersion: 1 }
            : path === '/reset-password'
              ? { password: pass, expectedVersion: 1 }
              : { reason: 'no', expectedVersion: 1 },
          { method: path === '' ? 'PATCH' : 'POST' },
        )
      ).status,
      403,
    );
  passed(
    'edit/reset: immutable role and protected super, stale version, changed email/password revoke cookies and successful replay preserves new login',
  );
  const s = ok(await req(a, '/students', { name: 'Handover student', yearLevel: 'Year 4' }));
  const course = await db.course.create({ data: { name: `${prefix}-math` } }),
    group = await db.classGroup.create({ data: { name: prefix, targetLevel: 'Year 4' } });
  const l = await db.classSession.create({
    data: {
      classGroupId: group.id,
      courseId: course.id,
      teacherId: teacher.id,
      capacity: 1,
      startsAt: new Date(+now + 3600000),
      endsAt: new Date(+now + 7200000),
    },
  });
  const p = ok(await req(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind: 'TRIAL' }));
  const task = await db.task.create({
    data: {
      type: 'TRIAL_FOLLOWUP',
      purpose: 'FIRST_PURCHASE',
      sessionId: l.id,
      participantId: p.id,
      assigneeId: admin.id,
      availableAt: now,
      dueAt: now,
    },
  });
  const impact = ok(await req(superUser, `/accounts/${admin.id}/deactivation-impact`), 200);
  assert.equal(impact.ownedStudentCount, 1);
  assert.equal(impact.openFollowupCount, 1);
  assert.equal((await deactivate(admin)).status, 400);
  assert.equal((await deactivate(teacher)).data.code, 'ACCOUNT_HAS_ACTIVE_WORK');
  assert.equal(
    ok(await req(superUser, `/accounts/${teacher.id}/deactivation-impact`), 200).blockingSessions[0]
      .id,
    l.id,
  );
  const deactKey = randomUUID(),
    deactBody = {
      expectedVersion: 1,
      reason: 'Transfer staff work',
      successorAdminId: successor.id,
    };
  ok(await req(superUser, `/accounts/${admin.id}/deactivate`, deactBody, { key: deactKey }));
  assert.equal((await req(a, '/auth/me')).status, 401);
  await login(admin.email, pass, 401);
  const updated = await db.student.findUniqueOrThrow({
    where: { id: s.id },
    include: { adminLink: true },
  });
  assert.equal(updated.ownerAdminId, successor.id);
  assert.equal(updated.adminLink.adminId, successor.id);
  assert.equal(updated.adminLink.createdByAdminId, admin.id);
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId,
    successor.id,
  );
  assert.equal((await req(b, `/students/${s.id}/entitlements`)).status, 200);
  assert.equal((await req(superUser, `/students/${s.id}/entitlements`)).status, 403);
  ok(await req(superUser, `/accounts/${admin.id}/deactivate`, deactBody, { key: deactKey }));
  assert.equal((await detail(admin)).version, 2);
  assert.equal(
    (
      await req(
        superUser,
        `/accounts/${admin.id}`,
        { name: 'no', expectedVersion: 2 },
        { method: 'PATCH' },
      )
    ).data.code,
    'ACCOUNT_DISABLED',
  );
  passed(
    'deactivate: admin hands over students/open tasks atomically, recording admin retained, no super ownership bypass, inactive login denied',
  );
  // Cancellation clears upcoming teaching; an ordinary inactive teacher can no longer be selected.
  ok(
    await req(b, `/sessions/${l.id}/cancel`, {
      expectedVersion: 2,
      reason: 'Fixture lesson cancelled',
    }),
  );
  ok(await deactivate(teacher));
  assert.equal((await req(newLogin, '/auth/me')).status, 401);
  const options = ok(await req(b, '/sessions/options'), 200);
  assert.equal(
    options.teachers.some((x) => x.id === teacher.id),
    false,
  );
  assert.equal(
    (
      await req(b, '/sessions', {
        classGroupId: group.id,
        courseId: course.id,
        teacherId: teacher.id,
        startsAt: new Date(+now + 10800000).toISOString(),
        endsAt: new Date(+now + 14400000).toISOString(),
      })
    ).status,
    400,
  );
  passed(
    'teacher deactivation: upcoming work blocks, cancellation clears block, old cookie rejected and no inactive teacher scheduling',
  );
  // Late error must roll back the user, handover, session deletion, audit and receipt.
  const roll = await create('ADMIN', 'Rollback'),
    rollLogin = await login(roll.email),
    rollStudent = ok(
      await req(rollLogin, '/students', { name: 'Rollback child', yearLevel: 'Year 3' }),
    );
  const beforeRoll = await db.student.findUniqueOrThrow({ where: { id: rollStudent.id } }),
    originalAudit = accounts.audit,
    rollbackKey = randomUUID();
  accounts.audit = async function (...args) {
    await originalAudit.apply(this, args);
    if (args[3] === 'DEACTIVATE' && args[2] === roll.id)
      throw new Error('Injected account rollback');
  };
  try {
    assert.equal(
      (await deactivate(roll, { successorAdminId: successor.id }, { key: rollbackKey })).status,
      500,
    );
  } finally {
    accounts.audit = originalAudit;
  }
  assert.equal((await detail(roll)).status, 'ACTIVE');
  assert.deepEqual(
    await db.student.findUniqueOrThrow({ where: { id: rollStudent.id } }),
    beforeRoll,
  );
  assert.equal((await req(rollLogin, '/auth/me')).status, 200);
  assert.equal(await db.mutationReceipt.count({ where: { key: rollbackKey } }), 0);
  // Stop a successor while another handover selects them. Either serialization order is valid, but no inactive owner remains.
  const raceAdmin = await create('ADMIN', 'RaceAdmin'),
    raceSuccessor = await create('ADMIN', 'RaceSuccessor'),
    rLogin = await login(raceAdmin.email);
  const raceStudent = ok(
    await req(rLogin, '/students', { name: 'Race child', yearLevel: 'Year 1' }),
  );
  const concurrent = await Promise.all([
    deactivate(raceAdmin, { successorAdminId: raceSuccessor.id }),
    deactivate(raceSuccessor),
  ]);
  assert.equal(concurrent.filter((x) => x.status === 201).length, 1);
  assert.ok(concurrent.some((x) => [400, 409].includes(x.status)));
  const owner = await db.student.findUniqueOrThrow({
    where: { id: raceStudent.id },
    include: { owner: true },
  });
  assert.equal(owner.owner.status, 'ACTIVE');
  passed(
    'account transactions: injected late failure rolls back all handover writes; concurrent successor deactivation cannot leave inactive ownership',
  );
  // Business request already authenticated but waiting on write lane must reject an actor disabled during the wait.
  const waiting = await create('ADMIN', 'Waiting'),
    wLogin = await login(waiting.email),
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    conn = await pool.connect();
  await conn.query('BEGIN');
  await conn.query('SELECT pg_advisory_xact_lock(73192461)');
  const pending = app.get(Commands).run(
    wLogin.user,
    'account-race-probe',
    randomUUID(),
    {},
    async () => {},
    async (tx) =>
      tx.student.create({
        data: { name: 'must not persist', yearLevel: 'Year 1', ownerAdminId: waiting.id },
      }),
  );
  await conn.query(
    'UPDATE "User" SET status=\'DISABLED\', "disabledAt"=now(), version=version+1 WHERE id=$1',
    [waiting.id],
  );
  await conn.query('COMMIT');
  conn.release();
  await pool.end();
  await assert.rejects(pending, (e) => e.getStatus?.() === 401);
  assert.equal(await db.student.count({ where: { ownerAdminId: waiting.id } }), 0);
  passed(
    'business authorization: an authenticated actor disabled while waiting for the lock cannot write',
  );
  await assert.rejects(db.user.update({ where: { id: created.id }, data: { isSuperAdmin: true } }));
  await assert.rejects(db.user.update({ where: { id: created.id }, data: { status: 'DISABLED' } }));
  await assert.rejects(db.user.delete({ where: { id: admin.id } }));
  const finalAudit = JSON.stringify(
    await db.accountAudit.findMany({ where: { targetUserId: { in: ids } } }),
  );
  assert.equal(finalAudit.includes(pass), false);
  assert.equal(finalAudit.includes(nextPass), false);
  assert.equal(finalAudit.includes('passwordHash'), false);
  passed(
    'database: super-role/status constraints and historical references restrict deletion, audit excludes secrets',
  );
  console.log(`Account integration passed (${groups} groups).`);
} finally {
  await db.communicationLog.deleteMany({ where: { createdBy: { in: ids } } });
  await db.scheduleChange.deleteMany({ where: { actorId: { in: ids } } });
  await db.task.deleteMany({
    where: { OR: [{ assigneeId: { in: ids } }, { session: { teacherId: { in: ids } } }] },
  });
  await db.entitlementEntry.deleteMany({ where: { student: { ownerAdminId: { in: ids } } } });
  await db.sessionParticipant.deleteMany({ where: { session: { teacherId: { in: ids } } } });
  await db.classSession.deleteMany({ where: { teacherId: { in: ids } } });
  await db.student.deleteMany({ where: { ownerAdminId: { in: ids } } });
  await db.mutationReceipt.deleteMany({ where: { userId: { in: ids } } });
  await db.accountAudit.deleteMany({ where: { targetUserId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.classGroup.deleteMany({ where: { name: prefix } });
  await db.course.deleteMany({ where: { name: { startsWith: prefix } } });
  await app.close();
}
