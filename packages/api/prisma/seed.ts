import { config } from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { nextDay17, digest, json } from '../src/common/domain';
import { hashPassword } from '../src/auth/password';

config({ path: '../../.env', quiet: true });
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  }),
});

async function main() {
  if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 8)
    throw new Error('Set SEED_PASSWORD (at least 8 characters) in .env before seeding.');
  const passwordHash = await hashPassword(process.env.SEED_PASSWORD);
  const staff = [
    ['alice', 'Alice Chen', 'ADMIN'],
    ['oliver', 'Oliver Smith', 'ADMIN'],
    ['grace', 'Grace Lin', 'ADMIN'],
    ['emma', 'Emma Wilson', 'TEACHER'],
    ['james', 'James Lee', 'TEACHER'],
    ['sophie', 'Sophie Brown', 'TEACHER'],
    ['noah', 'Noah Taylor', 'TEACHER'],
  ] as const;
  for (const [id, name, role] of staff)
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, name, role, email: `${id}@example.com`, passwordHash },
    });
  const courses = ['Mathematics', 'English', 'Science'];
  for (const name of courses)
    await prisma.course.upsert({
      where: { id: name.toLowerCase() },
      update: {},
      create: { id: name.toLowerCase(), name },
    });
  for (let i = 0; i < 12; i++)
    await prisma.classGroup.upsert({
      where: { id: `group-${i}` },
      update: {},
      create: {
        id: `group-${i}`,
        name: `Year ${3 + Math.floor(i / 2)} · ${i % 2 ? 'Extension' : 'Foundations'}`,
        targetLevel: `Year ${3 + Math.floor(i / 2)}`,
      },
    });
  const firstNames = [
    'Ava',
    'Leo',
    'Mia',
    'Lucas',
    'Isla',
    'Ethan',
    'Chloe',
    'Henry',
    'Zoe',
    'Oliver',
    'Ruby',
    'Liam',
  ];
  const lastNames = ['Chen', 'Wilson', 'Wang', 'Patel', 'Nguyen'];
  for (let i = 0; i < 60; i++) {
    const purchasedAt = i < 48 ? new Date(Date.now() - (i % 3 === 0 ? 2 : 30) * 86400000) : null;
    await prisma.$transaction(async (tx) => {
      if (await tx.student.findUnique({ where: { id: `student-${i}` } })) return;
      await tx.student.create({
        data: {
          id: `student-${i}`,
          name: `${firstNames[i % 12]} ${lastNames[Math.floor(i / 12)]}`,
          yearLevel: `Year ${3 + Math.floor((i < 48 ? Math.floor(i / 4) : ((i - 48) * 3) % 12) / 2)}`,
          ownerAdminId: staff[i % 3][0],
          type: purchasedAt ? 'MEMBER' : 'TRIAL',
          firstPurchasedAt: purchasedAt,
        },
      });
      await tx.entitlementEntry.create({
        data: {
          studentId: `student-${i}`,
          actorId: staff[i % 3][0],
          sourceKey: `demo-card:student-${i}`,
          bucket: purchasedAt ? 'REGULAR' : 'TRIAL',
          kind: purchasedAt ? 'PURCHASE' : 'INITIAL_TRIAL',
          quantity: purchasedAt ? 20 : 1,
          createdAt: purchasedAt ?? new Date(),
        },
      });
    });
  }
  const week = DateTime.now().setZone('Australia/Melbourne').startOf('week');
  let count = 0;
  // Generate local calendar times, never add fixed UTC hours across DST.
  for (let day = 0; day < 7; day++) {
    for (let slot = 0; slot < (day === 6 ? 6 : 9); slot++) {
      const groupIndex = (day * 3 + slot) % 12;
      const starts = week
        .plus({ days: day })
        .set({ hour: (day < 5 ? 15 : 9) + Math.floor(slot / 3) });
      const sessionId = `demo-${week.toISODate()}-${day}-${slot}`;
      await prisma.classSession.upsert({
        where: { id: sessionId },
        update: {},
        create: {
          id: sessionId,
          classGroupId: `group-${groupIndex}`,
          courseId: courses[(slot + day) % 3].toLowerCase(),
          teacherId: staff[3 + (((slot % 3) + day) % 4)][0],
          startsAt: starts.toJSDate(),
          endsAt: starts.plus({ hours: 1 }).toJSDate(),
          capacity: slot === 8 ? 4 : 8,
        },
      });
      for (let n = 0; n < 4; n++) {
        const studentId = `student-${groupIndex * 4 + n}`;
        const earlier = await prisma.sessionParticipant.count({
          where: {
            studentId,
            session: { classGroupId: `group-${groupIndex}`, startsAt: { lt: starts.toJSDate() } },
          },
        });
        await prisma.sessionParticipant.upsert({
          where: { sessionId_studentId: { sessionId, studentId } },
          update: {},
          create: { sessionId, studentId, isNewToClass: earlier === 0 },
        });
      }
      if (
        slot === 0 &&
        day < 6 &&
        !(await prisma.sessionParticipant.findFirst({
          where: {
            studentId: `student-${48 + day}`,
            kind: 'TRIAL',
            bookingStatus: 'BOOKED',
            attendance: { in: ['PENDING', 'ATTENDED'] },
          },
        }))
      ) {
        const studentId = `student-${48 + day}`;
        await prisma.sessionParticipant.upsert({
          where: { sessionId_studentId: { sessionId, studentId } },
          update: {},
          create: { sessionId, studentId, kind: 'TRIAL', isNewToClass: true },
        });
      }
      count++;
    }
  }
  // Upgrade only missing fields on the known fictional seed records.
  for (let i = 0; i < 60; i++) {
    const id = `student-${i}`;
    await prisma.student.updateMany({
      where: { id, guardianName: null },
      data: {
        guardianName: `Demo guardian ${i + 1}`,
        guardianEmail: `guardian-${i + 1}@example.com`,
        guardianRelationship: 'Parent',
        preferredChannel: 'EMAIL',
      },
    });
    if (i < 48) {
      const earliest = await prisma.sessionParticipant.findFirst({
        where: { studentId: id, kind: 'REGULAR' },
        include: { session: true },
        orderBy: { session: { startsAt: 'asc' } },
      });
      if (earliest)
        await prisma.student.updateMany({
          where: { id, firstEnrolledOn: null },
          data: {
            firstEnrolledOn:
              DateTime.fromJSDate(earliest.session.startsAt, { zone: 'Australia/Melbourne' })
                .minus({ days: i % 3 === 0 ? 0 : 30 })
                .startOf('day')
                .toISODate() + 'T00:00:00.000Z',
          },
        });
    }
  }
  const lessons = await prisma.classSession.findMany({ where: { id: { startsWith: 'demo-' } } });
  for (const l of lessons)
    if (!(await prisma.task.findFirst({ where: { type: 'LESSON_FEEDBACK', sessionId: l.id } })))
      await prisma.task.create({
        data: {
          type: 'LESSON_FEEDBACK',
          sessionId: l.id,
          assigneeId: l.teacherId,
          availableAt: l.endsAt,
          dueAt: nextDay17(l.endsAt),
          status: l.status === 'CANCELLED' ? 'CANCELLED' : l.feedbackSubmittedAt ? 'DONE' : 'OPEN',
        },
      });
  // Three historical fixtures make the workflow demonstrable even on Monday morning.
  // IDs are namespaced; an existing lesson is never overwritten on a later seed run.
  for (let i = 0; i < 3; i++) {
    const id = `history-${week.toISODate()}-${i}`;
    if (await prisma.classSession.findUnique({ where: { id } })) continue;
    const start = week.minus({ days: 1 }).set({ hour: 12 + i, minute: 0 });
    if (
      await prisma.classSession.findFirst({
        where: {
          status: 'SCHEDULED',
          startsAt: { lt: start.plus({ hours: 1 }).toJSDate() },
          endsAt: { gt: start.toJSDate() },
          OR: [{ teacherId: 'emma' }, { classGroupId: 'group-0' }],
        },
      })
    )
      continue;
    await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          id: `${id}-student`,
          name: ['Demo · Awaiting feedback', 'Demo · Trial follow-up', 'Demo · Missed trial'][i],
          yearLevel: 'Year 3',
          ownerAdminId: 'alice',
          guardianName: 'Demo Parent',
          guardianEmail: `${id}@example.com`,
          preferredChannel: 'EMAIL',
        },
      });
      const lesson = await tx.classSession.create({
        data: {
          id,
          classGroupId: 'group-0',
          courseId: 'mathematics',
          teacherId: 'emma',
          startsAt: start.toJSDate(),
          endsAt: start.plus({ hours: 1 }).toJSDate(),
          capacity: 8,
        },
      });
      const feedback =
        i === 1
          ? 'Completed the practice independently. Discuss suitable lesson times with the family.'
          : null;
      const participant = await tx.sessionParticipant.create({
        data: {
          sessionId: id,
          studentId: student.id,
          kind: 'TRIAL',
          attendance: i === 0 ? 'PENDING' : i === 1 ? 'ATTENDED' : 'NO_SHOW',
          feedback,
          categorySnapshot: i ? 'TRIAL' : null,
        },
      });
      if (i)
        await tx.classSession.update({
          where: { id },
          data: {
            feedbackSubmittedAt: lesson.endsAt,
            feedbackPayloadHash: digest({
              summary: '',
              students: [
                {
                  participantId: participant.id,
                  attendance: participant.attendance,
                  feedback: feedback ?? '',
                  abilityNote: '',
                  preferenceNote: '',
                },
              ],
            }),
          },
        });
      await tx.task.create({
        data: {
          type: 'LESSON_FEEDBACK',
          sessionId: id,
          assigneeId: 'emma',
          availableAt: lesson.endsAt,
          dueAt: nextDay17(lesson.endsAt),
          status: i ? 'DONE' : 'OPEN',
          completedAt: i ? lesson.endsAt : null,
        },
      });
      if (i)
        await tx.task.create({
          data: {
            type: 'TRIAL_FOLLOWUP',
            sessionId: id,
            participantId: participant.id,
            assigneeId: 'alice',
            availableAt: lesson.endsAt,
            dueAt: nextDay17(lesson.endsAt),
            reason: i === 1 ? 'TRIAL_COMPLETED' : 'NO_SHOW',
            sourceSnapshot: json({
              className: 'Year 3 · Foundations',
              courseName: 'Mathematics',
              teacherName: 'Emma Wilson',
              startsAt: lesson.startsAt.toISOString(),
              endsAt: lesson.endsAt.toISOString(),
            }),
          },
        });
    });
  }
  console.log(
    `Seed complete: ${count} lessons for Melbourne week ${week.toISODate()}, 60 fictional students, 3 admins, 4 teachers. Existing rows preserved.`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
