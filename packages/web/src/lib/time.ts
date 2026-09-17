import { BUSINESS_TIMEZONE } from '@student/common';
import { DateTime } from 'luxon';
import type { components } from '@student/common/api';
export const ZONE = BUSINESS_TIMEZONE;
export type Lesson = components['schemas']['LessonDto'];
export const local = (value: string) => DateTime.fromISO(value).setZone(ZONE).setLocale('en-AU');
export const currentWeek = () => DateTime.now().setZone(ZONE).setLocale('en-AU').startOf('week');
