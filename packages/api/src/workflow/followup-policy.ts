import { bad, fail, json, nextDay17, required, type Tx } from '../common/domain';

/** Individual evaluation's sales task. Never reopen handled work or create member care. */
export async function ensureFirstPurchaseFollowup(tx: Tx, participantId: string, now: Date) {
  const p = required(
    await tx.sessionParticipant.findUnique({
      where: { id: participantId },
      include: {
        student: true,
        session: { include: { course: true, classGroup: true, teacher: true } },
      },
    }),
  );
  if (p.student.type !== 'TRIAL') return null;
  if (
    p.bookingStatus !== 'BOOKED' ||
    p.attendance !== 'ATTENDED' ||
    !p.checkedInAt ||
    !p.feedbackSubmittedAt ||
    p.session.status !== 'SCHEDULED'
  )
    bad('A completed individual evaluation is required for this follow-up.');
  const existing = await tx.task.findFirst({ where: { participantId, type: 'TRIAL_FOLLOWUP' } });
  if (existing) {
    if (existing.sessionId !== p.sessionId || existing.purpose !== 'FIRST_PURCHASE')
      fail('FOLLOWUP_DATA_INVALID', 'The follow-up source needs reconciliation.');
    return existing;
  }
  const l = p.session;
  return tx.task.create({
    data: {
      type: 'TRIAL_FOLLOWUP',
      purpose: 'FIRST_PURCHASE',
      reason: 'TRIAL_COMPLETED',
      participantId,
      sessionId: l.id,
      assigneeId: p.student.ownerAdminId,
      availableAt: now,
      dueAt: nextDay17(now),
      sourceSnapshot: json({
        participantId,
        participantVersion: p.version,
        sessionId: l.id,
        studentId: p.studentId,
        studentName: p.student.name,
        className: l.classGroup.name,
        courseId: l.courseId,
        courseName: l.course.name,
        teacherId: l.teacherId,
        teacherName: l.teacher.name,
        startsAt: l.startsAt,
        endsAt: l.endsAt,
        checkedInAt: p.checkedInAt,
        classroomPerformanceRating: Number(p.classroomPerformanceRating),
        overallAbilityRating: Number(p.overallAbilityRating),
        teacherNoteHtml: p.teacherNoteHtml,
        feedbackSubmittedAt: p.feedbackSubmittedAt,
        membershipCategory: p.membershipCategorySnapshot,
      }),
    },
  });
}
