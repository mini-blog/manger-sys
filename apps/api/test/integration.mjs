import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from 'dotenv';
import { DateTime } from 'luxon';
import pg from 'pg';

config({ path: '.env', quiet: true });
const port = 3101;
const base = `http://127.0.0.1:${port}/api`;
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: resolve('apps/api'),
  env: { ...process.env, API_PORT: String(port), NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const createdStudentIds = [];
let expectedOwnerId;
let logs = '';
child.stdout.on('data', (x) => {
  logs += x;
});
child.stderr.on('data', (x) => {
  logs += x;
});
const week = DateTime.now().setZone('Australia/Melbourne').toISODate();
async function request(path, options = {}) {
  return fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
}
async function login(email) {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.SEED_PASSWORD }),
  });
  assert.equal(res.status, 200, `login ${email}`);
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith('student_session='))
    .split(';')[0];
  return { cookie, ...(await res.json()) };
}

try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await request('/health')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait for startup */
    }
    await delay(250);
  }
  assert.ok(ready, `API startup failed: ${logs}`);
  assert.equal((await request(`/sessions?week=${week}`)).status, 401);
  const admin = await login('alice@example.com');
  expectedOwnerId = admin.user.id;
  const headers = { cookie: admin.cookie };
  const lessons = await (await request(`/sessions?week=${week}`, { headers })).json();
  assert.equal(
    lessons.filter((l) =>
      l.id.startsWith('demo-' + DateTime.fromISO(week).startOf('week').toISODate() + '-'),
    ).length,
    60,
    'seed adds 60 weekly lessons without limiting user lessons',
  );
  assert.equal(
    new Set(lessons.map((l) => DateTime.fromISO(l.startsAt).setZone('Australia/Melbourne').weekday))
      .size,
    7,
    'all seven weekdays represented',
  );
  assert.equal((await request('/sessions?week=2026-02-30', { headers })).status, 400);
  assert.equal(
    (await request(`/sessions?week=${week}&unknown=emma`, { headers })).status,
    400,
    'unknown query fields rejected',
  );
  const trialLesson = lessons.find((l) => l.trialCount > 0);
  const roster = await (
    await request(`/sessions/${trialLesson.id}/participants`, { headers })
  ).json();
  assert.equal(roster.participants[0].kind, 'TRIAL');
  assert.ok(
    roster.participants.every((p) => !('email' in p) && !('passwordHash' in p)),
    'DTO does not leak unrelated personal data',
  );
  const teacher = await login('emma@example.com');
  const mine = await (
    await request(`/sessions?week=${week}`, { headers: { cookie: teacher.cookie } })
  ).json();
  assert.ok(mine.length > 0 && mine.length < lessons.length);
  assert.ok(mine.every((l) => l.teacherId === teacher.user.id));
  const other = lessons.find((l) => l.teacherId !== teacher.user.id);
  assert.equal(
    (await request(`/sessions/${other.id}/participants`, { headers: { cookie: teacher.cookie } }))
      .status,
    403,
  );
  assert.equal((await request('/students')).status, 401);
  const studentWriteHeaders = {
    ...headers,
    'content-type': 'application/json',
    'x-csrf-token': admin.csrfToken,
    'Idempotency-Key': randomUUID(),
  };
  for (const invalid of [
    { name: '   ', yearLevel: 'Year 3' },
    { name: 'Invalid', yearLevel: 'Year 99' },
    { name: 'Invalid', yearLevel: 'Year 3', ownerAdminId: teacher.user.id },
  ]) {
    assert.equal(
      (
        await request('/students', {
          method: 'POST',
          headers: studentWriteHeaders,
          body: JSON.stringify(invalid),
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request('/students', {
        method: 'POST',
        headers: {
          cookie: teacher.cookie,
          'content-type': 'application/json',
          'x-csrf-token': teacher.csrfToken,
        },
        body: JSON.stringify({ name: 'Forbidden', yearLevel: 'Year 3' }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/students', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'CSRF blocked', yearLevel: 'Year 3' }),
      })
    ).status,
    403,
  );
  const studentName = `Integration ${Date.now()}`;
  const createdResponse = await request('/students', {
    method: 'POST',
    headers: studentWriteHeaders,
    body: JSON.stringify({ name: `  ${studentName}  `, yearLevel: 'Not assessed' }),
  });
  assert.equal(createdResponse.status, 201);
  const createdStudent = await createdResponse.json();
  createdStudentIds.push(createdStudent.id);
  assert.equal(createdStudent.name, studentName);
  assert.deepEqual(Object.keys(createdStudent).sort(), ['id', 'name', 'yearLevel']);
  const studentsFound = await (
    await request(`/students?q=${encodeURIComponent(studentName)}&pageSize=1`, { headers })
  ).json();
  assert.equal(studentsFound.total, 1);
  assert.equal(studentsFound.items[0].id, createdStudent.id);
  const teacherStudents = await (
    await request('/students?pageSize=100', { headers: { cookie: teacher.cookie } })
  ).json();
  const ownStudentIds = new Set();
  for (const lesson of mine) {
    const ownRoster = await (
      await request(`/sessions/${lesson.id}/participants`, { headers: { cookie: teacher.cookie } })
    ).json();
    for (const participant of ownRoster.participants) ownStudentIds.add(participant.id);
  }
  assert.ok(teacherStudents.total > 0);
  for (const student of teacherStudents.items) {
    const detail = await (
      await request(`/students/${student.id}`, { headers: { cookie: teacher.cookie } })
    ).json();
    assert.ok(
      detail.teachingRecords.length > 0 &&
        detail.teachingRecords.every((r) => r.lesson.teacherId === teacher.user.id),
    );
    assert.equal(detail.guardianEmail, undefined);
  }
  assert.ok(!teacherStudents.items.some((student) => student.id === createdStudent.id));
  assert.equal((await request('/students?page=0', { headers })).status, 400);
  assert.equal((await request('/students?pageSize=101', { headers })).status, 400);
  assert.equal((await request('/students?ownerAdminId=anyone', { headers })).status, 400);
  assert.equal(
    (await request('/auth/logout', { method: 'POST', headers })).status,
    403,
    'CSRF must be enforced',
  );
  assert.equal(
    (
      await request('/auth/logout', {
        method: 'POST',
        headers: { ...headers, 'x-csrf-token': admin.csrfToken },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/auth/me', { headers })).status,
    401,
    'logout invalidates session server-side',
  );
  await request('/auth/logout', {
    method: 'POST',
    headers: { cookie: teacher.cookie, 'x-csrf-token': teacher.csrfToken },
  });
  console.log(
    'Integration passed: PostgreSQL health, login, seven-day schedule, 60 lessons, trial-first roster, teacher isolation, student creation/search/validation, CSRF and logout.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child.kill('SIGTERM');
  if (createdStudentIds.length) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const owners = await pool.query(
        'SELECT "ownerAdminId" FROM "Student" WHERE id = ANY($1::text[])',
        [createdStudentIds],
      );
      assert.ok(
        owners.rows.every((row) => row.ownerAdminId === expectedOwnerId),
        'owner assigned by server',
      );
    } finally {
      await pool.query(`DELETE FROM "MutationReceipt" WHERE "response"->>'id' = ANY($1::text[])`, [
        createdStudentIds,
      ]);
      await pool.query('DELETE FROM "Student" WHERE id = ANY($1::text[])', [createdStudentIds]);
      await pool.end();
    }
  }
}
