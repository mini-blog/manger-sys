import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  Actor,
  bad,
  canonical,
  Clock,
  Commands,
  fail,
  json,
  required,
  Tx,
  version,
} from '../common/domain';
import { PrismaService } from '../prisma.service';
import { Prisma, User } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';
import * as D from './dto';

export const accountDto = (u: User): D.AccountDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  isSuperAdmin: u.isSuperAdmin,
  version: u.version,
  disabledAt: u.disabledAt?.toISOString() ?? null,
});
export async function accountAdmin(tx: Tx, user: Actor) {
  const current = await tx.user.findUnique({ where: { id: user.id } });
  if (!current || current.status !== 'ACTIVE' || current.role !== 'ADMIN' || !current.isSuperAdmin)
    throw new ForbiddenException('Super administrator access required.');
}
export function credentialFingerprint(value: unknown) {
  const secret = process.env.ACCOUNT_COMMAND_HASH_SECRET;
  if (!secret || secret.length < 32)
    throw new ServiceUnavailableException('Account credential commands are not configured.');
  return createHmac('sha256', secret).update(canonical(value)).digest('hex');
}
@Injectable()
export class AccountsService {
  constructor(
    readonly db: PrismaService,
    readonly commands: Commands,
    readonly clock: Clock,
  ) {}
  async list(user: Actor, q: D.AccountQuery) {
    return this.db.$transaction(
      async (tx) => {
        await accountAdmin(tx, user);
        const where: Prisma.UserWhereInput = {
          role: q.role,
          status: q.status,
          ...(q.q
            ? {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' } },
                  { email: { contains: q.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        };
        const items = await tx.user.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        return {
          items: items.map(accountDto),
          total: await tx.user.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(user: Actor, id: string) {
    await accountAdmin(this.db, user);
    return accountDto(required(await this.db.user.findUnique({ where: { id } })));
  }
  async impactIn(tx: Tx, user: Actor, target: User): Promise<D.DeactivationImpactDto> {
    const ownedStudentCount = await tx.student.count({ where: { ownerAdminId: target.id } });
    const openFollowupCount = await tx.task.count({
      where: {
        assigneeId: target.id,
        type: { in: ['TRIAL_FOLLOWUP', 'STUDENT_AI_REPORT'] },
        status: 'OPEN',
      },
    });
    const now = this.clock.now();
    const blocking =
      target.role === 'TEACHER'
        ? await tx.classSession.findMany({
            where: {
              teacherId: target.id,
              status: 'SCHEDULED',
              OR: [
                { endsAt: { gt: now } },
                {
                  tasks: {
                    some: {
                      status: 'OPEN',
                      OR: [
                        {
                          type: 'TRIAL_FEEDBACK',
                          participant: { bookingStatus: 'BOOKED', checkedInAt: { not: null } },
                        },
                      ],
                    },
                  },
                },
              ],
            },
            include: { classGroup: true, course: true },
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          })
        : [];
    const eligible =
      target.role === 'ADMIN' && ownedStudentCount > 0
        ? await tx.user.findMany({
            where: { role: 'ADMIN', status: 'ACTIVE', id: { not: target.id } },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
          })
        : [];
    const blockedReason = target.isSuperAdmin
      ? 'The super administrator is protected.'
      : target.id === user.id
        ? 'You cannot deactivate your own account.'
        : target.status !== 'ACTIVE'
          ? 'This account is already inactive.'
          : blocking.length
            ? 'Reassign upcoming lessons and finish outstanding evaluations first.'
            : ownedStudentCount && !eligible.length
              ? 'An active administrator is required for the handover.'
              : null;
    return {
      expectedVersion: target.version,
      ownedStudentCount,
      openFollowupCount,
      blockingSessions: blocking.map((l) => ({
        id: l.id,
        className: l.classGroup.name,
        courseName: l.course.name,
        startsAt: l.startsAt.toISOString(),
      })),
      eligibleSuccessors: eligible.map(accountDto),
      canDeactivate: !blockedReason,
      blockedReason,
    };
  }
  async impact(user: Actor, id: string) {
    return this.db.$transaction(
      async (tx) => {
        await accountAdmin(tx, user);
        return this.impactIn(tx, user, required(await tx.user.findUnique({ where: { id } })));
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async editable(tx: Tx, id: string, expected: number) {
    const target = required(await tx.user.findUnique({ where: { id } }));
    if (target.isSuperAdmin) throw new ForbiddenException('The super administrator is protected.');
    if (target.status !== 'ACTIVE') fail('ACCOUNT_DISABLED', 'This account is inactive.');
    version(target.version, expected);
    return target;
  }
  async uniqueEmail(tx: Tx, email: string, except?: string) {
    if (
      await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, id: { not: except } },
      })
    )
      fail('EMAIL_IN_USE', 'This email is already in use.');
  }
  async audit(
    tx: Tx,
    actorId: string,
    targetUserId: string,
    action: string,
    requestKey: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    await tx.accountAudit.create({
      data: {
        actorId,
        targetUserId,
        action,
        requestKey,
        before: json(before),
        after: json(after),
        reason,
      },
    });
  }
  async create(user: Actor, body: D.CreateAccountDto, key?: string) {
    await accountAdmin(this.db, user);
    return this.commands.run(
      user,
      'accounts:create',
      key,
      body,
      (tx) => accountAdmin(tx, user),
      async (tx) => {
        await this.uniqueEmail(tx, body.email);
        const created = await tx.user.create({
          data: {
            name: body.name,
            email: body.email,
            role: body.role,
            passwordHash: await hashPassword(body.password),
          },
        });
        await this.audit(tx, user.id, created.id, 'CREATE', key!, {}, accountDto(created));
        return { id: created.id, version: created.version };
      },
      credentialFingerprint,
    );
  }
  update(user: Actor, id: string, body: D.UpdateAccountDto, key?: string) {
    return this.commands.run(
      user,
      `accounts:${id}:update`,
      key,
      body,
      (tx) => accountAdmin(tx, user),
      async (tx) => {
        const before = await this.editable(tx, id, body.expectedVersion);
        if (body.name === undefined && body.email === undefined)
          bad('Enter a name or email to update.');
        if (body.email) await this.uniqueEmail(tx, body.email, id);
        const after = await tx.user.update({
          where: { id },
          data: { name: body.name, email: body.email, version: { increment: 1 } },
        });
        if (body.email && body.email !== before.email)
          await tx.authSession.deleteMany({ where: { userId: id } });
        await this.audit(tx, user.id, id, 'UPDATE', key!, accountDto(before), accountDto(after));
        return { id, version: after.version };
      },
    );
  }
  async reset(user: Actor, id: string, body: D.ResetPasswordDto, key?: string) {
    await accountAdmin(this.db, user);
    return this.commands.run(
      user,
      `accounts:${id}:reset-password`,
      key,
      body,
      (tx) => accountAdmin(tx, user),
      async (tx) => {
        const before = await this.editable(tx, id, body.expectedVersion);
        const after = await tx.user.update({
          where: { id },
          data: { passwordHash: await hashPassword(body.password), version: { increment: 1 } },
        });
        await tx.authSession.deleteMany({ where: { userId: id } });
        await this.audit(
          tx,
          user.id,
          id,
          'PASSWORD_RESET',
          key!,
          { version: before.version },
          { version: after.version },
        );
        return { id, version: after.version };
      },
      credentialFingerprint,
    );
  }
  deactivate(user: Actor, id: string, body: D.DeactivateAccountDto, key?: string) {
    return this.commands.run(
      user,
      `accounts:${id}:deactivate`,
      key,
      body,
      (tx) => accountAdmin(tx, user),
      async (tx) => {
        const before = await this.editable(tx, id, body.expectedVersion);
        const impact = await this.impactIn(tx, user, before);
        if (!impact.canDeactivate) fail('ACCOUNT_HAS_ACTIVE_WORK', impact.blockedReason!);
        let transferredStudentCount = 0,
          transferredTaskCount = 0;
        if (before.role === 'ADMIN') {
          if (impact.ownedStudentCount) {
            if (!body.successorAdminId || body.successorAdminId === id)
              bad('Select an active administrator for the handover.');
            const successor = required(
              await tx.user.findUnique({ where: { id: body.successorAdminId } }),
            );
            if (successor.role !== 'ADMIN' || successor.status !== 'ACTIVE')
              fail('INVALID_SUCCESSOR', 'Select an active administrator.');
            const inconsistent = await tx.task.count({
              where: {
                type: { in: ['TRIAL_FOLLOWUP', 'STUDENT_AI_REPORT'] },
                status: 'OPEN',
                OR: [
                  { assigneeId: id, participant: { student: { ownerAdminId: { not: id } } } },
                  { assigneeId: id, participantId: null },
                  { assigneeId: { not: id }, participant: { student: { ownerAdminId: id } } },
                ],
              },
            });
            if (inconsistent)
              fail('HANDOVER_CONFLICT', 'Follow-up ownership must be corrected before handover.');
            transferredTaskCount = (
              await tx.task.updateMany({
                where: {
                  type: { in: ['TRIAL_FOLLOWUP', 'STUDENT_AI_REPORT'] },
                  status: 'OPEN',
                  assigneeId: id,
                },
                data: { assigneeId: successor.id, version: { increment: 1 } },
              })
            ).count;
            transferredStudentCount = (
              await tx.student.updateMany({
                where: { ownerAdminId: id },
                data: { ownerAdminId: successor.id, version: { increment: 1 } },
              })
            ).count;
          } else if (body.successorAdminId || impact.openFollowupCount)
            bad('This account has no students to transfer.');
        } else {
          if (body.successorAdminId) bad('A teacher cannot transfer students to an administrator.');
          // Expired, un-attended hidden evaluations require no teaching action.
          await tx.task.updateMany({
            where: {
              assigneeId: id,
              type: 'TRIAL_FEEDBACK',
              status: 'OPEN',
            },
            data: { status: 'CANCELLED', version: { increment: 1 } },
          });
        }
        const after = await tx.user.update({
          where: { id },
          data: { status: 'DISABLED', disabledAt: this.clock.now(), version: { increment: 1 } },
        });
        await tx.authSession.deleteMany({ where: { userId: id } });
        await this.audit(
          tx,
          user.id,
          id,
          'DEACTIVATE',
          key!,
          accountDto(before),
          {
            ...accountDto(after),
            successorAdminId: body.successorAdminId,
            transferredStudentCount,
            transferredTaskCount,
          },
          body.reason,
        );
        return {
          id,
          version: after.version,
          status: after.status,
          transferredStudentCount,
          transferredTaskCount,
        };
      },
    );
  }
}
