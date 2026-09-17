import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as common from '@student/common';
import * as db from '../src/generated/prisma/enums';
test('shared entitlement enums match persisted values', () => {
  for (const [actual, expected] of [
    [common.ENTITLEMENT_BUCKETS, db.EntitlementBucket],
    [common.ENTITLEMENT_KINDS, db.EntitlementKind],
    [common.MEMBERSHIP_CATEGORIES, db.MembershipCategory],
    [common.TASK_PURPOSES, db.TaskPurpose],
  ] as const)
    assert.deepEqual([...actual].sort(), Object.values(expected).sort());
});
