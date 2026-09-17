import { Injectable } from '@nestjs/common';
import type { EntitlementBalances, EntitlementBucket, PackageSnapshot } from '@student/common';
import {
  admin,
  bad,
  Clock,
  Commands,
  fail,
  json,
  required,
  type Actor,
  type Tx,
} from '../common/domain';
import { PrismaService } from '../prisma.service';
import { closeFirstPurchase } from './followup-policy';
import { ownedStudent } from './read.service';
import { membership } from './membership';
import type { Prisma } from '../generated/prisma/client';
import type { PageQuery } from './dto';
import * as D from './entitlements.dto';

interface GrantInput {
  studentId: string;
  quantity: number;
  actorId: string;
  sourceKey: string;
  now: Date;
  note?: string;
}
function quantity(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 10000)
    bad('Quantity must be an integer from 1 to 10000.');
}
@Injectable()
export class EntitlementsService {
  constructor(
    readonly db: PrismaService,
    readonly commands: Commands,
    readonly clock: Clock,
  ) {}

  async getBalances(tx: Tx, studentId: string): Promise<EntitlementBalances> {
    const entries = await tx.entitlementEntry.groupBy({
      by: ['bucket'],
      where: { studentId },
      _sum: { quantity: true },
    });
    const bookings = await tx.sessionParticipant.groupBy({
      by: ['kind'],
      where: {
        studentId,
        bookingStatus: 'BOOKED',
        attendance: 'PENDING',
        session: { status: 'SCHEDULED' },
      },
      _count: true,
    });
    const balances = {} as EntitlementBalances;
    for (const bucket of ['TRIAL', 'REGULAR'] as const) {
      const remaining = entries.find((e) => e.bucket === bucket)?._sum.quantity ?? 0;
      const reserved = bookings.find((b) => b.kind === bucket)?._count ?? 0;
      if (remaining < reserved)
        fail('ENTITLEMENT_DATA_INVALID', 'Credit history and reservations need reconciliation.');
      balances[bucket] = { remaining, reserved, available: remaining - reserved };
    }
    return balances;
  }
  async assertAvailable(
    tx: Tx,
    studentId: string,
    bucket: EntitlementBucket,
    requiredUnits = 1,
    excludedParticipantId?: string,
  ) {
    quantity(requiredUnits);
    const balances = await this.getBalances(tx, studentId);
    let excluded = 0;
    if (excludedParticipantId) {
      const p = required(
        await tx.sessionParticipant.findUnique({
          where: { id: excludedParticipantId },
          include: { session: true },
        }),
      );
      if (
        p.studentId !== studentId ||
        p.kind !== bucket ||
        p.bookingStatus !== 'BOOKED' ||
        p.attendance !== 'PENDING' ||
        p.session.status !== 'SCHEDULED'
      )
        bad('Only this student’s active reservation in this pool can be excluded.');
      excluded = 1;
    }
    if (balances[bucket].available + excluded < requiredUnits)
      fail('ENTITLEMENT_INSUFFICIENT', 'Insufficient available lesson credits.');
  }
  initialTrialGrant(tx: Tx, studentId: string, actorId: string, sourceKey: string, now: Date) {
    return tx.entitlementEntry.create({
      data: {
        studentId,
        actorId,
        sourceKey,
        createdAt: now,
        bucket: 'TRIAL',
        kind: 'INITIAL_TRIAL',
        quantity: 1,
      },
    });
  }
  grantTrial(
    tx: Tx,
    studentId: string,
    units: number,
    note: string | undefined,
    actorId: string,
    sourceKey: string,
    now: Date,
  ) {
    quantity(units);
    return tx.entitlementEntry.create({
      data: {
        studentId,
        actorId,
        sourceKey,
        createdAt: now,
        note,
        bucket: 'TRIAL',
        kind: 'TRIAL_GRANT',
        quantity: units,
      },
    });
  }
  grantPurchase(tx: Tx, input: GrantInput) {
    return this.purchase(tx, input);
  }
  async grantPackagePurchase(
    tx: Tx,
    input: Omit<GrantInput, 'quantity'> & { packageId: string; expectedPackageVersion: number },
  ) {
    const p = required(await tx.lessonPackage.findUnique({ where: { id: input.packageId } }));
    if (!p.active) fail('PACKAGE_INACTIVE', 'This package is no longer available.');
    if (p.version !== input.expectedPackageVersion)
      fail('PACKAGE_VERSION_CONFLICT', 'The package changed. Review it before saving.');
    const snapshot: PackageSnapshot = {
      name: p.name,
      quantity: p.quantity,
      priceAudCents: p.priceAudCents,
      currency: 'AUD',
      version: p.version,
    };
    return this.purchase(tx, { ...input, quantity: p.quantity }, { id: p.id, snapshot });
  }
  private async purchase(
    tx: Tx,
    input: GrantInput,
    pack?: { id: string; snapshot: PackageSnapshot },
  ) {
    quantity(input.quantity);
    const entry = await tx.entitlementEntry.create({
      data: {
        studentId: input.studentId,
        quantity: input.quantity,
        actorId: input.actorId,
        note: input.note,
        sourceKey: input.sourceKey,
        createdAt: input.now,
        bucket: 'REGULAR',
        kind: 'PURCHASE',
        ...(pack ? { packageId: pack.id, packageSnapshot: json(pack.snapshot) } : {}),
      },
    });
    await tx.student.updateMany({
      where: { id: input.studentId, firstPurchasedAt: null },
      data: {
        firstPurchasedAt: input.now,
        version: { increment: 1 },
      },
    });
    const closedTaskIds = await closeFirstPurchase(tx, input.studentId, entry.id, input.now);
    return { entry, closedTaskIds };
  }
  private async entryDto(tx: Tx, id: string): Promise<D.EntryDto> {
    const e = required(
      await tx.entitlementEntry.findUnique({
        where: { id },
        include: {
          actor: { select: { id: true, name: true } },
          participant: { select: { sessionId: true } },
        },
      }),
    );
    return {
      id: e.id,
      studentId: e.studentId,
      bucket: e.bucket,
      kind: e.kind,
      quantity: e.quantity,
      createdAt: e.createdAt.toISOString(),
      actor: e.actor,
      note: e.note,
      participantId: e.participantId,
      sessionId: e.participant?.sessionId ?? null,
      packageId: e.packageId,
      packageSnapshot: e.packageSnapshot as unknown as D.PackageSnapshotDto | null,
    };
  }
  grant(user: Actor, body: D.GrantBody, key?: string) {
    admin(user);
    return this.commands.run(
      user,
      'entitlements:grants:v1',
      key,
      body,
      async (tx) => {
        await ownedStudent(tx, user, body.studentId);
      },
      async (tx) => {
        const now = this.clock.now();
        const input = {
          studentId: body.studentId,
          actorId: user.id,
          note: body.note,
          sourceKey: `grant:${user.id}:${key}`,
          now,
        };
        const result =
          body.bucket === 'TRIAL'
            ? {
                entry: await this.grantTrial(
                  tx,
                  body.studentId,
                  body.quantity,
                  body.note,
                  user.id,
                  input.sourceKey,
                  now,
                ),
                closedTaskIds: [] as string[],
              }
            : body.mode === 'CUSTOM'
              ? await this.grantPurchase(tx, { ...input, quantity: body.quantity })
              : await this.grantPackagePurchase(tx, {
                  ...input,
                  packageId: body.packageId,
                  expectedPackageVersion: body.expectedPackageVersion,
                });
        const student = required(await tx.student.findUnique({ where: { id: body.studentId } }));
        return {
          entry: await this.entryDto(tx, result.entry.id),
          balances: await this.getBalances(tx, student.id),
          membershipCategory: membership(student.firstPurchasedAt, now).membershipCategory,
          firstPurchasedAt: student.firstPurchasedAt?.toISOString() ?? null,
          closedTaskIds: result.closedTaskIds,
        };
      },
    );
  }
  packages(user: Actor, q: PageQuery) {
    admin(user);
    return this.db.$transaction(
      async (tx) => {
        const where = {
          active: true,
          ...(q.q ? { name: { contains: q.q, mode: 'insensitive' as const } } : {}),
        };
        const items = await tx.lessonPackage.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          select: { id: true, name: true, quantity: true, priceAudCents: true, version: true },
        });
        return {
          items: items.map((p) => ({ ...p, currency: 'AUD' as const })),
          total: await tx.lessonPackage.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async summary(
    tx: Tx,
    user: Actor,
    id: string,
    now: Date,
  ): Promise<D.EntitlementSummaryDto> {
    const s = await ownedStudent(tx, user, id);
    return {
      studentId: s.id,
      name: s.name,
      yearLevel: s.yearLevel,
      balances: await this.getBalances(tx, s.id),
      ...membership(s.firstPurchasedAt, now),
      firstPurchasedAt: s.firstPurchasedAt?.toISOString() ?? null,
    };
  }
  studentSummary(user: Actor, id: string) {
    admin(user);
    return this.db.$transaction((tx) => this.summary(tx, user, id, this.clock.now()), {
      isolationLevel: 'RepeatableRead',
    });
  }
  list(user: Actor, q: D.EntitlementQuery) {
    admin(user);
    return this.db.$transaction(
      async (tx) => {
        if (q.studentId) await ownedStudent(tx, user, q.studentId);
        const now = this.clock.now();
        const where: Prisma.StudentWhereInput = {
          ownerAdminId: user.id,
          ...(q.studentId ? { id: q.studentId } : {}),
          ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
        };
        const students = await tx.student.findMany({
          where,
          select: { id: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        const items = [];
        for (const s of students) items.push(await this.summary(tx, user, s.id, now));
        return {
          items,
          total: await tx.student.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
  ledger(user: Actor, id: string, q: D.LedgerQuery) {
    admin(user);
    return this.db.$transaction(
      async (tx) => {
        await ownedStudent(tx, user, id);
        const where = { studentId: id, ...(q.bucket ? { bucket: q.bucket } : {}) };
        const rows = await tx.entitlementEntry.findMany({
          where,
          select: { id: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        const items = [];
        for (const row of rows) items.push(await this.entryDto(tx, row.id));
        return {
          items,
          total: await tx.entitlementEntry.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
}
