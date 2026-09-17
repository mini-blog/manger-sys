import { BUSINESS_TIMEZONE } from '@student/common';
import { DateTime } from 'luxon';

export const BUSINESS_ZONE = BUSINESS_TIMEZONE;

export function weekBounds(date: string) {
  const value = DateTime.fromISO(date, { zone: BUSINESS_ZONE });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !value.isValid)
    throw new Error('Invalid calendar date.');
  const start = value.startOf('week');
  return { start: start.toJSDate(), end: start.plus({ weeks: 1 }).toJSDate() };
}
