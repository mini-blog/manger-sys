import { BUSINESS_TIMEZONE } from '@student/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { UserDto } from '../auth/auth';
export type Actor = UserDto;
export type Tx = Prisma.TransactionClient;
export const ZONE = BUSINESS_TIMEZONE;
export function fail(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
export function bad(message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_FAILED', message });
}
export function admin(user: Actor) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Admin access required.');
}
export function owner(user: Actor, student: { ownerAdminId: string }) {
  admin(user);
  if (student.ownerAdminId !== user.id)
    throw new ForbiddenException('This student belongs to another admin.');
}
export function required<T>(value: T | null | undefined): T {
  if (value == null) throw new NotFoundException('Record not found.');
  return value;
}
export function version(actual: number, expected: number) {
  if (actual !== expected) fail('VERSION_CONFLICT', 'This record changed. Reload before saving.');
}
export function dateOnly(value: string): Date {
  const parsed = DateTime.fromISO(value, { zone: 'UTC' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !parsed.isValid || parsed.toISODate() !== value)
    bad('Enter a valid calendar date.');
  return parsed.toJSDate();
}
export function instant(value: string, rejectAmbiguous = false): Date {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) bad('Time must include its UTC offset.');
  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) bad('Enter a valid date and time.');
  const melbourne = parsed.setZone(ZONE);
  if (rejectAmbiguous && melbourne.getPossibleOffsets().length > 1)
    bad('This Melbourne time occurs twice during daylight saving. Choose another time.');
  // An explicit non-UTC offset is treated as a Melbourne wall-clock input.
  if (rejectAmbiguous && !value.endsWith('Z') && parsed.offset !== melbourne.offset)
    bad('The offset does not match Melbourne at that time.');
  return parsed.toJSDate();
}
export function nextDay17(date: Date) {
  return DateTime.fromJSDate(date, { zone: ZONE })
    .plus({ days: 1 })
    .set({ hour: 17, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}
export function category(
  kind: string,
  enrolled: Date | null,
  starts: Date,
  snapshot?: string | null,
) {
  if (snapshot) return snapshot;
  if (kind === 'TRIAL') return 'TRIAL';
  if (!enrolled) return 'EXISTING';
  const lesson = DateTime.fromJSDate(starts, { zone: ZONE }).toISODate()!;
  const first = enrolled.toISOString().slice(0, 10);
  const days = DateTime.fromISO(lesson, { zone: 'UTC' }).diff(
    DateTime.fromISO(first, { zone: 'UTC' }),
    'days',
  ).days;
  return days >= 0 && days < 7 ? 'NEW' : 'EXISTING';
}
export const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
@Injectable()
export class Clock {
  now() {
    return new Date();
  }
}
@Injectable()
export class Commands {
  constructor(private readonly db: PrismaService) {}
  async run<T>(
    user: Actor,
    operation: string,
    key: string | undefined,
    body: unknown,
    authorize: (tx: Tx) => Promise<void>,
    action: (tx: Tx) => Promise<T>,
    fingerprint?: (value: unknown) => string,
  ): Promise<T> {
    if (
      !key ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
    )
      bad('Idempotency-Key must be a UUID.');
    const requestHash = (fingerprint ?? digest)({ operation, body });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            // One short business-write lane at this scale; all mutations participate.
            // Serializable retries protect snapshots acquired while waiting for the lock.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(73192461)`;
            // Lock the actor row too: if it changed while this serializable snapshot
            // waited for the business lock, PostgreSQL aborts it and we retry fresh.
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR SHARE`;
            const actor = await tx.user.findUnique({ where: { id: user.id } });
            if (!actor || actor.status !== 'ACTIVE')
              throw new UnauthorizedException('Account is not active.');
            await authorize(tx);
            const prior = await tx.mutationReceipt.findUnique({
              where: { userId_operation_key: { userId: user.id, operation, key } },
            });
            if (prior) {
              if (prior.requestHash !== requestHash)
                fail(
                  'IDEMPOTENCY_CONFLICT',
                  'This request key was already used for different input.',
                );
              return prior.response as T;
            }
            const result = await action(tx);
            await tx.mutationReceipt.create({
              data: { userId: user.id, operation, key, requestHash, response: json(result) },
            });
            return result;
          },
          { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (['P2034', 'P2002'].includes(error.code) ||
            (error.code === 'P2010' &&
              (error.meta?.code === '40001' ||
                (error.meta?.driverAdapterError as { cause?: { kind?: string } } | undefined)?.cause
                  ?.kind === 'TransactionWriteConflict')))
        ) {
          if (attempt < 2) continue;
          fail('RETRY_CONFLICT', 'Another change was made at the same time. Please retry.');
        }
        throw error;
      }
    }
    throw new Error('Unreachable');
  }
}
