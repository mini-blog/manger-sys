import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
const container = `studentsys-entitlement-test-${randomUUID().slice(0, 8)}`;
const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, {
    cwd: resolve(import.meta.dirname, '..'),
    env,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed (${result.status}): ${result.error ?? ''}`);
};
let started = false;
try {
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '-e',
      'POSTGRES_USER=entitlement_test',
      '-e',
      'POSTGRES_PASSWORD=isolated_test_only',
      '-e',
      'POSTGRES_DB=entitlement_test',
      '-p',
      '127.0.0.1::5432',
      'postgres:17-alpine',
    ],
    { stdio: 'pipe' },
  );
  started = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const result = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', 'entitlement_test', '-d', 'entitlement_test'],
      { stdio: 'ignore' },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    await delay(250);
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready.');
  const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
    .trim()
    .split(':')
    .at(-1);
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://entitlement_test:isolated_test_only@127.0.0.1:${port}/entitlement_test`,
    ENTITLEMENT_TEST_ISOLATED: 'true',
    NODE_ENV: 'test',
    SESSION_COOKIE_SECURE: 'false',
    SEED_PASSWORD: 'IsolatedTest2026!',
    QWEN_API_KEY: '',
    ACCOUNT_COMMAND_HASH_SECRET: randomUUID() + randomUUID(),
  };
  run('pnpm', ['--filter', '@student/api...', 'build'], env);
  run('pnpm', ['db:init'], env);
  run(process.execPath, ['packages/api/test/entitlements.mjs'], env);
  run(process.execPath, ['packages/api/test/accounts.mjs'], env);
  // Final seed and current HTTP lifecycle only; retired move/restore/reopen matrices are excluded.
  run('pnpm', ['db:seed'], env);
  run(process.execPath, ['packages/api/test/seed-repeat.mjs'], env);
  run(process.execPath, ['packages/api/test/integration.mjs'], env);
  run(process.execPath, ['packages/api/test/workflow.mjs'], env);
} finally {
  if (started) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
