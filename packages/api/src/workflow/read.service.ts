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
    participantCount: booked.length,
    trialCount: booked.filter((p) => p.student.type === 'TRIAL').length,
    newCount: booked.filter((p) => studentCategory(p.student, l.startsAt) === 'NEW').length,
    status: l.status,
    version: l.version,
  };
}
export function participantDto(
  p: FullLesson['participants'][number],
  l: FullLesson,
  u: Actor,
  now: Date,
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
    canCheckIn:
      u.role === 'TEACHER' &&
      l.teacherId === u.id &&
      l.status === 'SCHEDULED' &&
      l.startsAt <= now &&
      p.bookingStatus === 'BOOKED' &&
      p.attendance === 'PENDING' &&
      !p.checkedInAt &&
      !p.feedbackSubmittedAt,
    checkedInAt: p.checkedInAt?.toISOString() ?? null,
    checkedInBy: p.checkedInBy,
    feedbackSubmittedAt: visible ? (p.feedbackSubmittedAt?.toISOString() ?? null) : null,
    version: p.version,
    canManage: u.role === 'ADMIN' && p.student.ownerAdminId === u.id,
    gender: p.student.gender,
    age: p.student.age,
    backgroundHtml: visible ? p.student.backgroundHtml : null,
    classroomPerformanceRating:
      visible && p.classroomPerformanceRating != null ? Number(p.classroomPerformanceRating) : null,
    overallAbilityRating:
      visible && p.overallAbilityRating != null ? Number(p.overallAbilityRating) : null,
    teacherNoteHtml: visible ? p.teacherNoteHtml : null,
  };
}
export function taskDto(t: FullTask, now: Date): D.TaskDto {
  const current = lessonDto(t.session);
  // Pending teaching work follows the current lesson; completed events retain their snapshot.
  const liveTeachingTask = t.status === 'OPEN' && t.type === 'TRIAL_FEEDBACK';
  const s = (liveTeachingTask ? {} : (t.sourceSnapshot ?? {})) as Record<string, string>;
  return {
    id: t.id,
    completedAt: t.completedAt?.toISOString() ?? null,
    resolvedByEntitlementEntryId: t.resolvedByEntitlementEntryId,
    taskVersion: t.version,
    studentVersion: t.participant?.student.version ?? null,
    membershipCategory: t.participant
      ? membership(t.participant.student, now).membershipCategory
      : null,
    checkedInAt: t.participant?.checkedInAt?.toISOString() ?? null,
    feedbackSubmittedAt: t.participant?.feedbackSubmittedAt?.toISOString() ?? null,
    sourceSnapshot: Object.fromEntries(
      Object.entries((t.sourceSnapshot ?? {}) as Record<string, unknown>).filter(
        ([key, value]) =>
          [
            'studentId',
            'studentName',
            'participantId',
            'sessionId',
            'className',
            'courseId',
            'courseName',
            'teacherId',
            'teacherName',
            'startsAt',
            'endsAt',
            'checkedInAt',
            'classroomPerformanceRating',
            'overallAbilityRating',
            'teacherNoteHtml',
            'feedbackSubmittedAt',
            'membershipCategory',
          ].includes(key) &&
          (typeof value === 'string' || typeof value === 'number'),
      ),
    ) as Record<string, string | number>,
    type: t.type,
    status: t.status,
    followupOutcome: t.followupOutcome,
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
/** One predicate for list, badge and direct detail. History does not require current attendance. */
function visibleTask(user: Actor, status: D.TaskDto['status'], now: Date): Prisma.TaskWhereInput {
  return {
    assigneeId: user.id,
    status,
    ...(status === 'OPEN' ? { availableAt: { lte: now } } : {}),
    ...(user.role === 'ADMIN'
      ? {
          type: { in: ['TRIAL_FOLLOWUP', 'STUDENT_AI_REPORT'] },
          participant: { student: { ownerAdminId: user.id } },
        }
      : {
          type: 'TRIAL_FEEDBACK',
          session: {
            teacherId: user.id,
            ...(status === 'OPEN' ? { status: 'SCHEDULED', endsAt: { lte: now } } : {}),
          },
          ...(status === 'OPEN'
            ? {
                participant: {
                  bookingStatus: 'BOOKED',
                  attendance: 'ATTENDED',
                  checkedInAt: { not: null },
                },
              }
            : {}),
        }),
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
  if (t.type !== 'TRIAL_FEEDBACK') owner(user, required(t.participant).student);
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
    const now = this.clock.now();
    const rows = l.participants.map((p) => participantDto(p, l, user, now));
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
        where: { role: 'TEACHER', status: 'ACTIVE' },
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
    const now = this.clock.now();
    return this.db.$transaction((tx) => this.studentDetail(tx, user, id, now), {
      isolationLevel: 'RepeatableRead',
    });
  }
  private async studentDetail(
    tx: Tx,
    user: Actor,
    id: string,
    now: Date,
    authorizedTask = false,
  ): Promise<D.StudentDetailDto> {
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
      !authorizedTask &&
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
      teachingRecords: participants.map((p) => ({
        participantId: p.id,
        lesson: lessonDto(p.session),
        ...rosterMembership(s, p.session.startsAt),
        attendance: p.attendance,
        classroomPerformanceRating:
          p.classroomPerformanceRating == null ? null : Number(p.classroomPerformanceRating),
        overallAbilityRating:
          p.overallAbilityRating == null ? null : Number(p.overallAbilityRating),
        teacherNoteHtml: p.teacherNoteHtml,
      })),
    };
    if (user.role === 'ADMIN' && s.adminLink) {
      base.responsibleAdmin = s.adminLink.admin;
      base.recordedByAdmin = s.adminLink.createdByAdmin;
    }
    if (canEdit || user.role === 'TEACHER') base.backgroundHtml = s.backgroundHtml;
    if (canEdit) {
      base.guardianAge = s.guardianAge;
      base.adminNotesHtml = s.adminNotesHtml;
    }
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
        noteHtml: c.noteHtml,
        purchaseIntentRating:
          c.purchaseIntentRating == null ? null : Number(c.purchaseIntentRating),
        notPurchasedReasons: c.notPurchasedReasons,
        occurredAt: c.occurredAt.toISOString(),
        authorName: c.author.name,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async changes(user: Actor, id: string, q: D.PageQuery) {
    admin(user);
    required(await this.db.classSession.findUnique({ where: { id }, select: { id: true } }));
    const where = { sessionId: id };
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
    const types =
      user.role === 'ADMIN' ? ['TRIAL_FOLLOWUP', 'STUDENT_AI_REPORT'] : ['TRIAL_FEEDBACK'];
    if (q.type && !types.includes(q.type))
      throw new ForbiddenException('This task type is not available to your role.');
    const now = this.clock.now();
    const where: Prisma.TaskWhereInput = {
      ...visibleTask(user, q.overdue === 'true' ? 'OPEN' : (q.status ?? 'OPEN'), now),
      ...(q.type ? { type: q.type } : {}),
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
    const [items, total] = await this.db.$transaction(
      [
        this.db.task.findMany({
          where,
          include: taskInclude,
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.db.task.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map((t) => taskDto(t, now)), total, page: q.page, pageSize: q.pageSize };
  }
  async task(user: Actor, id: string): Promise<D.TaskDetailDto> {
    const now = this.clock.now();
    return this.db.$transaction(
      async (tx) => {
        const existing = required(
          await tx.task.findUnique({ where: { id }, select: { status: true } }),
        );
        const t = await tx.task.findFirst({
          where: { id, ...visibleTask(user, existing.status, now) },
          include: taskInclude,
        });
        if (!t) throw new ForbiddenException('This task is not available to you.');
        const p = t.participant
          ? t.session.participants.find((p) => p.id === t.participantId)
          : null;
        const communications =
          user.role === 'ADMIN'
            ? await tx.communicationLog.findMany({
                where: { taskId: id },
                include: { author: { select: { name: true } } },
                orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
              })
            : [];
        return {
          ...taskDto(t, now),
          lesson: lessonDto(t.session),
          student: t.participant
            ? await this.studentDetail(tx, user, t.participant.studentId, now, true)
            : null,
          participant: p ? participantDto(p, t.session, user, now) : null,
          ...(user.role === 'ADMIN'
            ? {
                communications: communications.map((c) => ({
                  id: c.id,
                  studentId: c.studentId,
                  guardianNameSnapshot: c.guardianNameSnapshot,
                  channel: c.channel,
                  noteHtml: c.noteHtml,
                  purchaseIntentRating:
                    c.purchaseIntentRating == null ? null : Number(c.purchaseIntentRating),
                  notPurchasedReasons: c.notPurchasedReasons,
                  occurredAt: c.occurredAt.toISOString(),
                  authorName: c.author.name,
                })),
              }
            : {}),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
