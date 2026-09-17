// Exercise the real Linux deployment script with a simulated Docker CLI.
// No Docker socket, network, production volume or server credentials enter the container.
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readlinkSync,
  existsSync,
  statSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const image = process.env.DEPLOY_TEST_IMAGE;
assert.ok(image, 'Set DEPLOY_TEST_IMAGE to an already-built StudentSys database image');
const dir = mkdtempSync(join(tmpdir(), 'studentsys-deploy-test-'));
const sha = 'a'.repeat(40);
const remoteRelease = `/opt/studentsys/releases/${sha}-1-1`;
const root = join(dir, 'root');
const bin = join(dir, 'bin');
mkdirSync(bin);
writeFileSync(
  join(bin, 'docker'),
  `#!/bin/bash
set -eu
root=/opt/studentsys
printf '%s\\n' "$*" >> "$root/commands.log"
if [[ "$1" == volume ]]; then test -f "$root/existing-volume"; exit; fi
if [[ "$1" == load ]]; then cat >/dev/null; exit; fi
if [[ " $* " == *' --wait-timeout 120 db '* && -f "$root/fail-database" ]]; then exit 42; fi
if [[ " $* " == *' exec -T web '* && -f "$root/fail-health" ]]; then exit 43; fi
`,
  { mode: 0o755 },
);

function pack() {
  const release = join(root, 'releases', `${sha}-1-1`);
  mkdirSync(release, { recursive: true });
  const bundle = gzipSync('simulated Docker image archive');
  writeFileSync(join(release, 'images.tar.gz'), bundle);
  writeFileSync(
    join(release, 'images.sha256'),
    `${createHash('sha256').update(bundle).digest('hex')}  images.tar.gz\n`,
  );
  return release;
}
function run() {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'bash',
      '-v',
      `${root}:/opt/studentsys`,
      '-v',
      `${bin}:/test-bin:ro`,
      '-v',
      `${resolve('scripts/deploy-server.sh')}:/deploy-server.sh:ro`,
      '-e',
      'PATH=/test-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      '-e',
      `TEST_UID=${process.getuid()}`,
      '-e',
      `TEST_GID=${process.getgid()}`,
      image,
      '-c',
      // Linux bind mounts retain container root ownership; return fixtures to the runner.
      'bash /deploy-server.sh "$1" "$2"; status=$?; chown -R "$TEST_UID:$TEST_GID" /opt/studentsys; exit "$status"',
      'deploy-test',
      sha,
      remoteRelease,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.ifError(result.error);
  return result;
}
function reset() {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root);
  return pack();
}
try {
  reset();
  const first = run();
  assert.equal(first.status, 0, `first deployment succeeds: ${first.stdout}\n${first.stderr}`);
  const env = readFileSync(join(root, '.env.prod'), 'utf8');
  assert.match(env, /POSTGRES_PASSWORD=[a-f0-9]{64}/);
  assert.match(env, /ACCOUNT_COMMAND_HASH_SECRET=[a-f0-9]{64}/);
  assert.equal(statSync(join(root, '.env.prod')).mode & 0o777, 0o600);
  assert.equal(readlinkSync(join(root, 'current')), remoteRelease);
  const commands = readFileSync(join(root, 'commands.log'), 'utf8');
  assert.ok(commands.indexOf('stop web api') < commands.indexOf('--wait-timeout 120 db'));
  assert.ok(commands.indexOf('--wait-timeout 120 db') < commands.indexOf('--wait-timeout 120 api'));
  assert.ok(
    commands.indexOf('--wait-timeout 120 api') < commands.indexOf('--wait-timeout 120 web'),
  );
  assert.doesNotMatch(commands, /\bmigrate\b/, 'deployment must not execute migrations');
  pack();
  assert.equal(run().status, 0, 'repeat deployment succeeds');
  assert.equal(
    readFileSync(join(root, '.env.prod'), 'utf8'),
    env,
    'repeat deployment preserves secrets',
  );

  reset();
  writeFileSync(join(root, 'existing-volume'), '');
  assert.notEqual(run().status, 0, 'existing DB without environment must fail');
  assert.equal(existsSync(join(root, '.env.prod')), false);

  reset();
  writeFileSync(join(root, 'fail-database'), '');
  assert.notEqual(run().status, 0, 'failed database startup must fail deployment');
  assert.equal(existsSync(join(root, 'current')), false);
  assert.doesNotMatch(readFileSync(join(root, 'commands.log'), 'utf8'), /--wait-timeout 120 api/);

  reset();
  writeFileSync(join(root, 'fail-health'), '');
  assert.notEqual(run().status, 0, 'failed proxy health must fail deployment');
  assert.equal(existsSync(join(root, 'current')), false);

  const release = reset();
  writeFileSync(join(release, 'images.tar.gz'), 'corrupted upload');
  assert.notEqual(run().status, 0, 'corrupt archive must fail before environment/database changes');
  assert.equal(existsSync(join(root, '.env.prod')), false);
  console.log(
    'Deployment script passed: initialization, repeat release, missing environment, database failure, health failure, corrupt upload; no migration commands (simulated Docker CLI).',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
