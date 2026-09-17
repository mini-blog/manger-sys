import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DateTime } from 'luxon';

// Explicitly restricted to the disposable UI preview database, never the configured app database.
assert.equal(process.env.ENTITLEMENT_UI_PREVIEW, 'true');
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.pathname, '/entitlement_ui_preview');
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/prisma.service');
const { nextDay17 } = require('../dist/common/domain');
const { hashPassword } = require('../dist/auth/password');
const { app } = await createApp();
const db = app.get(PrismaService);
const week = DateTime.now().setZone('Australia/Melbourne').startOf('week');
const prefix = `timetable-${week.toISODate()}`;
try {
  const admin = await db.user.findUniqueOrThrow({ where: { id: 'preview-admin' } });
  const other = await db.user.findUniqueOrThrow({ where: { id: 'preview-other' } });
  const teacher = await db.user.findUniqueOrThrow({ where: { id: 'preview-teacher' } });
  const passwordHash = await hashPassword('Preview2026!');
  let added = 0;
  await db.$transaction(
    async (tx) => {
      const teacherIds = [teacher.id];
      for (const [id, name] of [
        ['emma', 'Emma Wilson'],
        ['james', 'James Lee'],
        ['sophie', 'Sophie Brown'],
      ]) {
        const staff = await tx.user.upsert({
          where: { id: `timetable-${id}` },
          update: {},
          create: {
            id: `timetable-${id}`,
            name,
            email: `${id}@preview.test`,
            role: 'TEACHER',
            passwordHash,
          },
        });
        teacherIds.push(staff.id);
      }
      const courses = [];
      for (const name of ['Mathematics', 'English', 'Science']) {
        const course =
          (await tx.course.findFirst({ where: { name } })) ??
          (await tx.course.create({ data: { id: `timetable-${name.toLowerCase()}`, name } }));
        courses.push(course.id);
      }
      for (let g = 0; g < 12; g++)
        await tx.classGroup.upsert({
          where: { id: `timetable-group-${g}` },
          update: {},
          create: {
            id: `timetable-group-${g}`,
            name: `Year ${3 + Math.floor(g / 2)} · ${g % 2 ? 'Extension' : 'Foundations'}`,
            targetLevel: `Year ${3 + Math.floor(g / 2)}`,
          },
        });
      const names = [
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
      for (let i = 0; i < 60; i++) {
        const id = `${prefix}-student-${i}`;
        if (await tx.student.findUnique({ where: { id } })) continue;
        const owner = i % 5 === 0 ? other.id : admin.id;
        const group = i < 48 ? Math.floor(i / 4) : (i - 48) % 12;
        const purchasedAt = i < 48 ? week.plus({ days: i % 3 === 0 ? 0 : -21 }).toJSDate() : null;
        await tx.student.create({
          data: {
            id,
            name: `${names[i % 12]} ${['Chen', 'Wilson', 'Wang', 'Patel', 'Nguyen'][Math.floor(i / 12)]}`,
            yearLevel: `Year ${3 + Math.floor(group / 2)}`,
            age: 8 + Math.floor(group / 2),
            gender: i % 2 ? 'MALE' : 'FEMALE',
            ownerAdminId: owner,
            type: purchasedAt ? 'MEMBER' : 'TRIAL',
            firstPurchasedAt: purchasedAt,
            guardianName: `Demo parent ${i + 1}`,
            guardianRelationship: 'Parent',
            guardianEmail: `timetable-parent-${i + 1}@example.test`,
            guardianAge: 35 + (i % 10),
            guardianOccupation: ['Teacher', 'Engineer', 'Nurse'][i % 3],
            preferredChannel: 'EMAIL',
          },
        });
        await tx.studentAdminLink.update({
          where: { studentId: id },
          data: { createdByAdminId: owner },
        });
        await tx.entitlementEntry.create({
          data: {
            studentId: id,
            actorId: owner,
            sourceKey: `${id}:card`,
            bucket: purchasedAt ? 'REGULAR' : 'TRIAL',
            kind: purchasedAt ? 'PURCHASE' : 'INITIAL_TRIAL',
            quantity: purchasedAt ? 20 : 1,
            createdAt: purchasedAt ?? week.toJSDate(),
          },
        });
      }
      let trial = 48;
      for (let day = 0; day < 7; day++) {
        for (let slot = 0; slot < (day === 6 ? 6 : 9); slot++) {
          const id = `${prefix}-lesson-${day}-${slot}`;
          const trialIndex = slot === 0 || (slot === 1 && day < 5) ? trial++ : null;
          if (await tx.classSession.findUnique({ where: { id } })) continue;
          const group = (day * 3 + slot) % 12;
          const startsAt = week
            .plus({ days: day })
            .set({ hour: (day < 5 ? 15 : 9) + Math.floor(slot / 3) })
            .toJSDate();
          const endsAt = new Date(startsAt.getTime() + 3600000);
          const teacherId = teacherIds[((slot % 3) + day) % 4];
          const overlap = await tx.classSession.findFirst({
            where: {
              teacherId,
              status: 'SCHEDULED',
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          });
          assert.equal(overlap, null, `Demo teacher conflict for ${id}`);
          await tx.classSession.create({
            data: {
              id,
              classGroupId: `timetable-group-${group}`,
              courseId: courses[(day + slot) % 3],
              teacherId,
              startsAt,
              endsAt,
            },
          });
          for (let n = 0; n < 4; n++)
            await tx.sessionParticipant.create({
              data: {
                sessionId: id,
                studentId: `${prefix}-student-${group * 4 + n}`,
                kind: 'REGULAR',
              },
            });
          if (trialIndex !== null) {
            const p = await tx.sessionParticipant.create({
              data: {
                sessionId: id,
                studentId: `${prefix}-student-${trialIndex}`,
                kind: 'TRIAL',
              },
            });
            await tx.task.create({
              data: {
                type: 'TRIAL_FEEDBACK',
                participantId: p.id,
                sessionId: id,
                assigneeId: teacherId,
                availableAt: endsAt,
                dueAt: nextDay17(endsAt),
              },
            });
          }
          added++;
        }
      }
    },
    { timeout: 30000 },
  );
  console.log(
    `Preview timetable: Melbourne week ${week.toISODate()}, added ${added} lessons; 60 demo lessons, 12 groups, 4 teachers, 3 subjects, 60 students. Existing edits retained on rerun.`,
  );
} finally {
  await app.close();
}
