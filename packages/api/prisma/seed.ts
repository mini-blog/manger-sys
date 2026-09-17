import { config } from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { nextDay17, json } from '../src/common/domain';
import { ensureFirstPurchaseFollowup } from '../src/workflow/followup-policy';
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
          guardianName: `Demo guardian ${i + 1}`,
          guardianEmail: `guardian-${i + 1}@example.com`,
          guardianRelationship: 'Parent',
          preferredChannel: 'EMAIL',
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
        },
      });
      for (let n = 0; n < 4; n++) {
        const studentId = `student-${groupIndex * 4 + n}`;
        await prisma.sessionParticipant.upsert({
          where: { sessionId_studentId: { sessionId, studentId } },
          update: {},
          create: { sessionId, studentId },
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
          create: { sessionId, studentId, kind: 'TRIAL' },
        });
      }
      count++;
    }
  }

  // Seed-owned evaluation rows only; repeat runs never refill credits or reopen work.
  const trialBookings = await prisma.sessionParticipant.findMany({
    where: {
      sessionId: { startsWith: 'demo-' },
      student: { type: 'TRIAL' },
      bookingStatus: 'BOOKED',
    },
    include: { session: true },
  });
  for (const p of trialBookings) {
    if (await prisma.task.findFirst({ where: { participantId: p.id, type: 'TRIAL_FEEDBACK' } }))
      continue;
    await prisma.task.create({
      data: {
        type: 'TRIAL_FEEDBACK',
        participantId: p.id,
        sessionId: p.sessionId,
        assigneeId: p.session.teacherId,
        availableAt: p.session.endsAt,
        dueAt: nextDay17(p.session.endsAt),
      },
    });
  }
  // Stable fixture IDs: a finished Sunday lesson with two checked in and one absent,
  // plus a separately evaluated student ready for an admin follow-up.
  for (let lessonIndex = 0; lessonIndex < 2; lessonIndex++) {
    const id = `workflow-demo-${lessonIndex}`;
    if (await prisma.classSession.findUnique({ where: { id } })) continue;
    const start = week.minus({ days: 1 }).set({ hour: 12 + lessonIndex, minute: 0 });
    await prisma.$transaction(async (tx) => {
      const lesson = await tx.classSession.create({
        data: {
          id,
          classGroupId: 'group-0',
          courseId: 'mathematics',
          teacherId: 'emma',
          startsAt: start.toJSDate(),
          endsAt: start.plus({ hours: 1 }).toJSDate(),
        },
      });
      for (let i = 0; i < (lessonIndex === 0 ? 3 : 1); i++) {
        const sid = `${id}-student-${i}`,
          owner = i === 1 ? 'oliver' : 'alice';
        await tx.student.create({
          data: {
            id: sid,
            name:
              lessonIndex === 1
                ? 'Demo · Follow-up ready'
                : ['Demo · Evaluation one', 'Demo · Evaluation two', 'Demo · Not checked in'][i],
            yearLevel: 'Year 3',
            ownerAdminId: owner,
            guardianName: 'Demo Parent',
            guardianRelationship: 'Parent',
            guardianEmail: `${sid}@example.com`,
            preferredChannel: 'EMAIL',
          },
        });
        await tx.entitlementEntry.create({
          data: {
            studentId: sid,
            actorId: owner,
            bucket: 'TRIAL',
            kind: 'INITIAL_TRIAL',
            quantity: 1,
            sourceKey: `${sid}:gift`,
          },
        });
        const checked = i !== 2;
        const feedback =
          lessonIndex === 1
            ? 'Completed practice independently; discuss suitable lesson times.'
            : null;
        const participant = await tx.sessionParticipant.create({
          data: {
            id: `${sid}-participant`,
            studentId: sid,
            sessionId: id,
            kind: 'TRIAL',
            attendance: checked ? 'ATTENDED' : 'PENDING',
            checkedInAt: checked ? lesson.startsAt : null,
            checkedInBy: checked ? 'emma' : null,
            categorySnapshot: checked ? 'TRIAL' : null,
            membershipCategorySnapshot: checked ? 'TRIAL_STUDENT' : null,
            feedback,
            feedbackSubmittedAt: feedback ? lesson.endsAt : null,
          },
        });
        if (checked)
          await tx.entitlementEntry.create({
            data: {
              studentId: sid,
              participantId: participant.id,
              actorId: 'emma',
              bucket: 'TRIAL',
              kind: 'CONSUMPTION',
              quantity: -1,
              sourceKey: `${sid}:check-in`,
              createdAt: lesson.startsAt,
            },
          });
        await tx.task.create({
          data: {
            type: 'TRIAL_FEEDBACK',
            sessionId: id,
            participantId: participant.id,
            assigneeId: 'emma',
            availableAt: lesson.endsAt,
            dueAt: nextDay17(lesson.endsAt),
            status: feedback ? 'DONE' : 'OPEN',
            completedAt: feedback ? lesson.endsAt : null,
            sourceSnapshot: feedback
              ? json({ studentId: sid, feedback, membershipCategory: 'TRIAL_STUDENT' })
              : undefined,
          },
        });
        if (feedback) await ensureFirstPurchaseFollowup(tx, participant.id, lesson.endsAt);
      }
    });
  }
  console.log(
    `Seed complete: ${count} lessons for Melbourne week ${week.toISODate()}, plus two finished workflow demo lessons. Existing rows preserved.`,
  );
}
void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
