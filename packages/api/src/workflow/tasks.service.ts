import { Injectable } from '@nestjs/common';
import {
  Actor,
  admin,
  bad,
  Clock,
  Commands,
  fail,
  nextDay17,
  required,
  version,
} from '../common/domain';
import { richText } from '../common/rich-text';
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
      `tasks:${id}:follow-up:v2`,
      key,
      body,
      async (tx) => {
        await assignedTask(tx, user, id);
      },
      async (tx) => {
        const t = await assignedTask(tx, user, id);
        version(t.version, body.expectedVersion);
        if (t.type !== 'TRIAL_FOLLOWUP' || t.status !== 'OPEN')
          fail('TASK_CLOSED', 'Only open purchase follow-ups can be completed.');
        const now = this.clock.now();
        if (t.availableAt > now) fail('TASK_NOT_AVAILABLE', 'This task is not available yet.');
        const p = required(t.participant);
        const c = body.communication;
        if ((c.taskId && c.taskId !== id) || (c.participantId && c.participantId !== p.id))
          bad('Communication source mismatch.');
        const purchase = await tx.entitlementEntry.findFirst({
          where: { studentId: p.studentId, bucket: 'REGULAR', kind: 'PURCHASE' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const purchased = body.outcome === 'PURCHASED';
        if (purchased && !purchase)
          fail(
            'PURCHASE_REQUIRED',
            'Record formal lesson credits before completing a purchased follow-up.',
          );
        if (!purchased && (purchase || p.student.type === 'MEMBER'))
          fail(
            'PURCHASE_STATE_CHANGED',
            'A purchase has been recorded. Refresh and select purchased.',
          );
        const reasons = c.notPurchasedReasons ?? [];
        if (purchased && (reasons.length || c.purchaseIntentRating != null))
          bad('Purchased follow-ups only accept a note.');
        if (!purchased) {
          if (!reasons.length || !richText(c.noteHtml, 2000).text)
            bad('A reason and note are required.');
          if (reasons.includes('UNREACHABLE')) {
            if (reasons.length !== 1 || c.purchaseIntentRating != null)
              bad('Unreachable cannot include an intent rating or other reasons.');
          } else if (c.purchaseIntentRating == null) bad('Purchase intent rating is required.');
        }
        await this.students.log(tx, user, p.studentId, { ...c, taskId: id, participantId: p.id });
        await tx.task.update({
          where: { id },
          data: {
            status: 'DONE',
            followupOutcome: purchased ? 'PURCHASE_RECORDED' : 'NOT_PURCHASED',
            resolvedByEntitlementEntryId: purchased ? purchase!.id : null,
            completedAt: now,
            version: { increment: 1 },
          },
        });
        let reportTaskId: string | null = null;
        if (!purchased) {
          const reportTask = await tx.task.create({
            data: {
              type: 'STUDENT_AI_REPORT',
              purpose: 'POST_TRIAL_REVIEW',
              assigneeId: user.id,
              sessionId: t.sessionId,
              participantId: p.id,
              availableAt: now,
              dueAt: nextDay17(now),
              aiReport: { create: { studentId: p.studentId, sourceFollowupTaskId: id } },
            },
          });
          reportTaskId = reportTask.id;
        }
        return { id, reportTaskId };
      },
    );
  }
}
