import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
config({ path: '../../.env', quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (process.env.NODE_ENV === 'production')
  throw new Error('Development seed must not run in production.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile(resolve('../../sql/development-seed.sql'), 'utf8'));
  console.log('AI v2 fictional development fixtures loaded. See README for demo accounts.');
} finally {
  await pool.end();
}
