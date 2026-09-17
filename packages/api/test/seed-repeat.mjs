import assert from 'node:assert/strict';
import pg from 'pg';
import { execFileSync } from 'node:child_process';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function snapshot() {
  const result = {};
  for (const table of [
    'User',
    'Student',
    'ClassSession',
    'SessionParticipant',
    'Task',
    'EntitlementEntry',
  ])
    result[table] = (
      await db.query(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY id`)
    ).rows;
  return result;
}
try {
  const before = await snapshot();
  execFileSync('pnpm', ['db:seed'], { stdio: 'inherit' });
  assert.deepEqual(await snapshot(), before);
  console.log('Seed repeat passed: no refill, duplicate, overwrite, or reopened task.');
} finally {
  await db.end();
}
