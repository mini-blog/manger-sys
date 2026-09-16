import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekBounds } from '../src/schedule/time';
import { hashPassword, verifyPassword } from '../src/auth/password';

test('Melbourne DST weeks use local Monday boundaries, not a fixed 168 hours', () => {
  const spring = weekBounds('2026-10-04');
  assert.equal(spring.start.toISOString(), '2026-09-27T14:00:00.000Z');
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 167);
  const autumn = weekBounds('2026-04-05');
  assert.equal((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000, 169);
  assert.throws(() => weekBounds('2026-02-30'));
  assert.throws(() => weekBounds('2026-09-16T00:00:00Z'));
});

test('password hashes are salted and reject wrong passwords and invalid storage values', async () => {
  const a = await hashPassword('test-password');
  const b = await hashPassword('test-password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('test-password', a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
  assert.equal(await verifyPassword('test-password', 'invalid'), false);
});
