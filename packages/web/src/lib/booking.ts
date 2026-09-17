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
