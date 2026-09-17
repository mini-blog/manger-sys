import { ForbiddenException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  Actor,
  admin,
  bad,
  category,
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
  ZONE,
} from '../common/domain';
import { lessonDto, lessonInclude, FullLesson, ownedStudent } from './read.service';
import { contactReady } from './students.service';
import * as D from './dto';
import type { Student } from '../generated/prisma/client';
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
export async function followTask(
  tx: Tx,
  l: FullLesson,
  p: FullLesson['participants'][number],
  reason: string,
  now: Date,
) {
  const existing = await tx.task.findFirst({
    where: { type: 'TRIAL_FOLLOWUP', participantId: p.id },
  });
  const data = {
    assigneeId: p.student.ownerAdminId,
    sessionId: l.id,
    participantId: p.id,
    status: 'OPEN' as const,
    reason,
    sourceSnapshot: json(lessonDto(l)),
    availableAt: now,
    dueAt: nextDay17(reason === 'CANCELLED' ? now : l.endsAt),
    completedAt: null,
  };
  return existing
    ? tx.task.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    : tx.task.create({ data: { ...data, type: 'TRIAL_FOLLOWUP' } });
}
export async function closeOldFollowups(tx: Tx, studentId: string, courseId: string, now: Date) {
  await tx.task.updateMany({
    where: {
      type: 'TRIAL_FOLLOWUP',
      status: 'OPEN',
      participant: { studentId, session: { courseId } },
    },
    data: { status: 'DONE', reason: 'REBOOKED', completedAt: now, version: { increment: 1 } },
  });
}
@Injectable()
export class TeachingService {
  constructor(
    readonly commands: Commands,
    readonly clock: Clock,
  ) {}
  async lesson(tx: Tx, id: string) {
    return required(await tx.classSession.findUnique({ where: { id }, include: lessonInclude }));
  }
  future(l: FullLesson) {
    if (l.status !== 'SCHEDULED' || l.startsAt <= this.clock.now() || l.feedbackSubmittedAt)
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
  async enrolment(s: Student, l: { startsAt: Date }) {
    if (!s.firstEnrolledOn)
      fail('ENROLMENT_REQUIRED', 'Set the formal enrolment date before adding a regular student.');
    if (
      DateTime.fromJSDate(l.startsAt, { zone: ZONE }).toISODate()! <
      s.firstEnrolledOn.toISOString().slice(0, 10)
    )
      fail('ENROLMENT_DATE_CONFLICT', 'This lesson is before the enrolment date.');
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
      capacity: number;
    },
    id?: string,
    participants: FullLesson['participants'] = [],
  ) {
    if (data.startsAt <= this.clock.now() || data.endsAt <= data.startsAt)
      bad('The lesson must start in the future and end after it starts.');
    const teacher = required(await tx.user.findUnique({ where: { id: data.teacherId } }));
    if (teacher.role !== 'TEACHER') bad('Select a teacher account.');
    required(await tx.classGroup.findUnique({ where: { id: data.classGroupId } }));
    required(await tx.course.findUnique({ where: { id: data.courseId } }));
    if (
      await tx.classSession.findFirst({
        where: {
          id: { not: id },
          status: 'SCHEDULED',
          startsAt: { lt: data.endsAt },
          endsAt: { gt: data.startsAt },
          OR: [{ teacherId: data.teacherId }, { classGroupId: data.classGroupId }],
        },
        select: { id: true },
      })
    )
      fail('SCHEDULE_CONFLICT', 'The teacher or class already has a lesson at this time.');
    const booked = participants.filter((p) => p.bookingStatus === 'BOOKED');
    if (booked.length > data.capacity)
      fail('SESSION_FULL', 'Capacity cannot be lower than the number of students.');
    for (const p of booked) {
      await this.studentConflict(tx, p.studentId, { ...data, id }, [p.id]);
      if (p.kind === 'REGULAR') await this.enrolment(p.student, data);
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
          startsAt: instant(body.startsAt, true),
          endsAt: instant(body.endsAt, true),
        };
        await this.sessionRules(tx, data);
        const l = await tx.classSession.create({ data, include: lessonInclude });
        await teacherTask(tx, l);
        await this.log(tx, user, l, 'CREATE', 'Lesson created', key!, {}, lessonDto(l));
        return { id: l.id };
      },
    );
  }
  confirm(l: FullLesson, ids: string[]) {
    const actual = l.participants
      .filter((p) => p.bookingStatus === 'BOOKED')
      .map((p) => p.id)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify([...ids].sort()))
      fail('ROSTER_CHANGED', 'The class list changed. Review the affected students again.');
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
        this.confirm(l, body.confirmedAffectedParticipantIds);
        if (
          l.participants.length &&
          ((body.courseId && body.courseId !== l.courseId) ||
            (body.classGroupId && body.classGroupId !== l.classGroupId))
        )
          fail(
            'SUBJECT_LOCKED',
            'A lesson with participant history cannot change subject or class.',
          );
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
        await teacherTask(tx, changed);
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
        this.confirm(l, body.confirmedAffectedParticipantIds);
        for (const p of l.participants.filter((p) => p.bookingStatus === 'BOOKED')) {
          await tx.sessionParticipant.update({
            where: { id: p.id },
            data: { bookingStatus: 'CANCELLED', version: { increment: 1 } },
          });
          if (p.kind === 'TRIAL') await followTask(tx, l, p, 'CANCELLED', this.clock.now());
        }
        const changed = await tx.classSession.update({
          where: { id },
          data: { status: 'CANCELLED', version: { increment: 1 } },
          include: lessonInclude,
        });
        await teacherTask(tx, changed);
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
    this.future(l);
    if (
      l.participants.filter((p) => p.bookingStatus === 'BOOKED' && !excluded.includes(p.id))
        .length >= l.capacity
    )
      fail('SESSION_FULL', 'This lesson is full.');
    if (kind === 'TRIAL') {
      contactReady(s, s.preferredChannel ?? undefined);
      const rows = await tx.sessionParticipant.findMany({
        where: {
          studentId: s.id,
          kind: 'TRIAL',
          bookingStatus: 'BOOKED',
          id: { notIn: excluded },
          session: { courseId: l.courseId, status: 'SCHEDULED' },
        },
      });
      if (rows.some((p) => p.attendance === 'ATTENDED'))
        fail('TRIAL_EXHAUSTED', 'The student has already attended a trial for this subject.');
      if (rows.some((p) => p.attendance === 'PENDING'))
        fail(
          'TRIAL_ALREADY_RESERVED',
          'This student has another trial awaiting attendance or feedback.',
        );
    } else await this.enrolment(s, l);
    await this.studentConflict(tx, s.id, l, excluded);
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
        if (existing)
          fail(
            'ALREADY_BOOKED',
            existing.bookingStatus === 'CANCELLED'
              ? 'Restore the cancelled booking instead.'
              : 'The student is already in this lesson.',
          );
        await this.eligible(tx, s, l, body.kind);
        const p = await tx.sessionParticipant.create({
          data: { sessionId: id, studentId: s.id, kind: body.kind },
        });
        await tx.classSession.update({ where: { id }, data: { version: { increment: 1 } } });
        if (body.kind === 'TRIAL') await closeOldFollowups(tx, s.id, l.courseId, this.clock.now());
        await this.log(
          tx,
          user,
          l,
          'ADD_STUDENT',
          'Student added',
          key!,
          {},
          { studentName: s.name, kind: body.kind },
          s.id,
          p.id,
        );
        return { id: p.id };
      },
    );
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
        if (p.attendance !== 'PENDING')
          fail('RESULT_ALREADY_SUBMITTED', 'Attendance is already recorded.');
        if (action === 'restore') {
          if (p.bookingStatus !== 'CANCELLED')
            fail('ALREADY_BOOKED', 'The student is already booked.');
          await this.eligible(tx, s, l, p.kind, [p.id]);
          await tx.sessionParticipant.update({
            where: { id },
            data: { bookingStatus: 'BOOKED', version: { increment: 1 } },
          });
          if (p.kind === 'TRIAL') await closeOldFollowups(tx, s.id, l.courseId, this.clock.now());
        } else {
          if (p.bookingStatus !== 'BOOKED')
            fail('BOOKING_CANCELLED', 'This booking is already cancelled.');
          if (action === 'cancel') {
            await tx.sessionParticipant.update({
              where: { id },
              data: { bookingStatus: 'CANCELLED', version: { increment: 1 } },
            });
            if (p.kind === 'TRIAL')
              await followTask(
                tx,
                l,
                required(l.participants.find((x) => x.id === id)),
                'CANCELLED',
                this.clock.now(),
              );
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
            await this.eligible(tx, s, target, p.kind, [p.id, ...(prior ? [prior.id] : [])]);
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
            await tx.classSession.update({
              where: { id: target.id },
              data: { version: { increment: 1 } },
            });
            if (p.kind === 'TRIAL') await closeOldFollowups(tx, s.id, l.courseId, this.clock.now());
            await this.log(
              tx,
              user,
              l,
              'MOVE_STUDENT',
              body.reason,
              key!,
              { studentName: s.name, ...lessonDto(l) },
              { studentName: s.name, ...lessonDto(target) },
              s.id,
              id,
              target.id,
            );
            await tx.classSession.update({
              where: { id: l.id },
              data: { version: { increment: 1 } },
            });
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
          { studentName: s.name, bookingStatus: p.bookingStatus },
          { studentName: s.name, bookingStatus: action === 'restore' ? 'BOOKED' : 'CANCELLED' },
          s.id,
          id,
        );
        return { id };
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
          if (p.kind === 'TRIAL' && input.attendance === 'ATTENDED' && !input.feedback.trim())
            bad('An attended trial requires individual feedback.');
          if (
            p.kind === 'TRIAL' &&
            input.attendance === 'ATTENDED' &&
            (await tx.sessionParticipant.findFirst({
              where: {
                id: { not: p.id },
                studentId: p.studentId,
                kind: 'TRIAL',
                attendance: 'ATTENDED',
                bookingStatus: 'BOOKED',
                session: { courseId: l.courseId, status: 'SCHEDULED' },
              },
            }))
          )
            fail('TRIAL_EXHAUSTED', 'This trial has already been used.');
          await tx.sessionParticipant.update({
            where: { id: p.id },
            data: {
              attendance: input.attendance,
              feedback: input.feedback || null,
              abilityNote: input.abilityNote || null,
              preferenceNote: input.preferenceNote || null,
              categorySnapshot: category(p.kind, p.student.firstEnrolledOn, l.startsAt),
              version: { increment: 1 },
            },
          });
          if (p.kind === 'TRIAL')
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
