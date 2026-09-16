import { config } from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
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
  for (let i = 0; i < 60; i++)
    await prisma.student.upsert({
      where: { id: `student-${i}` },
      update: {},
      create: {
        id: `student-${i}`,
        name: `${firstNames[i % 12]} ${lastNames[Math.floor(i / 12)]}`,
        yearLevel: `Year ${3 + Math.floor((i < 48 ? Math.floor(i / 4) : ((i - 48) * 3) % 12) / 2)}`,
        ownerAdminId: staff[i % 3][0],
      },
    });
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
      if (slot === 0 && day < 6) {
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
