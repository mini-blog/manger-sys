import { BUSINESS_TIMEZONE, type MembershipCategory, type StudentType } from '@student/common';
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
export function membership(
  student: { type: StudentType; firstPurchasedAt: Date | null },
  referenceInstant: Date,
) {
  const { type, firstPurchasedAt } = student;
  const bounds = membershipBounds(referenceInstant);
  let membershipCategory: MembershipCategory = 'TRIAL_STUDENT';
  if (type === 'MEMBER') {
    if (!firstPurchasedAt) throw new RangeError('A member must have a first purchase instant.');
    if (!Number.isFinite(firstPurchasedAt.getTime()))
      throw new RangeError('Invalid purchase instant.');
    membershipCategory =
      firstPurchasedAt >= bounds.newMemberFrom && firstPurchasedAt < bounds.nextMidnight
        ? 'NEW_MEMBER'
        : 'MEMBER';
  }
  return {
    membershipCategory,
    membershipAsOfDate: bounds.membershipAsOfDate,
    nextCategoryChangeAt: bounds.nextMidnight.toISOString(),
  };
}

/** Live roster labels follow student identity, not the funding card or old booking snapshots. */
export function studentCategory(
  student: { type: StudentType; firstPurchasedAt: Date | null },
  reference: Date,
) {
  return rosterMembership(student, reference).category;
}

/** Both API labels describe the same live identity at the lesson's local calendar date. */
export function rosterMembership(
  student: { type: StudentType; firstPurchasedAt: Date | null },
  lessonStartsAt: Date,
) {
  const { membershipCategory } = membership(student, lessonStartsAt);
  const category =
    membershipCategory === 'TRIAL_STUDENT'
      ? ('TRIAL' as const)
      : membershipCategory === 'NEW_MEMBER'
        ? ('NEW' as const)
        : ('EXISTING' as const);
  return { membershipCategory, category };
}
