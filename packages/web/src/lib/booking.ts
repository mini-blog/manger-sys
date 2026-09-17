import type { components } from '@student/common/api';

export function contactIssue(s: components['schemas']['StudentDetailDto']) {
  if (!s.canEdit) return 'Only the responsible admin can book this student.';
  if (!s.guardianName?.trim()) return 'Add the guardian name before booking.';
  if (!s.guardianPhone && !s.guardianEmail && !s.guardianWechat)
    return 'Add a guardian email, phone number or WeChat contact.';
  if (s.preferredChannel === 'EMAIL' && !s.guardianEmail) return 'Add the preferred email contact.';
  if (['PHONE', 'SMS'].includes(s.preferredChannel ?? '') && !s.guardianPhone)
    return 'Add the preferred phone contact.';
  if (s.preferredChannel === 'WECHAT' && !s.guardianWechat)
    return 'Add the preferred WeChat contact.';
  return null;
}

/** Accept only app-owned return routes, never external URLs or arbitrary paths. */
export function bookingReturn(value: string | null) {
  if (!value || !value.startsWith('/timetable?')) return null;
  const query = new URLSearchParams(value.slice('/timetable?'.length));
  const safe = new URLSearchParams();
  for (const key of [
    'week',
    'view',
    'q',
    'group',
    'course',
    'teacher',
    'lesson',
    'student',
    'bucket',
    'sourceRebookingTaskId',
  ]) {
    const v = query.get(key);
    if (v) safe.set(key, v);
  }
  return `/timetable?${safe}`;
}
export function bookingLocation(params: URLSearchParams, studentId: string, bucket: string) {
  const next = new URLSearchParams(params);
  next.set('student', studentId);
  next.set('bucket', bucket);
  return bookingReturn(`/timetable?${next}`)!;
}
