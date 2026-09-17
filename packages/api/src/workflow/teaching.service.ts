import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  Actor,
  admin,
  bad,
  Clock,
  Commands,
  digest,
  fail,
  instant,
  json,
  nextDay17,
  required,
  Tx,
  version,
} from '../common/domain';
import { lessonDto, lessonInclude, FullLesson, ownedStudent } from './read.service';
import * as D from './dto';
import type { Student } from '../generated/prisma/client';
import { EntitlementsService } from './entitlements.service';
import {
  closeRebooking,
  ensureFollowup,
  moveRebookingLinks,
  type FollowupEvent,
} from './followup-policy';
import { rosterMembership, studentCategory } from './membership';
export async function teacherTask(tx: Tx, l: FullLesson) {
  const existing = await tx.task.findFirst({ where: { type: 'LESSON_FEEDBACK', sessionId: l.id } });
  const data = {
    assigneeId: l.teacherId,
    availableAt: l.endsAt,
    dueAt: nextDay17(l.endsAt),
    status:
      l.status === 'CANCELLED'
        ? ('CANCELLED' as const)
        : l.feedbackSubmittedAt
          ? ('DONE' as const)
          : ('OPEN' as const),
  };
  if (existing)
    return tx.task.update({
      where: { id: existing.id },
      data: { ...data, version: { increment: 1 } },
    });
  return tx.task.create({ data: { ...data, type: 'LESSON_FEEDBACK', sessionId: l.id } });
}
/** Update pending evaluations with the lesson; never create or reopen historical tasks. */
export async function syncScheduledTeacherTasks(tx: Tx, l: FullLesson) {
  await tx.task.updateMany({
    where: {
      sessionId: l.id,
      type: 'TRIAL_FEEDBACK',
      status: 'OPEN',
    },
    data: {
      assigneeId: l.teacherId,
      availableAt: l.endsAt,
      dueAt: nextDay17(l.endsAt),
      version: { increment: 1 },
    },
  });
}
export async function followTask(
  tx: Tx,
  l: FullLesson,
  p: FullLesson['participants'][number],
  reason: FollowupEvent,
  now: Date,
) {
  return ensureFollowup(tx, p.id, reason, now);
}
@Injectable()
export class TeachingService {
  constructor(
    readonly commands: Commands,
    readonly clock: Clock,
    readonly entitlements: EntitlementsService,
  ) {}
  async lesson(tx: Tx, id: string) {
    return required(await tx.classSession.findUnique({ where: { id }, include: lessonInclude }));
  }
  future(l: FullLesson, now = this.clock.now()) {
    if (l.status !== 'SCHEDULED' || l.startsAt <= now || l.feedbackSubmittedAt)
      fail('SESSION_STARTED', 'Only future, active lessons can be changed.');
  }
  async log(
    tx: Tx,
    user: Actor,
    l: FullLesson,
    action: string,
    reason: string,
    key: string,
    before: unknown,
    after: unknown,
    studentId?: string,
    participantId?: string,
    targetSessionId?: string,
  ) {
    await tx.scheduleChange.create({
      data: {
        sessionId: l.id,
        actorId: user.id,
        action,
        reason,
        requestKey: key,
        before: json(before),
        after: json(after),
        studentId,
        participantId,
        targetSessionId,
      },
    });
  }
  requireMember(s: Student) {
    if (s.type !== 'MEMBER')
      fail(
        'PURCHASE_REQUIRED',
        'Record a regular credit card purchase before using regular credits.',
      );
  }
  async studentConflict(
    tx: Tx,
    studentId: string,
    l: { id?: string; startsAt: Date; endsAt: Date },
    exclude: string[] = [],
  ) {
    if (
      await tx.sessionParticipant.findFirst({
        where: {
          studentId,
          bookingStatus: 'BOOKED',
          id: { notIn: exclude },
          session: {
            id: { not: l.id },
            status: 'SCHEDULED',
            startsAt: { lt: l.endsAt },
            endsAt: { gt: l.startsAt },
          },
        },
        select: { id: true },
      })
    )
      fail('STUDENT_CONFLICT', 'The student already has a lesson at this time.');
  }
  async sessionRules(
    tx: Tx,
    data: {
      classGroupId: string;
      courseId: string;
      teacherId: string;
      startsAt: Date;
      endsAt: Date;
    },
    id?: string,
    participants: FullLesson['participants'] = [],
  ) {
    if (data.startsAt <= this.clock.now() || data.endsAt <= data.startsAt)
      bad('The lesson must start in the future and end after it starts.');
    const teacher = required(await tx.user.findUnique({ where: { id: data.teacherId } }));
    if (teacher.role !== 'TEACHER' || teacher.status !== 'ACTIVE')
      bad('Select an active teacher account.');
    required(await tx.classGroup.findUnique({ where: { id: data.classGroupId } }));
    required(await tx.course.findUnique({ where: { id: data.courseId } }));
    if (
      await tx.classSession.findFirst({
        where: {
          id: { not: id },
          status: 'SCHEDULED',
          startsAt: { lt: data.endsAt },
          endsAt: { gt: data.startsAt },
          teacherId: data.teacherId,
        },
        select: { id: true },
      })
    )
      fail('SCHEDULE_CONFLICT', 'The teacher already has a lesson at this time.');
    const booked = participants.filter((p) => p.bookingStatus === 'BOOKED');
    for (const p of booked) {
      await this.studentConflict(tx, p.studentId, { ...data, id }, [p.id]);
    }
  }
  create(user: Actor, body: D.CreateSessionDto, key?: string) {
    return this.commands.run(
      user,
      'sessions:create',
      key,
      body,
      async () => {
        admin(user);
      },
      async (tx) => {
        const data = {
          ...body,
          capacity: body.capacity ?? 1,
          startsAt: instant(body.startsAt, true),
          endsAt: instant(body.endsAt, true),
        };
        await this.sessionRules(tx, data);
        const l = await tx.classSession.create({ data, include: lessonInclude });
        await this.log(tx, user, l, 'CREATE', 'Lesson created', key!, {}, lessonDto(l));
        return { id: l.id };
      },
    );
  }
  update(user: Actor, id: string, body: D.UpdateSessionDto, key?: string) {
    return this.commands.run(
      user,
      `sessions:${id}:update`,
      key,
      body,
      async () => {
        admin(user);
      },
      async (tx) => {
        const l = await this.lesson(tx, id);
        this.future(l);
        version(l.version, body.expectedVersion);
        if (l.participants.some((p) => p.feedbackSubmittedAt !== null))
          fail('RESULT_ALREADY_SUBMITTED', 'A student evaluation has already been submitted.');
        const data = {
          classGroupId: body.classGroupId ?? l.classGroupId,
          courseId: body.courseId ?? l.courseId,
          teacherId: body.teacherId ?? l.teacherId,
          startsAt: body.startsAt ? instant(body.startsAt, true) : l.startsAt,
          endsAt: body.endsAt ? instant(body.endsAt, true) : l.endsAt,
          capacity: body.capacity ?? l.capacity,
        };
        await this.sessionRules(tx, data, id, l.participants);
        const changed = await tx.classSession.update({
          where: { id },
          data: { ...data, version: { increment: 1 } },
          include: lessonInclude,
        });
        await syncScheduledTeacherTasks(tx, changed);
        await this.log(tx, user, l, 'UPDATE', body.reason, key!, lessonDto(l), lessonDto(changed));
        return { id };
      },
    );
  }
  cancelSession(user: Actor, id: string, body: D.CancelSessionDto, key?: string) {
    return this.commands.run(
      user,
      `sessions:${id}:cancel`,
      key,
      body,
      async () => {
        admin(user);
      },
      async (tx) => {
        const l = await this.lesson(tx, id);
        this.future(l);
        version(l.version, body.expectedVersion);
        if (
          l.participants.some(
            (p) =>
              p.feedbackSubmittedAt !== null ||
              (p.bookingStatus === 'BOOKED' && p.attendance !== 'PENDING'),
          )
        )
          fail(
            'RESULT_ALREADY_SUBMITTED',
            'Attendance or a student evaluation is already recorded.',
          );
        await tx.sessionParticipant.updateMany({
          where: { sessionId: id, bookingStatus: 'BOOKED', attendance: 'PENDING' },
          data: { bookingStatus: 'CANCELLED', version: { increment: 1 } },
        });
        await tx.task.updateMany({
          where: { sessionId: id, type: 'TRIAL_FEEDBACK', status: 'OPEN' },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
        const changed = await tx.classSession.update({
          where: { id },
          data: { status: 'CANCELLED', version: { increment: 1 } },
          include: lessonInclude,
        });
        await this.log(tx, user, l, 'CANCEL', body.reason, key!, lessonDto(l), lessonDto(changed));
        return { id };
      },
    );
  }
  async eligible(
    tx: Tx,
    s: Student,
    l: FullLesson,
    kind: 'TRIAL' | 'REGULAR',
    excluded: string[] = [],
  ) {
    const now = this.clock.now();
    this.future(l, now);
    if (kind === 'REGULAR') this.requireMember(s);
    await this.studentConflict(tx, s.id, l, excluded);
    const held = excluded.length
      ? await tx.sessionParticipant.findFirst({
          where: {
            id: { in: excluded },
            studentId: s.id,
            kind,
            bookingStatus: 'BOOKED',
            attendance: 'PENDING',
            session: { status: 'SCHEDULED' },
          },
          select: { id: true },
        })
      : null;
    await this.entitlements.assertAvailable(tx, s.id, kind, 1, held?.id, now);
  }

  add(user: Actor, id: string, body: D.AddParticipantDto, key?: string) {
    return this.commands.run(
      user,
      `sessions:${id}:add`,
      key,
      body,
      async (tx) => {
        await ownedStudent(tx, user, body.studentId);
      },
      async (tx) => {
        const s = await ownedStudent(tx, user, body.studentId),
          l = await this.lesson(tx, id);
        const existing = l.participants.find((p) => p.studentId === s.id);
        if (
          existing &&
          (existing.bookingStatus !== 'CANCELLED' ||
            existing.attendance !== 'PENDING' ||
            existing.feedbackSubmittedAt ||
            existing.checkedInAt ||
            (await tx.entitlementEntry.findUnique({ where: { participantId: existing.id } })))
        )
          fail('ALREADY_BOOKED', 'This lesson already has an active or completed student record.');
        await this.bookingEligible(tx, s, l, body.kind);
        const p = existing
          ? await tx.sessionParticipant.update({
              where: { id: existing.id },
              data: { kind: body.kind, bookingStatus: 'BOOKED', version: { increment: 1 } },
            })
          : await tx.sessionParticipant.create({
              data: { sessionId: id, studentId: s.id, kind: body.kind },
            });
        await tx.classSession.update({ where: { id }, data: { version: { increment: 1 } } });
        if (s.type === 'TRIAL') {
          const task = await tx.task.findFirst({
            where: { participantId: p.id, type: 'TRIAL_FEEDBACK' },
          });
          if (task?.status === 'DONE')
            fail('RESULT_ALREADY_SUBMITTED', 'This student evaluation is already complete.');
          const data = {
            assigneeId: l.teacherId,
            availableAt: l.endsAt,
            dueAt: nextDay17(l.endsAt),
            status: 'OPEN' as const,
            completedAt: null,
          };
          if (task)
            await tx.task.update({
              where: { id: task.id },
              data: { ...data, version: { increment: 1 } },
            });
          else
            await tx.task.create({
              data: { ...data, type: 'TRIAL_FEEDBACK', sessionId: id, participantId: p.id },
            });
        }
        await this.log(
          tx,
          user,
          l,
          'ADD_STUDENT',
          'Student added',
          key!,
          {},
          {
            studentName: s.name,
            kind: body.kind,
          },
          s.id,
          p.id,
        );
        return { id: p.id };
      },
    );
  }
  async bookingEligible(tx: Tx, s: Student, l: FullLesson, kind: 'TRIAL' | 'REGULAR') {
    await this.eligible(tx, s, l, kind);
  }
  async participantOwner(tx: Tx, user: Actor, id: string) {
    const p = required(await tx.sessionParticipant.findUnique({ where: { id } }));
    await ownedStudent(tx, user, p.studentId);
    return p;
  }
  participantAction(
    user: Actor,
    id: string,
    action: 'cancel' | 'restore' | 'move',
    body: D.VersionDto | D.MoveParticipantDto,
    key?: string,
  ) {
    return this.commands.run(
      user,
      `participants:${id}:${action}`,
      key,
      body,
      async (tx) => {
        await this.participantOwner(tx, user, id);
      },
      async (tx) => {
        const p = await this.participantOwner(tx, user, id),
          l = await this.lesson(tx, p.sessionId),
          s = await ownedStudent(tx, user, p.studentId);
        this.future(l);
        version(p.version, body.expectedVersion);
        if (
          p.attendance !== 'PENDING' ||
          p.checkedInAt ||
          p.feedbackSubmittedAt ||
          (await tx.entitlementEntry.findUnique({ where: { participantId: p.id } }))
        )
          fail('RESULT_ALREADY_SUBMITTED', 'Attendance is already recorded.');
        let followupTaskId: string | undefined;
        if (action === 'restore') {
          if (p.bookingStatus !== 'CANCELLED')
            fail('ALREADY_BOOKED', 'The student is already booked.');
          await this.eligible(tx, s, l, p.kind, [p.id]);
          await tx.sessionParticipant.update({
            where: { id },
            data: { bookingStatus: 'BOOKED', attendance: 'PENDING', version: { increment: 1 } },
          });
          const source = await tx.task.findFirst({
            where: {
              type: 'TRIAL_FOLLOWUP',
              participantId: id,
              status: 'OPEN',
              purpose: 'REBOOKING',
            },
          });
          if (source) {
            await closeRebooking(tx, source.id, id, this.clock.now());
            followupTaskId = source.id;
          }
        } else {
          if (p.bookingStatus !== 'BOOKED')
            fail('BOOKING_CANCELLED', 'This booking is already cancelled.');
          if (action === 'cancel') {
            await tx.sessionParticipant.update({
              where: { id },
              data: { bookingStatus: 'CANCELLED', version: { increment: 1 } },
            });
            await tx.task.updateMany({
              where: { participantId: id, type: 'TRIAL_FEEDBACK', status: 'OPEN' },
              data: { status: 'CANCELLED', version: { increment: 1 } },
            });
          } else {
            const target = await this.lesson(tx, (body as D.MoveParticipantDto).targetSessionId);
            if (target.id === l.id || target.courseId !== l.courseId)
              fail('COURSE_MISMATCH', 'Choose a different lesson for the same subject.');
            const prior = target.participants.find((x) => x.studentId === s.id);
            if (
              prior &&
              (prior.bookingStatus === 'BOOKED' ||
                prior.attendance !== 'PENDING' ||
                prior.kind !== p.kind)
            )
              fail(
                'ALREADY_BOOKED',
                'The target lesson already has an incompatible student record.',
              );
            // Only the outgoing booking releases a held credit; the cancelled target holds none.
            await this.eligible(tx, s, target, p.kind, [p.id]);
            await tx.sessionParticipant.update({
              where: { id },
              data: { bookingStatus: 'CANCELLED', version: { increment: 1 } },
            });
            const next = prior
              ? await tx.sessionParticipant.update({
                  where: { id: prior.id },
                  data: { bookingStatus: 'BOOKED', version: { increment: 1 } },
                })
              : await tx.sessionParticipant.create({
                  data: { sessionId: target.id, studentId: s.id, kind: p.kind },
                });
            const changedTarget = await tx.classSession.update({
              where: { id: target.id },
              data: { version: { increment: 1 } },
              include: lessonInclude,
            });
            await tx.classSession.update({
              where: { id: l.id },
              data: { version: { increment: 1 } },
            });
            const followupChanges = await moveRebookingLinks(tx, id, next.id, this.clock.now());
            const before = {
              studentName: s.name,
              kind: p.kind,
              participantId: id,
              ...lessonDto(l),
            };
            const after = {
              studentName: s.name,
              kind: next.kind,
              participantId: next.id,
              ...lessonDto(changedTarget),
              followupChanges,
            };
            await this.log(
              tx,
              user,
              l,
              'MOVE_STUDENT',
              body.reason,
              key!,
              before,
              after,
              s.id,
              id,
              target.id,
            );
            await this.log(
              tx,
              user,
              target,
              'MOVE_STUDENT_IN',
              body.reason,
              key!,
              before,
              after,
              s.id,
              next.id,
              l.id,
            );
            return { id: next.id };
          }
        }
        await tx.classSession.update({ where: { id: l.id }, data: { version: { increment: 1 } } });
        await this.log(
          tx,
          user,
          l,
          action.toUpperCase() + '_BOOKING',
          body.reason,
          key!,
          { studentName: s.name, bookingStatus: p.bookingStatus, kind: p.kind },
          {
            studentName: s.name,
            bookingStatus: action === 'restore' ? 'BOOKED' : 'CANCELLED',
            kind: p.kind,
            ...(followupTaskId ? { followupTaskId } : {}),
          },
          s.id,
          id,
        );
        return { id };
      },
    );
  }
  checkIn(user: Actor, id: string, body: D.CheckInDto, key?: string): Promise<D.CheckInResultDto> {
    return this.commands.run(
      user,
      `participants:${id}:check-in`,
      key,
      body,
      async (tx) => {
        const p = required(
          await tx.sessionParticipant.findUnique({ where: { id }, include: { session: true } }),
        );
        if (user.role !== 'TEACHER' || p.session.teacherId !== user.id)
          throw new ForbiddenException('Only the assigned teacher can check in students.');
      },
      async (tx) => {
        const now = this.clock.now();
        const p = required(
          await tx.sessionParticipant.findUnique({
            where: { id },
            include: { student: true, consumption: true },
          }),
        );
        const l = await this.lesson(tx, p.sessionId);
        if (l.status !== 'SCHEDULED' || p.bookingStatus !== 'BOOKED')
          fail('BOOKING_INACTIVE', 'Only active bookings can be checked in.');
        // A new request key still acknowledges the original successful check-in.
        // Authorization runs before both receipt replay and this resource-level retry.
        const result = (
          participant: { version: number; checkedInAt: Date; checkedInBy: string },
          sessionVersion: number,
        ): D.CheckInResultDto => ({
          id,
          version: participant.version,
          sessionVersion,
          attendance: 'ATTENDED',
          checkedInAt: participant.checkedInAt.toISOString(),
          checkedInBy: participant.checkedInBy,
        });
        if (p.checkedInAt && p.checkedInBy && p.attendance === 'ATTENDED' && p.consumption)
          return result(
            { ...p, checkedInAt: p.checkedInAt, checkedInBy: p.checkedInBy },
            l.version,
          );
        if (
          p.checkedInAt ||
          p.consumption ||
          p.attendance !== 'PENDING' ||
          p.feedbackSubmittedAt ||
          l.feedbackSubmittedAt
        )
          fail(
            'RESULT_ALREADY_SUBMITTED',
            'This booking already has an attendance or teaching result.',
          );
        if (now < l.startsAt)
          fail('LESSON_NOT_STARTED', 'Check-in is available when the lesson starts.');
        version(p.version, body.expectedVersion);
        await this.entitlements.assertAvailable(tx, p.studentId, p.kind, 1, p.id, now);
        const snapshot = rosterMembership(p.student, l.startsAt);
        const updated = await tx.sessionParticipant.update({
          where: { id },
          data: {
            attendance: 'ATTENDED',
            checkedInAt: now,
            checkedInBy: user.id,
            categorySnapshot: snapshot.category,
            membershipCategorySnapshot: snapshot.membershipCategory,
            version: { increment: 1 },
          },
        });
        await tx.entitlementEntry.create({
          data: {
            studentId: p.studentId,
            participantId: id,
            bucket: p.kind,
            kind: 'CONSUMPTION',
            quantity: -1,
            actorId: user.id,
            sourceKey: `check-in:${id}`,
            createdAt: now,
          },
        });
        if (p.student.type === 'MEMBER')
          await tx.task.updateMany({
            where: { participantId: id, type: 'TRIAL_FEEDBACK', status: 'OPEN' },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          });
        const session = await tx.classSession.update({
          where: { id: l.id },
          data: { version: { increment: 1 } },
        });
        await this.log(
          tx,
          user,
          l,
          'CHECK_IN',
          'Student checked in',
          key!,
          { attendance: p.attendance, checkedInAt: p.checkedInAt },
          {
            attendance: 'ATTENDED',
            checkedInAt: now,
            checkedInBy: user.id,
            studentName: p.student.name,
          },
          p.studentId,
          id,
        );
        return result({ ...updated, checkedInAt: now, checkedInBy: user.id }, session.version);
      },
    );
  }
  feedback(user: Actor, id: string, body: D.FeedbackDto, key?: string) {
    return this.commands.run(
      user,
      `sessions:${id}:feedback`,
      key,
      body,
      async (tx) => {
        const l = await this.lesson(tx, id);
        if (user.role !== 'TEACHER' || l.teacherId !== user.id)
          throw new ForbiddenException('Only the assigned teacher can submit feedback.');
      },
      async (tx) => {
        const l = await this.lesson(tx, id);
        if (l.status !== 'SCHEDULED' || l.endsAt > this.clock.now())
          fail('LESSON_NOT_ENDED', 'Feedback is available after this lesson ends.');
        const students = body.students
          .map((p) => ({
            ...p,
            feedback: p.feedback ?? '',
            abilityNote: p.abilityNote ?? '',
            preferenceNote: p.preferenceNote ?? '',
          }))
          .sort((a, b) => a.participantId.localeCompare(b.participantId));
        const hash = digest({ summary: body.summary ?? '', students });
        if (l.feedbackSubmittedAt) {
          if (hash === l.feedbackPayloadHash) return { id };
          fail('RESULT_ALREADY_SUBMITTED', 'This lesson already has a different submitted result.');
        }
        if (l.participants.some((p) => p.checkedInAt))
          fail(
            'INDIVIDUAL_FEEDBACK_REQUIRED',
            'Checked-in students require individual evaluation.',
          );
        version(l.version, body.expectedVersion);
        const booked = l.participants.filter((p) => p.bookingStatus === 'BOOKED');
        if (
          new Set(students.map((p) => p.participantId)).size !== students.length ||
          JSON.stringify(students.map((p) => p.participantId).sort()) !==
            JSON.stringify(booked.map((p) => p.id).sort())
        )
          bad('Record attendance for every booked student exactly once.');
        for (const input of students) {
          const p = required(booked.find((p) => p.id === input.participantId));
          if (
            p.student.type === 'TRIAL' &&
            input.attendance === 'ATTENDED' &&
            !input.feedback.trim()
          )
            bad('An attended trial requires individual feedback.');
          await tx.sessionParticipant.update({
            where: { id: p.id },
            data: {
              attendance: input.attendance,
              feedback: input.feedback || null,
              abilityNote: input.abilityNote || null,
              preferenceNote: input.preferenceNote || null,
              categorySnapshot: studentCategory(p.student, l.startsAt),
              version: { increment: 1 },
            },
          });
          if (p.student.type === 'TRIAL')
            await followTask(
              tx,
              l,
              p,
              input.attendance === 'ATTENDED' ? 'TRIAL_COMPLETED' : 'NO_SHOW',
              this.clock.now(),
            );
        }
        await tx.classSession.update({
          where: { id },
          data: {
            summary: body.summary || null,
            feedbackSubmittedAt: this.clock.now(),
            feedbackPayloadHash: hash,
            version: { increment: 1 },
          },
        });
        const task = await tx.task.findFirst({ where: { sessionId: id, type: 'LESSON_FEEDBACK' } });
        if (!task) await teacherTask(tx, l);
        await tx.task.updateMany({
          where: { sessionId: id, type: 'LESSON_FEEDBACK' },
          data: { status: 'DONE', completedAt: this.clock.now(), version: { increment: 1 } },
        });
        return { id };
      },
    );
  }
}
