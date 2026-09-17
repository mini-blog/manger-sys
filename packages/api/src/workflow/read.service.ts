import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/prisma/client';
import { Actor, admin, bad, Clock, owner, required, Tx } from '../common/domain';
import * as D from './dto';
import { weekBounds } from '../schedule/time';
import { membership, membershipBounds, rosterMembership, studentCategory } from './membership';
import { MEMBERSHIP_CATEGORIES, type MembershipCategory } from '@student/common';
export const lessonInclude = {
  classGroup: true,
  course: true,
  teacher: { select: { id: true, name: true } },
  participants: { include: { student: true } },
} satisfies Prisma.ClassSessionInclude;
export type FullLesson = Prisma.ClassSessionGetPayload<{ include: typeof lessonInclude }>;
export const taskInclude = {
  session: { include: lessonInclude },
  participant: { include: { student: true } },
} satisfies Prisma.TaskInclude;
export type FullTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
export function lessonDto(l: FullLesson): D.LessonDto {
  const booked = l.participants.filter((p) => p.bookingStatus === 'BOOKED');
  return {
    id: l.id,
    className: l.classGroup.name,
    classGroupId: l.classGroupId,
    targetLevel: l.classGroup.targetLevel,
    courseId: l.courseId,
    courseName: l.course.name,
    teacherName: l.teacher.name,
    teacherId: l.teacherId,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt.toISOString(),
    capacity: l.capacity,
    participantCount: booked.length,
    trialCount: booked.filter((p) => p.student.type === 'TRIAL').length,
    newCount: booked.filter((p) => studentCategory(p.student, l.startsAt) === 'NEW').length,
    status: l.status,
    version: l.version,
    feedbackSubmittedAt: l.feedbackSubmittedAt?.toISOString() ?? null,
    summary: l.summary,
  };
}
export function participantDto(
  p: FullLesson['participants'][number],
  l: FullLesson,
  u: Actor,
): D.ParticipantDto {
  const visible = u.role === 'TEACHER' ? l.teacherId === u.id : p.student.ownerAdminId === u.id;
  return {
    id: p.student.id,
    name: p.student.name,
    yearLevel: p.student.yearLevel,
    participantId: p.id,
    kind: p.kind,
    type: p.student.type,
    ...rosterMembership(p.student, l.startsAt),
    bookingStatus: p.bookingStatus,
    attendance: p.attendance,
    version: p.version,
    canManage: u.role === 'ADMIN' && p.student.ownerAdminId === u.id,
    feedback: visible ? p.feedback : null,
    abilityNote: visible ? p.abilityNote : null,
    preferenceNote: visible ? p.preferenceNote : null,
  };
}
export function taskDto(t: FullTask): D.TaskDto {
  const current = lessonDto(t.session);
  const s = (t.sourceSnapshot ?? {}) as Record<string, string>;
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    version: t.version,
    sessionId: t.sessionId,
    participantId: t.participantId,
    reason: t.reason,
    availableAt: t.availableAt.toISOString(),
    dueAt: t.dueAt.toISOString(),
    className: s.className ?? current.className,
    courseName: s.courseName ?? current.courseName,
    teacherName: s.teacherName ?? current.teacherName,
    startsAt: s.startsAt ?? current.startsAt,
    endsAt: s.endsAt ?? current.endsAt,
    studentId: t.participant?.studentId ?? null,
    studentName: t.participant?.student.name ?? null,
  };
}
export async function ownedStudent(tx: Tx, user: Actor, id: string) {
  const s = required(await tx.student.findUnique({ where: { id } }));
  owner(user, s);
  return s;
}
export async function assignedTask(tx: Tx, user: Actor, id: string) {
  const t = required(await tx.task.findUnique({ where: { id }, include: taskInclude }));
  if (t.assigneeId !== user.id)
    throw new ForbiddenException('This task is assigned to another user.');
  if (t.type === 'TRIAL_FOLLOWUP') owner(user, required(t.participant).student);
  else if (user.role !== 'TEACHER' || t.session.teacherId !== user.id)
    throw new ForbiddenException('This lesson is assigned to another teacher.');
  return t;
}
@Injectable()
export class ReadService {
  constructor(
    readonly db: PrismaService,
    readonly clock: Clock,
  ) {}
  async lessons(user: Actor, q: D.WeekQuery) {
    if (user.role === 'TEACHER' && q.teacherId && q.teacherId !== user.id)
      throw new ForbiddenException('You can only view your lessons.');
    const bounds = (() => {
      try {
        return weekBounds(q.week);
      } catch {
        bad('Enter a valid week date.');
      }
    })();
    const where: Prisma.ClassSessionWhereInput = {
      startsAt: { gte: bounds.start, lt: bounds.end },
      ...(q.classGroupId ? { classGroupId: q.classGroupId } : {}),
      ...(q.courseId ? { courseId: q.courseId } : {}),
      ...(user.role === 'TEACHER'
        ? { teacherId: user.id }
        : q.teacherId
          ? { teacherId: q.teacherId }
          : {}),
      ...(q.q
        ? {
            OR: [
              { classGroup: { name: { contains: q.q, mode: 'insensitive' } } },
              { course: { name: { contains: q.q, mode: 'insensitive' } } },
              { teacher: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return (
      await this.db.classSession.findMany({
        where,
        include: lessonInclude,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      })
    ).map(lessonDto);
  }
  async roster(user: Actor, id: string): Promise<D.RosterDto> {
    const l = required(
      await this.db.classSession.findUnique({ where: { id }, include: lessonInclude }),
    );
    if (user.role === 'TEACHER' && l.teacherId !== user.id)
      throw new ForbiddenException('You can only view your assigned lessons.');
    const rows = l.participants.map((p) => participantDto(p, l, user));
    const rank: Record<string, number> = { TRIAL: 0, NEW: 1, EXISTING: 2 };
    rows.sort(
      (a, b) =>
        rank[a.category] - rank[b.category] ||
        a.name.localeCompare(b.name) ||
        a.participantId.localeCompare(b.participantId),
    );
    return {
      lesson: lessonDto(l),
      participants: rows.filter((p) => p.bookingStatus === 'BOOKED'),
      cancelled: user.role === 'ADMIN' ? rows.filter((p) => p.bookingStatus === 'CANCELLED') : [],
    };
  }
  async options(user: Actor) {
    admin(user);
    const [classes, courses, teachers] = await Promise.all([
      this.db.classGroup.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.course.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.user.findMany({
        where: { role: 'TEACHER' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { classes, courses, teachers };
  }
  studentScope(user: Actor): Prisma.StudentWhereInput {
    return user.role === 'TEACHER'
      ? {
          participants: {
            some: { bookingStatus: 'BOOKED', session: { teacherId: user.id, status: 'SCHEDULED' } },
          },
        }
      : {};
  }
  async students(user: Actor, q: D.StudentQuery) {
    const where: Prisma.StudentWhereInput = {
      ...this.studentScope(user),
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(q.mine === 'true' && user.role === 'ADMIN' ? { ownerAdminId: user.id } : {}),
    };
    const now = this.clock.now();
    const bounds = membershipBounds(now);
    const categories: Record<MembershipCategory, Prisma.StudentWhereInput> = {
      TRIAL_STUDENT: { type: 'TRIAL' },
      NEW_MEMBER: {
        type: 'MEMBER',
        firstPurchasedAt: { gte: bounds.newMemberFrom, lt: bounds.nextMidnight },
      },
      MEMBER: {
        type: 'MEMBER',
        OR: [
          { firstPurchasedAt: { lt: bounds.newMemberFrom } },
          { firstPurchasedAt: { gte: bounds.nextMidnight } },
        ],
      },
    };
    return this.db.$transaction(
      async (tx) => {
        const categoryCounts = {} as D.CategoryCountsDto;
        for (const category of MEMBERSHIP_CATEGORIES)
          categoryCounts[category] = await tx.student.count({
            where: { AND: [where, categories[category]] },
          });
        const rows = await tx.student.findMany({
          where: q.category ? { AND: [where, categories[q.category]] } : where,
          select: {
            id: true,
            name: true,
            yearLevel: true,
            age: true,
            gender: true,
            firstPurchasedAt: true,
            type: true,
            adminLink: { select: { admin: { select: { id: true, name: true } } } },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        return {
          items: rows.map(({ firstPurchasedAt, adminLink, ...s }) => ({
            ...s,
            ...(user.role === 'ADMIN' && adminLink ? { responsibleAdmin: adminLink.admin } : {}),
            membershipCategory: membership({ type: s.type, firstPurchasedAt }, now)
              .membershipCategory,
          })),
          total: q.category
            ? categoryCounts[q.category]
            : Object.values(categoryCounts).reduce((sum, n) => sum + n, 0),
          categoryCounts,
          page: q.page,
          pageSize: q.pageSize,
          membershipAsOfDate: bounds.membershipAsOfDate,
          nextCategoryChangeAt: bounds.nextMidnight.toISOString(),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async student(user: Actor, id: string): Promise<D.StudentDetailDto> {
    return this.db.$transaction(
      async (tx) => {
        const now = this.clock.now();
        const s = required(
          await tx.student.findUnique({
            where: { id },
            include: {
              adminLink: {
                include: {
                  admin: { select: { id: true, name: true } },
                  createdByAdmin: { select: { id: true, name: true } },
                },
              },
            },
          }),
        );
        if (
          user.role === 'TEACHER' &&
          !(await tx.student.findFirst({
            where: { id, ...this.studentScope(user) },
            select: { id: true },
          }))
        )
          throw new ForbiddenException('This student is not in your lessons.');
        const canEdit = user.role === 'ADMIN' && s.ownerAdminId === user.id;
        const participants =
          canEdit || user.role === 'TEACHER'
            ? await tx.sessionParticipant.findMany({
                where: {
                  studentId: id,
                  bookingStatus: 'BOOKED',
                  session: {
                    status: 'SCHEDULED',
                    ...(user.role === 'TEACHER' ? { teacherId: user.id } : {}),
                  },
                },
                include: { session: { include: lessonInclude } },
                orderBy: [{ session: { startsAt: 'desc' } }, { id: 'desc' }],
                take: 100,
              })
            : [];
        const base: D.StudentDetailDto = {
          ...membership(s, now),
          ...(canEdit ? { firstPurchasedAt: s.firstPurchasedAt?.toISOString() ?? null } : {}),
          id: s.id,
          type: s.type,
          name: s.name,
          yearLevel: s.yearLevel,
          gender: s.gender,
          age: s.age,
          canEdit,
          version: s.version,
          firstEnrolledOn: s.firstEnrolledOn?.toISOString().slice(0, 10) ?? null,
          teachingRecords: participants.map((p) => ({
            participantId: p.id,
            lesson: lessonDto(p.session),
            ...rosterMembership(s, p.session.startsAt),
            attendance: p.attendance,
            feedback: p.feedback,
          })),
        };
        if (user.role === 'ADMIN' && s.adminLink) {
          base.responsibleAdmin = s.adminLink.admin;
          base.recordedByAdmin = s.adminLink.createdByAdmin;
        }
        if (canEdit) base.guardianAge = s.guardianAge;
        if (canEdit)
          for (const field of [
            'guardianOccupation',
            'guardianGender',
            'guardianName',
            'guardianRelationship',
            'guardianPhone',
            'guardianEmail',
            'guardianWechat',
            'preferredChannel',
            'preferredLanguage',
            'learningGoals',
            'preferredTimes',
            'interestedSubjects',
          ] as const)
            base[field] = s[field] ?? '';
        return base;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async communications(user: Actor, id: string, q: D.PageQuery) {
    await ownedStudent(this.db, user, id);
    const where = { studentId: id };
    const [records, total] = await this.db.$transaction([
      this.db.communicationLog.findMany({
        where,
        include: { author: { select: { name: true } } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.communicationLog.count({ where }),
    ]);
    return {
      items: records.map((c) => ({
        id: c.id,
        studentId: c.studentId,
        guardianNameSnapshot: c.guardianNameSnapshot,
        channel: c.channel,
        content: c.content,
        occurredAt: c.occurredAt.toISOString(),
        authorName: c.author.name,
        outcome: c.outcome,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async changes(user: Actor, id: string, q: D.PageQuery) {
    admin(user);
    required(await this.db.classSession.findUnique({ where: { id }, select: { id: true } }));
    const where = { OR: [{ sessionId: id }, { targetSessionId: id }] };
    const [records, total] = await this.db.$transaction([
      this.db.scheduleChange.findMany({
        where,
        include: { actor: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.scheduleChange.count({ where }),
    ]);
    return {
      items: records.map((c) => ({
        id: c.id,
        action: c.action,
        reason: c.reason,
        actorName: c.actor.name,
        createdAt: c.createdAt.toISOString(),
        before: JSON.stringify(c.before),
        after: JSON.stringify(c.after),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async tasks(user: Actor, q: D.TaskQuery) {
    const type = user.role === 'ADMIN' ? 'TRIAL_FOLLOWUP' : 'LESSON_FEEDBACK';
    if (q.type && q.type !== type)
      throw new ForbiddenException('This task type is not available to your role.');
    const now = this.clock.now();
    const where: Prisma.TaskWhereInput = {
      assigneeId: user.id,
      type,
      status: q.status ?? 'OPEN',
      availableAt: { lte: now },
      ...(q.overdue === 'true' ? { dueAt: { lt: now }, status: 'OPEN' } : {}),
      ...(q.q
        ? {
            OR: [
              { session: { classGroup: { name: { contains: q.q, mode: 'insensitive' } } } },
              { participant: { student: { name: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.task.findMany({
        where,
        include: taskInclude,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.task.count({ where }),
    ]);
    return { items: items.map(taskDto), total, page: q.page, pageSize: q.pageSize };
  }
  async task(user: Actor, id: string): Promise<D.TaskDetailDto> {
    const t = await assignedTask(this.db, user, id);
    if (t.availableAt > this.clock.now())
      throw new ForbiddenException('This task is available after the lesson ends.');
    const p = t.participant ? t.session.participants.find((p) => p.id === t.participantId) : null;
    return {
      ...taskDto(t),
      lesson: lessonDto(t.session),
      student: t.participant ? await this.student(user, t.participant.studentId) : null,
      participant: p ? participantDto(p, t.session, user) : null,
    };
  }
  async eligibility(user: Actor, id: string, courseId: string): Promise<D.EligibilityDto> {
    await ownedStudent(this.db, user, id);
    required(await this.db.course.findUnique({ where: { id: courseId } }));
    const rows = await this.db.sessionParticipant.findMany({
      where: {
        studentId: id,
        kind: 'TRIAL',
        bookingStatus: 'BOOKED',
        session: { courseId, status: 'SCHEDULED' },
      },
      select: { attendance: true },
    });
    const used = rows.some((p) => p.attendance === 'ATTENDED');
    const held = rows.some((p) => p.attendance === 'PENDING');
    return {
      remaining: used ? 0 : 1,
      available: used || held ? 0 : 1,
      reason: used ? 'TRIAL_EXHAUSTED' : held ? 'TRIAL_ALREADY_RESERVED' : null,
    };
  }
}
