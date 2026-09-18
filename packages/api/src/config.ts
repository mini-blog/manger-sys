import { BUSINESS_TIMEZONE } from '@student/common';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Explicit process/container environment always takes precedence over local files.
config({ path: resolve(__dirname, '../../../env.local'), quiet: true });
config({ path: resolve(__dirname, '../../../.env'), quiet: true });

export const settings = {
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://student:student_dev@localhost:5433/student_sys',
  port: Number(process.env.API_PORT ?? 3100),
  host: process.env.API_HOST ?? '127.0.0.1',
  secureCookie:
    process.env.SESSION_COOKIE_SECURE === undefined
      ? process.env.NODE_ENV === 'production'
      : process.env.SESSION_COOKIE_SECURE === 'true',
  timezone: BUSINESS_TIMEZONE,
};
