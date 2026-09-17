import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DateTime } from 'luxon';
assert.equal(process.env.ENTITLEMENT_UI_PREVIEW, 'true');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/entitlement_ui_preview');
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/bootstrap');
const { PrismaService } = require('../dist/prisma.service');
const { Commands } = require('../dist/common/domain');
const { EntitlementsService } = require('../dist/workflow/entitlements.service');
const { hashPassword } = require('../dist/auth/password');
const { bootstrapSuperAdmin } = require('../dist/accounts/bootstrap-super-admin');
const { app } = await createApp();
const db = app.get(PrismaService),
  commands = app.get(Commands),
  credits = app.get(EntitlementsService);
const passwordHash = await hashPassword('Preview2026!');
await bootstrapSuperAdmin(db, {
  email: 'super@preview.test',
  name: 'Super Admin',
  password: 'Preview2026!',
});
const admin = await db.user.create({
  data: {
    id: 'preview-admin',
    email: 'admin@preview.test',
    name: 'Preview Admin',
    role: 'ADMIN',
    passwordHash,
  },
});
await db.user.create({
  data: {
    id: 'preview-other',
    email: 'other@preview.test',
    name: 'Other Admin',
    role: 'ADMIN',
    passwordHash,
  },
});
await db.user.create({
  data: {
    id: 'preview-teacher',
    email: 'teacher@preview.test',
    name: 'Preview Teacher',
    role: 'TEACHER',
    passwordHash,
  },
});
const course = await db.course.create({ data: { name: 'Mathematics' } });
const group = await db.classGroup.create({
  data: { name: 'Year 4 Foundations', targetLevel: 'Year 4' },
});
await db.lessonPackage.create({
  data: { name: '10 lesson package', quantity: 10, priceAudCents: 40000 },
});
await db.lessonPackage.create({
  data: { name: '25 lesson package', quantity: 25, priceAudCents: 90000 },
});
const actor = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
for (let i = 0; i < 30; i++) {
  const s = await db.student.create({
    data: {
      id: `preview-student-${i}`,
      name: `${['Ava', 'Ben', 'Chloe', 'Daniel', 'Ella', 'Finn', 'Grace', 'Henry', 'Isla', 'Jack'][i % 10]} ${['Brown', 'Chen', 'Wilson'][Math.floor(i / 10)]}`,
      yearLevel: 'Year 4',
      ownerAdminId: admin.id,
    },
  });
  await commands.run(
    actor,
    'preview-fixture',
    crypto.randomUUID(),
    {},
    async () => {},
    async (tx) => {
      if (i !== 0)
        await credits.initialTrialGrant(tx, s.id, admin.id, `preview-initial:${i}`, new Date());
      if (i >= 20)
        await credits.grantPurchase(tx, {
          studentId: s.id,
          quantity: 20,
          actorId: admin.id,
          sourceKey: `preview-purchase:${i}`,
          now: DateTime.now()
            .setZone('Australia/Melbourne')
            .minus({ days: i < 25 ? 2 : 14 })
            .toJSDate(),
        });
      return { id: s.id };
    },
  );
}
await db.student.create({
  data: {
    id: 'preview-foreign',
    name: 'Other Admin Student',
    yearLevel: 'Year 3',
    ownerAdminId: 'preview-other',
  },
});
// Keep the single-credit example outside the weekly timetable's daytime slots.
const starts = DateTime.now()
  .setZone('Australia/Melbourne')
  .plus({ days: 1 })
  .set({ hour: 19, minute: 0, second: 0, millisecond: 0 });
const session = await db.classSession.create({
  data: {
    courseId: course.id,
    classGroupId: group.id,
    teacherId: 'preview-teacher',
    startsAt: starts.toJSDate(),
    endsAt: starts.plus({ hours: 1 }).toJSDate(),
    capacity: 10,
  },
});
await db.sessionParticipant.create({
  data: { sessionId: session.id, studentId: 'preview-student-1', kind: 'TRIAL' },
});
await app.close();
console.log(
  'Isolated preview fixtures ready. Fictional users: admin@preview.test, teacher@preview.test; password Preview2026!',
);
