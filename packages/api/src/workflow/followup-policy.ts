import { bad, fail, json, nextDay17, required, type Tx } from '../common/domain';

export type FollowupEvent = 'TRIAL_COMPLETED' | 'NO_SHOW' | 'CANCELLED';
/** Call only inside the outer Commands transaction; these helpers never commit. */
export async function ensureFollowup(
  tx: Tx,
  participantId: string,
  event: FollowupEvent,
  now: Date,
) {
  const p = required(
    await tx.sessionParticipant.findUnique({
      where: { id: participantId },
      include: {
        student: true,
        session: { include: { course: true, classGroup: true, teacher: true } },
      },
    }),
  );
  if (p.kind !== 'TRIAL') bad('Follow-up requires a trial participant.');
  if (
    (event === 'CANCELLED' && p.bookingStatus !== 'CANCELLED') ||
    (event !== 'CANCELLED' &&
      (p.bookingStatus !== 'BOOKED' ||
        p.attendance !== (event === 'TRIAL_COMPLETED' ? 'ATTENDED' : 'NO_SHOW')))
  )
    bad('Follow-up event does not match attendance or booking status.');
  const existing = await tx.task.findFirst({ where: { type: 'TRIAL_FOLLOWUP', participantId } });
  if (existing && existing.sessionId !== p.sessionId)
    bad('Task source does not match its session.');
  const snapshot = existing?.sourceSnapshot as { participantVersion?: number } | null;
  // A restore followed by cancellation is a new event, even when its reason is unchanged.
  // Repeated delivery of the same participant version must not reopen a handled task.
  if (
    (existing?.reason === event && snapshot?.participantVersion === p.version) ||
    (event === 'TRIAL_COMPLETED' && existing?.resolvedByEntitlementEntryId)
  )
    return existing;
  const purpose =
    event !== 'TRIAL_COMPLETED'
      ? 'REBOOKING'
      : p.student.type === 'TRIAL'
        ? 'FIRST_PURCHASE'
        : 'MEMBER_CARE';
  const l = p.session;
  const data = {
    assigneeId: p.student.ownerAdminId,
    sessionId: p.sessionId,
    purpose,
    reason: event,
    status: 'OPEN' as const,
    completedAt: null,
    resolvedByEntitlementEntryId: null,
    rebookedToParticipantId: null,
    availableAt: now,
    dueAt: nextDay17(event === 'CANCELLED' ? now : l.endsAt),
    sourceSnapshot: json({
      participantVersion: p.version,
      className: l.classGroup.name,
      courseId: l.courseId,
      courseName: l.course.name,
      teacherId: l.teacherId,
      teacherName: l.teacher.name,
      startsAt: l.startsAt,
      endsAt: l.endsAt,
    }),
  } as const;
  return existing
    ? tx.task.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    : tx.task.create({ data: { ...data, type: 'TRIAL_FOLLOWUP', participantId } });
}
export async function closeFirstPurchase(tx: Tx, studentId: string, entryId: string, now: Date) {
  const entry = required(await tx.entitlementEntry.findUnique({ where: { id: entryId } }));
  if (entry.studentId !== studentId || entry.bucket !== 'REGULAR' || entry.kind !== 'PURCHASE')
    bad('Only this student’s purchase can resolve first-purchase follow-ups.');
  const student = required(await tx.student.findUnique({ where: { id: studentId } }));
  const tasks = await tx.task.findMany({
    where: {
      type: 'TRIAL_FOLLOWUP',
      purpose: 'FIRST_PURCHASE',
      status: 'OPEN',
      participant: { studentId },
    },
    include: { participant: true },
  });
  if (
    tasks.some(
      (t) => t.assigneeId !== student.ownerAdminId || t.sessionId !== t.participant?.sessionId,
    )
  )
    fail('FOLLOWUP_DATA_INVALID', 'Follow-up ownership or source needs reconciliation.');
  const ids = tasks.map((t) => t.id);
  await tx.task.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'DONE',
      reason: 'PURCHASE_RECORDED',
      completedAt: now,
      resolvedByEntitlementEntryId: entryId,
      version: { increment: 1 },
    },
  });
  return ids;
}
export async function closeRebooking(
  tx: Tx,
  sourceTaskId: string,
  targetParticipantId: string,
  now: Date,
) {
  const t = required(
    await tx.task.findUnique({
      where: { id: sourceTaskId },
      include: {
        participant: { include: { student: true, session: true } },
      },
    }),
  );
  const target = required(
    await tx.sessionParticipant.findUnique({
      where: { id: targetParticipantId },
      include: { session: true },
    }),
  );
  if (t.type !== 'TRIAL_FOLLOWUP' || t.purpose !== 'REBOOKING' || t.status !== 'OPEN')
    fail('TASK_NOT_REBOOKABLE', 'Select an open rebooking follow-up.');
  if (
    !t.participant ||
    t.sessionId !== t.participant.sessionId ||
    t.assigneeId !== t.participant.student.ownerAdminId ||
    t.participant.studentId !== target.studentId ||
    t.participant.session.courseId !== target.session.courseId ||
    target.bookingStatus !== 'BOOKED' ||
    target.attendance !== 'PENDING' ||
    target.session.status !== 'SCHEDULED' ||
    target.session.startsAt <= now
  )
    bad('Rebooking must reference the same student and subject, with a valid future booking.');
  return tx.task.update({
    where: { id: t.id },
    data: {
      status: 'DONE',
      reason: 'REBOOKED',
      completedAt: now,
      rebookedToParticipantId: target.id,
      resolvedByEntitlementEntryId: null,
      version: { increment: 1 },
    },
  });
}

/** Follow only explicit booking links, never all tasks for the student/subject. */
export async function moveRebookingLinks(
  tx: Tx,
  fromParticipantId: string,
  toParticipantId: string,
  now: Date,
) {
  const target = required(
    await tx.sessionParticipant.findUnique({
      where: { id: toParticipantId },
      include: { student: true, session: true },
    }),
  );
  const tasks = await tx.task.findMany({
    where: {
      type: 'TRIAL_FOLLOWUP',
      purpose: 'REBOOKING',
      OR: [
        { status: 'OPEN', participantId: { in: [fromParticipantId, toParticipantId] } },
        { status: 'DONE', reason: 'REBOOKED', rebookedToParticipantId: fromParticipantId },
      ],
    },
    include: { participant: { include: { session: true } } },
    orderBy: { id: 'asc' },
  });
  const changes = [];
  for (const task of tasks) {
    if (
      !task.participant ||
      task.sessionId !== task.participant.sessionId ||
      task.assigneeId !== target.student.ownerAdminId ||
      task.participant.studentId !== target.studentId ||
      task.participant.session.courseId !== target.session.courseId ||
      task.resolvedByEntitlementEntryId
    )
      fail('FOLLOWUP_DATA_INVALID', 'Follow-up ownership or source needs reconciliation.');
    const updated =
      task.status === 'OPEN'
        ? await closeRebooking(tx, task.id, target.id, now)
        : await tx.task.update({
            where: { id: task.id },
            // Preserve the original resolution, snapshot and communication history.
            data: { rebookedToParticipantId: target.id, version: { increment: 1 } },
          });
    changes.push({
      taskId: task.id,
      before: {
        status: task.status,
        rebookedToParticipantId: task.rebookedToParticipantId,
        version: task.version,
      },
      after: {
        status: updated.status,
        rebookedToParticipantId: updated.rebookedToParticipantId,
        version: updated.version,
      },
    });
  }
  return changes;
}
