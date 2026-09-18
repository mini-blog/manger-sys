import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env,
  POSTGRES_PASSWORD: 'compose-validation-only',
  SESSION_COOKIE_SECURE: 'true',
  QIWEN_API_KEY: 'compose-test-key',
  QWEN_BASE_URL: '',
  QWEN_MODEL: '',
};
function config(file, example) {
  // Never print the expanded environment/configuration: it may contain secrets.
  return JSON.parse(
    execFileSync(
      'docker',
      ['compose', '--env-file', example, '-f', file, 'config', '--format', 'json'],
      { cwd, env, encoding: 'utf8' },
    ),
  );
}
const dev = config('compose.dev.yaml', '.env.example');
const prod = config('compose.prod.yaml', '.env.prod.example');
const fallback = config('compose.yaml', '.env.example');
assert.deepEqual(fallback.services, dev.services);
assert.notEqual(dev.name, prod.name);
for (const c of [dev, prod]) {
  assert.deepEqual(Object.keys(c.services).sort(), ['api', 'db', 'web']);
  assert.equal(c.services.api.depends_on.db.condition, 'service_healthy');
  assert.equal(c.services.db.build.dockerfile, 'packages/database/Dockerfile');
  assert.ok(c.services.db.healthcheck.test.join(' ').includes('-h 127.0.0.1'));
  assert.equal(c.services.web.depends_on.api.condition, 'service_healthy');
  for (const service of ['api', 'db', 'web']) assert.ok(c.services[service].healthcheck);
  assert.ok(c.services.db.volumes.some((v) => v.type === 'volume'));
  assert.equal(c.services.api.environment.QIWEN_API_KEY, 'compose-test-key');
  assert.equal(c.services.web.environment?.QIWEN_API_KEY, undefined);
  assert.equal(c.services.db.environment?.QIWEN_API_KEY, undefined);
}
for (const [service, target] of [
  ['web', 5173],
  ['api', 3000],
  ['db', 5432],
]) {
  assert.deepEqual(
    dev.services[service].ports.map((p) => p.target),
    [target],
  );
  assert.ok(dev.services[service].ports.every((p) => p.host_ip === '127.0.0.1'));
}
for (const service of ['api', 'web']) {
  assert.ok(
    dev.services[service].volumes.some((v) => v.type === 'bind' && v.target.endsWith('/src')),
  );
  assert.equal(dev.services[service].build.target, 'development');
}
assert.equal(prod.services.api.environment.NODE_ENV, 'production');
for (const service of ['api', 'db']) {
  assert.equal(prod.services[service].ports?.length ?? 0, 0);
}
assert.deepEqual(
  prod.services.web.ports.map((p) => p.target),
  [80],
);
assert.equal(prod.networks.database.internal, true);
assert.deepEqual(Object.keys(prod.services.db.networks), ['database']);
assert.deepEqual(Object.keys(prod.services.api.networks).sort(), ['application', 'database']);
assert.equal(prod.services.web.networks.database, undefined);
for (const s of Object.values(prod.services)) {
  assert.ok(
    (s.volumes ?? []).every((v) => v.type !== 'bind'),
    'Production must not bind host source',
  );
}
console.log(
  'Compose checks passed: startup ordering, dev mounts/ports, production network/port isolation.',
);
