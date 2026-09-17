import { Injectable } from '@nestjs/common';
import { Actor, admin, bad, Clock, Commands, fail, required, version } from '../common/domain';
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
        if (t.type !== 'TRIAL_FOLLOWUP' || t.purpose !== 'FIRST_PURCHASE' || t.status !== 'OPEN')
          fail('TASK_CLOSED', 'Only an open follow-up can be completed.');
        if (t.availableAt > this.clock.now())
          fail('TASK_NOT_AVAILABLE', 'This follow-up is not available yet.');
        const p = required(t.participant);
        if (body.communication.taskId && body.communication.taskId !== id)
          bad('The communication references another task.');
        if (body.communication.participantId && body.communication.participantId !== p.id)
          bad('The communication references another lesson.');
        await this.students.log(
          tx,
          user,
          p.studentId,
          { ...body.communication, taskId: id, participantId: p.id },
          body.outcome,
        );
        await tx.task.update({
          where: { id },
          data: {
            status: 'DONE',
            followupOutcome: body.outcome,
            completedAt: this.clock.now(),
            version: { increment: 1 },
          },
        });
        return { id };
      },
    );
  }
}
