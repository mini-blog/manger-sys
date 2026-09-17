// Explicit, isolated browser fixtures. Clock advances only in this fixture app,
// so the real UI immediately sees ended lessons without a production clock override.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
assert.equal(process.env.ENTITLEMENT_UI_PREVIEW, 'true');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/entitlement_ui_preview');
const require = createRequire(import.meta.url),
  { createApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/prisma.service'),
  { Clock } = require('../dist/common/domain');
const { app } = await createApp();
app.useLogger(false);
const db = app.get(PrismaService),
  clock = app.get(Clock);
let now = new Date(Date.now() - 7 * 86400000);
clock.now = () => now;
await app.listen(0, '127.0.0.1');
const base = (await app.getUrl()) + '/api';
async function login(email) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Preview2026!' }),
  });
  assert.equal(r.status, 200);
  return { cookie: r.headers.getSetCookie()[0].split(';')[0], ...(await r.json()) };
}
async function post(u, path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: u.cookie,
      'x-csrf-token': u.csrfToken,
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.status, 201, JSON.stringify(data));
  return data;
}
try {
  const a = await login('admin@preview.test'),
    t = await login('teacher@preview.test');
  const course = await db.course.findFirstOrThrow(),
    group = await db.classGroup.findFirstOrThrow();
  const fixture = [];
  for (let k = 0; k < 5; k++) {
    const start = new Date(+now + 3600000),
      end = new Date(+now + 7200000);
    const l = await post(a, '/sessions', {
      courseId: course.id,
      classGroupId: group.id,
      teacherId: t.user.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
    const ps = [];
    for (let i = 0; i < (k === 0 ? 3 : 1); i++) {
      const s = await post(a, '/students', {
        name: k === 0 ? `UI evaluation ${i + 1}` : `UI follow-up ${k}`,
        yearLevel: 'Year 4',
        guardianName: 'UI Parent',
        guardianEmail: 'ui@example.com',
      });
      const p = await post(a, `/sessions/${l.id}/participants`, { studentId: s.id, kind: 'TRIAL' });
      ps.push({ ...p, studentId: s.id });
    }
    now = start;
    for (const p of ps.slice(0, 2))
      await post(t, `/participants/${p.id}/check-in`, { expectedVersion: 1 });
    now = end;
    if (k > 0)
      await post(t, `/participants/${ps[0].id}/feedback`, {
        expectedVersion: 2,
        feedback: 'UI fixture: participated confidently.',
        abilityNote: 'Confident reader',
      });
    fixture.push({ sessionId: l.id, participants: ps });
    now = new Date(+now + 3600000);
  }
  console.log(JSON.stringify(fixture, null, 2));
} finally {
  await app.close();
}
