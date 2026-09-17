import { BUSINESS_TIMEZONE } from '@student/common';
import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import {
  Actor,
  bad,
  Commands,
  Clock,
  fail,
  instant,
  owner,
  required,
  Tx,
  version,
  admin,
} from '../common/domain';
import type { Student } from '../generated/prisma/client';
import { ownedStudent, assignedTask } from './read.service';
import * as D from './dto';
import { EntitlementsService } from './entitlements.service';
export function contactReady(s: Student, channel?: string) {
  if (!s.guardianName?.trim()) bad('Add the guardian name to the student profile first.');
  if (channel === 'IN_PERSON') return;
  if (!s.guardianPhone && !s.guardianEmail && !s.guardianWechat)
    bad('Add a guardian phone, email or WeChat contact first.');
  if (channel === 'EMAIL' && !s.guardianEmail) bad('This guardian has no email address.');
  if (['PHONE', 'SMS'].includes(channel ?? '') && !s.guardianPhone)
    bad('This guardian has no phone number.');
  if (channel === 'WECHAT' && !s.guardianWechat) bad('This guardian has no WeChat contact.');
}
@Injectable()
export class StudentsService {
  constructor(
    readonly commands: Commands,
    readonly clock: Clock,
    readonly entitlements: EntitlementsService,
  ) {}
  fields(body: D.CreateStudentDto | D.UpdateStudentDto) {
    const {
      expectedVersion: _,
      giftTrialCredit: _gift,
      clearGuardianAge: _clearGuardianAge,
      clearAge: _clearAge,
      ...fields
    } = body as D.UpdateStudentDto & D.CreateStudentDto;
    if ('name' in fields && (typeof fields.name !== 'string' || !fields.name.trim()))
      bad('Student name is required.');
    if ('yearLevel' in fields && !D.years.includes(fields.yearLevel!))
      bad('Select a valid year level.');
    if (fields.guardianEmail && !isEmail(fields.guardianEmail)) bad('Enter a valid email address.');
    if (fields.guardianPhone) {
      const phone = parsePhoneNumberFromString(fields.guardianPhone, 'AU');
      if (!phone?.isValid()) bad('Enter a valid international or Australian phone number.');
      fields.guardianPhone = phone.number;
    }
    return fields;
  }
  create(user: Actor, body: D.CreateStudentDto, key?: string) {
    admin(user);
    return this.commands.run(
      user,
      'students:create:v2',
      key,
      body,
      async () => {
        admin(user);
      },
      async (tx) => {
        const data = this.fields(body);
        if (data.preferredChannel) contactReady({ ...data } as Student, data.preferredChannel);
        const s = await tx.student.create({
          data: { ...data, name: body.name, yearLevel: body.yearLevel, ownerAdminId: user.id },
        });
        // The DB creates the responsible-admin link for all insert paths; only an authenticated
        // create command can truthfully identify who recorded this student.
        await tx.studentAdminLink.update({
          where: { studentId: s.id },
          data: { createdByAdminId: user.id },
        });
        if (body.giftTrialCredit !== false)
          await this.entitlements.initialTrialGrant(
            tx,
            s.id,
            user.id,
            `initial-trial:${s.id}`,
            this.clock.now(),
          );
        return { id: s.id, name: s.name, yearLevel: s.yearLevel };
      },
    );
  }
  update(user: Actor, id: string, body: D.UpdateStudentDto, key?: string) {
    return this.commands.run(
      user,
      `students:${id}:update:v2`,
      key,
      body,
      async (tx) => {
        await ownedStudent(tx, user, id);
      },
      async (tx) => {
        const s = await ownedStudent(tx, user, id);
        version(s.version, body.expectedVersion);
        const data = this.fields(body);
        if (body.clearGuardianAge && body.guardianAge !== undefined)
          bad('Do not set and clear guardian age in the same request.');
        if (body.clearAge && body.age !== undefined)
          bad('Do not set and clear student age in the same request.');
        const merged = { ...s, ...data };
        if (merged.preferredChannel) contactReady(merged as Student, merged.preferredChannel);
        await tx.student.update({
          where: { id },
          data: {
            ...data,
            ...(body.clearGuardianAge ? { guardianAge: null } : {}),
            ...(body.clearAge ? { age: null } : {}),
            version: { increment: 1 },
          },
        });
        return { id };
      },
    );
  }
  async validateEnrolment(tx: Tx, id: string, date?: Date) {
    if (!date) return;
    const rows = await tx.sessionParticipant.findMany({
      where: {
        studentId: id,
        kind: 'REGULAR',
        bookingStatus: 'BOOKED',
        session: { status: 'SCHEDULED' },
      },
      include: { session: true },
    });
    const { DateTime } = await import('luxon');
    if (
      rows.some(
        (p) =>
          DateTime.fromJSDate(p.session.startsAt, { zone: BUSINESS_TIMEZONE }).toISODate()! <
          date.toISOString().slice(0, 10),
      )
    )
      fail('ENROLMENT_DATE_CONFLICT', 'A regular lesson is earlier than this enrolment date.');
  }
  async log(tx: Tx, user: Actor, studentId: string, body: D.CommunicationDto, outcome?: string) {
    const s = await ownedStudent(tx, user, studentId);
    contactReady(s, body.channel);
    const occurred = instant(body.occurredAt);
    if (occurred.getTime() > this.clock.now().getTime() + 60000)
      bad('Communication time cannot be in the future.');
    if (body.taskId) {
      const t = await assignedTask(tx, user, body.taskId);
      if (t.participant?.studentId !== studentId) bad('The task does not belong to this student.');
      if (body.participantId && body.participantId !== t.participantId)
        bad('The task and lesson participant do not match.');
    }
    if (body.participantId) {
      const p = required(
        await tx.sessionParticipant.findUnique({ where: { id: body.participantId } }),
      );
      if (p.studentId !== studentId) bad('The lesson participant does not belong to this student.');
    }
    return tx.communicationLog.create({
      data: {
        studentId,
        createdBy: user.id,
        guardianNameSnapshot: body.guardianNameSnapshot,
        relationshipSnapshot: body.relationshipSnapshot || null,
        channel: body.channel,
        content: body.content,
        occurredAt: occurred,
        taskId: body.taskId,
        participantId: body.participantId,
        outcome,
      },
    });
  }
  communicate(user: Actor, id: string, body: D.CommunicationDto, key?: string) {
    return this.commands.run(
      user,
      `students:${id}:communicate`,
      key,
      body,
      async (tx) => {
        await ownedStudent(tx, user, id);
      },
      async (tx) => ({ id: (await this.log(tx, user, id, body)).id }),
    );
  }
}
