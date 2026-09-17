import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { membership, membershipBounds } from '../src/workflow/membership';
const date = (s: string) => DateTime.fromISO(s, { zone: 'Australia/Melbourne' }).toJSDate();
const category = (p: string | null, ref: string) =>
  membership(p ? date(p) : null, date(ref)).membershipCategory;
test('membership follows Melbourne calendar days, including same-day lessons before purchase', () => {
  const p = '2026-09-17T23:59:00';
  assert.equal(category(null, '2026-09-17'), 'TRIAL_STUDENT');
  assert.equal(category(p, '2026-09-16T23:59:59'), 'TRIAL_STUDENT');
  assert.equal(category(p, '2026-09-17T08:00:00'), 'NEW_MEMBER');
  assert.equal(category(p, '2026-09-23T23:59:59'), 'NEW_MEMBER');
  assert.equal(category(p, '2026-09-24T00:00:00'), 'MEMBER');
  assert.equal(category(p, '2027-01-01'), 'MEMBER');
});
test('membership boundaries use 167/169 hour DST weeks', () => {
  for (const [start, end, hours] of [
    ['2026-09-28', '2026-10-05', 167],
    ['2026-03-30', '2026-04-06', 169],
  ] as const) {
    assert.equal((date(end).getTime() - date(start).getTime()) / 3600000, hours);
    assert.equal(category(start, end), 'MEMBER');
    const prior = new Date(date(end).getTime() - 1);
    assert.equal(membership(date(start), prior).membershipCategory, 'NEW_MEMBER');
    assert.equal(membershipBounds(prior).nextMidnight.toISOString(), date(end).toISOString());
    assert.equal(membershipBounds(prior).newMemberFrom.toISOString(), date(start).toISOString());
  }
});
