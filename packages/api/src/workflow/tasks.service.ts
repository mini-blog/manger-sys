import { Injectable } from '@nestjs/common';
import {
  Actor,
  admin,
  bad,
  Clock,
  Commands,
  dateOnly,
  fail,
  instant,
  required,
  version,
} from '../common/domain';
import { assignedTask } from './read.service';
import { StudentsService } from './students.service';
import * as D from './dto';
@Injectable()
export class TasksService {
  constructor(
    readonly commands: Commands,
    readonly clock: Clock,
    readonly students: StudentsService,
  ) {}
  followUp(user: Actor, id: string, body: D.FollowUpDto, key?: string) {
    admin(user);
    return this.commands.run(
      user,
      `tasks:${id}:follow-up`,
      key,
      body,
      async (tx) => {
        await assignedTask(tx, user, id);
      },
      async (tx) => {
        const t = await assignedTask(tx, user, id);
        version(t.version, body.expectedVersion);
        if (t.type !== 'TRIAL_FOLLOWUP' || t.status !== 'OPEN')
          fail('TASK_CLOSED', 'Only an open follow-up can be updated.');
        const p = required(t.participant),
          s = p.student;
        const done = ['NOT_INTERESTED', 'ENROLLED'].includes(body.outcome);
        let due = t.dueAt;
        if (!done) {
          if (!body.nextDueAt) bad('Choose the next follow-up time.');
          due = instant(body.nextDueAt);
          if (due <= this.clock.now()) bad('Next follow-up must be in the future.');
        }
        if (done && !body.closeReason?.trim()) bad('Add a reason for closing this follow-up.');
        if (body.outcome === 'ENROLLED') {
          if (!s.firstEnrolledOn && !body.firstEnrolledOn) bad('Enter the first enrolment date.');
          if (body.firstEnrolledOn) {
            const date = dateOnly(body.firstEnrolledOn);
            if (s.firstEnrolledOn && s.firstEnrolledOn.getTime() !== date.getTime())
              fail('ENROLMENT_DATE_LOCKED', 'The original enrolment date cannot be overwritten.');
            if (!s.firstEnrolledOn) {
              await this.students.validateEnrolment(tx, s.id, date);
              await tx.student.update({
                where: { id: s.id },
                data: { firstEnrolledOn: date, version: { increment: 1 } },
              });
            }
          }
        }
        if (body.communication.taskId && body.communication.taskId !== id)
          bad('The communication references another task.');
        if (body.communication.participantId && body.communication.participantId !== p.id)
          bad('The communication references another lesson.');
        await this.students.log(
          tx,
          user,
          s.id,
          {
            ...body.communication,
            taskId: id,
            participantId: p.id,
            content:
              body.communication.content + (done ? `\nClose reason: ${body.closeReason}` : ''),
          },
          body.outcome,
        );
        await tx.task.update({
          where: { id },
          data: {
            status: done ? 'DONE' : 'OPEN',
            dueAt: due,
            completedAt: done ? this.clock.now() : null,
            version: { increment: 1 },
          },
        });
        return { id };
      },
    );
  }
  reopen(user: Actor, id: string, body: D.ReopenDto, key?: string) {
    admin(user);
    return this.commands.run(
      user,
      `tasks:${id}:reopen`,
      key,
      body,
      async (tx) => {
        await assignedTask(tx, user, id);
      },
      async (tx) => {
        const t = await assignedTask(tx, user, id);
        version(t.version, body.expectedVersion);
        if (t.type !== 'TRIAL_FOLLOWUP' || t.status === 'OPEN')
          fail('TASK_STATE_CONFLICT', 'Only a closed follow-up can be reopened.');
        const p = required(t.participant);
        const due = instant(body.nextDueAt);
        if (due <= this.clock.now()) bad('Next follow-up must be in the future.');
        if (
          await tx.sessionParticipant.findFirst({
            where: {
              studentId: p.studentId,
              kind: 'TRIAL',
              bookingStatus: 'BOOKED',
              attendance: 'PENDING',
              session: { courseId: t.session.courseId, status: 'SCHEDULED' },
            },
          })
        )
          fail('TRIAL_ALREADY_RESERVED', 'There is a pending trial for this subject.');
        await tx.communicationLog.create({
          data: {
            studentId: p.studentId,
            taskId: id,
            participantId: p.id,
            guardianNameSnapshot: p.student.guardianName ?? 'Guardian',
            channel: 'INTERNAL',
            content: body.reason,
            outcome: 'REOPENED',
            occurredAt: this.clock.now(),
            createdBy: user.id,
          },
        });
        await tx.task.update({
          where: { id },
          data: {
            status: 'OPEN',
            completedAt: null,
            dueAt: due,
            availableAt: this.clock.now(),
            version: { increment: 1 },
          },
        });
        return { id };
      },
    );
  }
}
