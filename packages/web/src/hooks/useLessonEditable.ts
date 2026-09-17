import { useEffect, useState } from 'react';
import type { Lesson } from '../lib/time';

export function useLessonEditable(lesson?: Lesson) {
  const [now, setNow] = useState(Date.now);
  const startsAt = lesson?.startsAt;
  useEffect(() => {
    if (!startsAt) return;
    const remaining = new Date(startsAt).getTime() - Date.now();
    if (remaining <= 0) return;
    // Recheck at the start boundary; clamp long delays to the browser's timer range.
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(remaining, 2147483647));
    return () => window.clearTimeout(timer);
  }, [startsAt, now]);
  return (
    !lesson ||
    (lesson.status === 'SCHEDULED' &&
      !lesson.feedbackSubmittedAt &&
      new Date(lesson.startsAt).getTime() > Math.max(now, Date.now()))
  );
}
