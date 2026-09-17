import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const name = `studentsys-ui-preview-${randomUUID().slice(0, 8)}`;
const children = [];
let container = false,
  stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  if (container) spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
}
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
process.on('exit', stop);
try {
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '-e',
      'POSTGRES_USER=preview',
      '-e',
      'POSTGRES_PASSWORD=preview_local_only',
      '-e',
      'POSTGRES_DB=entitlement_ui_preview',
      '-p',
      '127.0.0.1::5432',
      'postgres:17-alpine',
    ],
    { stdio: 'pipe' },
  );
  container = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (
      spawnSync(
        'docker',
        ['exec', name, 'pg_isready', '-U', 'preview', '-d', 'entitlement_ui_preview'],
        { stdio: 'ignore' },
      ).status === 0
    ) {
      ready = true;
      break;
    }
    await delay(250);
  }
  if (!ready) throw new Error('Preview database did not start.');
  const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' })
    .trim()
    .split(':')
    .at(-1);
  const apiPort = process.env.PREVIEW_API_PORT || '3102',
    webPort = process.env.PREVIEW_WEB_PORT || '18081';
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://preview:preview_local_only@127.0.0.1:${port}/entitlement_ui_preview`,
    ENTITLEMENT_UI_PREVIEW: 'true',
    API_PORT: apiPort,
    API_HOST: '127.0.0.1',
    API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    NODE_ENV: 'development',
    SESSION_COOKIE_SECURE: 'false',
    QWEN_API_KEY: '',
    ACCOUNT_COMMAND_HASH_SECRET: randomUUID() + randomUUID(),
  };
  for (const args of [['--filter', '@student/api...', 'build'], ['db:init']]) {
    const r = spawnSync('pnpm', args, { cwd: root, env, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Preview build/schema initialization failed.');
  }
  // Seed once. The watched API can then restart after a build without recreating test data.
  const fixture = spawnSync(process.execPath, ['packages/api/test/ui-preview.mjs'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (fixture.status !== 0) throw new Error('Preview fixture setup failed.');
  const timetable = spawnSync(process.execPath, ['packages/api/test/seed-preview-timetable.mjs'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (timetable.status !== 0) throw new Error('Preview timetable setup failed.');
  const api = spawn(
    process.execPath,
    [
      '--watch-path=packages/api/dist',
      '--watch-path=packages/common/dist',
      'packages/api/dist/main.js',
    ],
    {
      cwd: root,
      env,
      stdio: 'inherit',
      detached: true,
    },
  );
  children.push(api);
  api.once('exit', () => {
    if (!stopping) {
      stop();
      process.exitCode = 1;
    }
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok) break;
    } catch {}
    if (i === 99) throw new Error('Preview API did not start.');
    await delay(200);
  }
  const web = spawn(
    'pnpm',
    [
      '--filter',
      '@student/web',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      webPort,
      '--strictPort',
    ],
    { cwd: root, env, stdio: 'inherit', detached: true },
  );
  children.push(web);
  web.once('exit', () => {
    if (!stopping) {
      stop();
      process.exitCode = 1;
    }
  });
  console.log(
    `Preview: http://localhost:${webPort}/students — Ctrl+C removes only this preview database.`,
  );
} catch (error) {
  stop();
  throw error;
}
