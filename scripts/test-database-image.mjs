// Verify empty-volume initialization and restart persistence without migrations.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const image = process.env.DEPLOY_TEST_IMAGE;
assert.ok(image, 'Set DEPLOY_TEST_IMAGE to the built StudentSys database image');
const name = `studentsys-db-init-test-${randomUUID()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
let id;
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (sql('SELECT 1').trim() === '1') return;
    } catch {
      // The entrypoint uses a socket-only temporary server while initializing.
    }
    await delay(250);
  }
  throw new Error(`Database failed to initialize: ${docker('logs', id)}`);
}
function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-e',
      'PGPASSWORD=isolated-image-test',
      id,
      'psql',
      '-X',
      '-h',
      '127.0.0.1',
      '-U',
      'student',
      '-d',
      'image_test',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      statement,
    ],
    { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
try {
  id = docker(
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'none',
    '-e',
    'POSTGRES_USER=student',
    '-e',
    'POSTGRES_DB=image_test',
    '-e',
    'POSTGRES_PASSWORD=isolated-image-test',
    image,
  ).trim();
  await ready();
  assert.equal(
    sql(`SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder)
    FROM pg_enum WHERE enumtypid='"TaskType"'::regtype`).trim(),
    'TRIAL_FEEDBACK,TRIAL_FOLLOWUP',
  );
  assert.equal(
    sql(`SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
    AND tgname IN ('Student_sync_admin_link','StudentAdminLink_guard')`).trim(),
    '2',
  );
  assert.equal(
    sql(`SELECT count(*) FROM pg_constraint WHERE conname='ClassSession_time_check'`).trim(),
    '1',
  );
  assert.equal(
    sql(`SELECT count(*) FROM information_schema.columns
    WHERE table_name='ClassSession' AND column_name='capacity'`).trim(),
    '0',
  );
  assert.equal(
    sql(`SELECT count(*) FROM pg_tables WHERE tablename='_prisma_migrations'`).trim(),
    '0',
  );
  sql(`INSERT INTO "User" (id,name,email,"passwordHash",role)
    VALUES ('init-admin','Init admin','init@example.test','unused','ADMIN');
    INSERT INTO "Student" (id,name,"yearLevel","ownerAdminId","updatedAt")
    VALUES ('init-student','Init student','Year 3','init-admin',now());`);
  assert.equal(
    sql(`SELECT "adminId" FROM "StudentAdminLink" WHERE "studentId"='init-student'`).trim(),
    'init-admin',
  );
  // The official image's anonymous volume is removed in finally; restart retains it.
  docker('restart', id);
  await ready();
  assert.equal(sql(`SELECT count(*) FROM "Student" WHERE id='init-student'`).trim(), '1');
  console.log(
    'Database image passed: empty-volume schema, latest enums, constraints, ownership trigger and no migration history.',
  );
} finally {
  if (id) docker('rm', '-f', '-v', id);
}
