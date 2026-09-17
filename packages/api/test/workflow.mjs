// Final lifecycle regressions live in the isolated entitlement suite: booking-create/cancel,
// session-commands/cancel, checkin-command, participant-feedback, task-read, followup-completion.
// This seeded HTTP smoke additionally checks the runnable demonstration, without a fake AI call.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/bootstrap');
const { app } = await createApp();
app.useLogger(false);
await app.listen(0, '127.0.0.1');
const url = await app.getUrl();
try {
  const login = await fetch(url + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'emma@example.com', password: process.env.SEED_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const tasks = await (await fetch(url + '/api/tasks', { headers: { cookie } })).json();
  assert.equal(tasks.items.filter((t) => t.sessionId === 'workflow-demo-0').length, 2);
  for (const t of tasks.items.filter((t) => t.sessionId === 'workflow-demo-0')) {
    const detail = await (await fetch(url + '/api/tasks/' + t.id, { headers: { cookie } })).json();
    assert.ok(detail.checkedInAt);
    assert.equal(detail.type, 'TRIAL_FEEDBACK');
    assert.equal('guardianEmail' in detail.student, false);
  }
  console.log(
    'Seeded workflow passed: two ready evaluations, checked-in details and teacher privacy. AI excluded.',
  );
} finally {
  await app.close();
}
