// Real reset shell, simulated Docker CLI, no Docker socket or server access.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const image = process.env.DEPLOY_TEST_IMAGE;
assert.ok(image, 'Set DEPLOY_TEST_IMAGE to a local StudentSys database image');
const dir = mkdtempSync(join(tmpdir(), 'studentsys-reset-test-'));
const root = join(dir, 'root'),
  bin = join(dir, 'bin'),
  sha = 'a'.repeat(40);
mkdirSync(bin);
writeFileSync(
  join(bin, 'docker'),
  `#!/bin/bash
set -eu
root=/opt/studentsys
printf '%s\\n' "$*" >> "$root/commands.log"
if [[ "$1 $2" == 'image inspect' && -f "$root/missing-image" ]]; then exit 1; fi
if [[ "$1 $2" == 'volume inspect' ]]; then
 if [[ "$*" == *com.docker.compose.project* ]]; then
  if [[ -f "$root/foreign-volume" ]]; then echo other-project; else echo studentsys-prod; fi
 else echo postgres_data; fi
fi
if [[ "$1" == inspect ]]; then echo studentsys-prod_postgres_data; fi
if [[ " $* " == *' config --images '* ]]; then printf 'studentsys-api:%s\\nstudentsys-db:%s\\nstudentsys-web:%s\\n' "$IMAGE_TAG" "$IMAGE_TAG" "$IMAGE_TAG"; fi
if [[ " $* " == *' config --volumes '* ]]; then echo postgres_data; fi
if [[ " $* " == *' ps -aq db '* ]]; then echo fake-db-id; fi
if [[ " $* " == *' --wait-timeout 180 db '* && -f "$root/fail-db" ]]; then exit 42; fi
if [[ " $* " == *' exec -T web '* && -f "$root/fail-health" ]]; then exit 43; fi
`,
  { mode: 0o755 },
);
function setup(flag) {
  rmSync(root, { recursive: true, force: true });
  const release = join(root, 'releases', sha + '-1-1');
  mkdirSync(release, { recursive: true });
  writeFileSync(join(root, '.env.prod'), 'POSTGRES_PASSWORD=fixture-only\n');
  writeFileSync(join(root, '.env.ai'), 'QIWEN_API_KEY=fixture-only\n');
  writeFileSync(join(release, 'compose.prod.yaml'), 'fixture');
  symlinkSync('/opt/studentsys/releases/' + sha + '-1-1', join(root, 'current'));
  if (flag) writeFileSync(join(root, flag), '');
}
function run(confirmation = 'RESET_STUDENTSYS', locked = false) {
  const command = locked
    ? 'ln -s /tmp/reset-test.lock /opt/studentsys/deploy.lock; exec 8>/tmp/reset-test.lock; flock 8; bash /reset.sh "$1"'
    : 'bash /reset.sh "$1"';
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'bash',
      '-v',
      root + ':/opt/studentsys',
      '-v',
      bin + ':/test-bin:ro',
      '-v',
      resolve('scripts/reset-database-server.sh') + ':/reset.sh:ro',
      '-e',
      'PATH=/test-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      image,
      '-c',
      command,
      'test',
      confirmation,
    ],
    { encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' },
  );
  assert.ifError(r.error);
  return r;
}
try {
  setup();
  let r = run();
  assert.equal(r.status, 0, r.stderr);
  const log = readFileSync(join(root, 'commands.log'), 'utf8');
  assert.equal(log.match(/volume rm studentsys-prod_postgres_data/g)?.length, 1);
  assert.ok(log.indexOf('stop web api') < log.indexOf('volume rm'));
  assert.ok(log.indexOf('volume rm') < log.indexOf('--wait-timeout 180 db'));
  assert.ok(log.indexOf('--wait-timeout 180 db') < log.indexOf('--wait-timeout 120 api'));
  assert.match(log, /--env-file \/opt\/studentsys\/\.env.ai/);
  assert.doesNotMatch(log, /pg_dump|prune|down --volumes/);
  assert.equal(readFileSync(join(root, '.env.prod'), 'utf8'), 'POSTGRES_PASSWORD=fixture-only\n');
  for (const flag of ['foreign-volume', 'missing-image']) {
    setup(flag);
    assert.notEqual(run().status, 0);
    assert.doesNotMatch(readFileSync(join(root, 'commands.log'), 'utf8'), /volume rm|stop web api/);
  }
  setup();
  assert.notEqual(run('WRONG').status, 0);
  setup();
  assert.notEqual(run('RESET_STUDENTSYS', true).status, 0);
  for (const flag of ['fail-db', 'fail-health']) {
    setup(flag);
    assert.notEqual(run().status, 0);
    const failed = readFileSync(join(root, 'commands.log'), 'utf8');
    assert.match(failed.trim().split('\n').at(-1), /stop web api/);
    if (flag === 'fail-db') assert.doesNotMatch(failed, /--wait-timeout 120 api/);
  }
  console.log(
    'Reset tests passed: exact volume, deployed images, no backup, credentials preserved, confirmation, lock, foreign volume, missing image, initialization and health failures.',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
