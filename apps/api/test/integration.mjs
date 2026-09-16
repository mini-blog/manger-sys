import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from 'dotenv';
import { DateTime } from 'luxon';

config({ path: '.env', quiet: true });
const port = 3101;
const base = `http://127.0.0.1:${port}/api`;
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: resolve('apps/api'),
  env: { ...process.env, API_PORT: String(port), NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
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
  const headers = { cookie: admin.cookie };
  const lessons = await (await request(`/sessions?week=${week}`, { headers })).json();
  assert.equal(lessons.length, 60, 'seeded week must have 60 lessons');
  assert.equal(
    new Set(lessons.map((l) => DateTime.fromISO(l.startsAt).setZone('Australia/Melbourne').weekday))
      .size,
    7,
    'all seven weekdays represented',
  );
  assert.equal((await request('/sessions?week=2026-02-30', { headers })).status, 400);
  assert.equal(
    (await request(`/sessions?week=${week}&teacherId=emma`, { headers })).status,
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
    'Integration passed: PostgreSQL health, login, seven-day schedule, 60 lessons, trial-first roster, teacher isolation, validation, CSRF and logout.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child.kill('SIGTERM');
}
