import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const name = 'studentsys-ai-test-' + randomUUID().slice(0, 8);
const run = (command, args, env) => {
  const r = spawnSync(command, args, { env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${command} failed (${r.status})`);
};
try {
  execFileSync('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '-e',
    'POSTGRES_PASSWORD=test_only',
    '-e',
    'POSTGRES_USER=test',
    '-e',
    'POSTGRES_DB=studentsys_ai_test',
    '-p',
    '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  for (let i = 0; i < 60; i++) {
    if (
      spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'test'], { stdio: 'ignore' })
        .status === 0
    )
      break;
    await delay(250);
  }
  const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' })
    .trim()
    .split(':')
    .at(-1);
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://test:test_only@127.0.0.1:${port}/studentsys_ai_test`,
    AI_TEST_ISOLATED: 'true',
    NODE_ENV: 'test',
    SESSION_COOKIE_SECURE: 'false',
    QIWEN_API_KEY: '',
    QWEN_MODEL: 'mock-provider-test-only',
    ACCOUNT_COMMAND_HASH_SECRET: randomUUID() + randomUUID(),
  };
  // Exercise the actual CI/Prisma entry points, not just the SQL files directly.
  run('pnpm', ['db:generate'], env);
  run('pnpm', ['db:init'], env);
  run('pnpm', ['db:seed'], env);
  run('pnpm', ['--filter', '@student/api...', 'build'], env);
  run(process.execPath, ['packages/api/test/ai-workflow.mjs'], env);
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
}
