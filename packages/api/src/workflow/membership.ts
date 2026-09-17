import { BUSINESS_TIMEZONE, type MembershipCategory } from '@student/common';
import { DateTime } from 'luxon';

/** Calendar boundaries shared by classification and database list filters. */
export function membershipBounds(referenceInstant: Date) {
  const today = DateTime.fromJSDate(referenceInstant, { zone: BUSINESS_TIMEZONE }).startOf('day');
  if (!today.isValid) throw new RangeError('Invalid membership reference instant.');
  return {
    membershipAsOfDate: today.toISODate()!,
    newMemberFrom: today.minus({ days: 6 }).toJSDate(),
    nextMidnight: today.plus({ days: 1 }).toJSDate(),
  };
}
export function membership(firstPurchasedAt: Date | null, referenceInstant: Date) {
  const bounds = membershipBounds(referenceInstant);
  let membershipCategory: MembershipCategory = 'TRIAL_STUDENT';
  if (firstPurchasedAt) {
    if (!Number.isFinite(firstPurchasedAt.getTime()))
      throw new RangeError('Invalid purchase instant.');
    if (firstPurchasedAt < bounds.nextMidnight)
      membershipCategory = firstPurchasedAt >= bounds.newMemberFrom ? 'NEW_MEMBER' : 'MEMBER';
  }
  return {
    membershipCategory,
    membershipAsOfDate: bounds.membershipAsOfDate,
    nextCategoryChangeAt: bounds.nextMidnight.toISOString(),
  };
}
