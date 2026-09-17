import 'reflect-metadata';
import { isEmail } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { hashPassword } from '../auth/password';
import { accountDto } from './service';
import { json } from '../common/domain';

export async function bootstrapSuperAdmin(
  db: PrismaService,
  input: { email: string; name: string; password: string },
) {
  const email = input.email.trim().toLowerCase(),
    name = input.name.trim();
  if (
    !isEmail(email) ||
    email.length > 254 ||
    !name ||
    name.length > 100 ||
    input.password.length < 10 ||
    input.password.length > 128 ||
    !/\S/.test(input.password)
  )
    throw new Error('Provide a valid SUPER_ADMIN_EMAIL, NAME and PASSWORD (10–128 characters).');
  const passwordHash = await hashPassword(input.password);
  // Read committed + the same advisory lock: a concurrent bootstrap sees the first commit.
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73192461)`;
    const existing = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      if (existing.isSuperAdmin && existing.role === 'ADMIN' && existing.status === 'ACTIVE')
        return { id: existing.id, created: false };
      throw new Error(
        'Email belongs to an existing ordinary or inactive account; no privilege changes made.',
      );
    }
    if (await tx.user.findFirst({ where: { isSuperAdmin: true } }))
      throw new Error('A super administrator already exists; no changes made.');
    const user = await tx.user.create({
      data: { email, name, passwordHash, role: 'ADMIN', isSuperAdmin: true },
    });
    await tx.accountAudit.create({
      data: {
        targetUserId: user.id,
        action: 'SYSTEM_BOOTSTRAP',
        requestKey: randomUUID(),
        before: {},
        after: json(accountDto(user)),
      },
    });
    return { id: user.id, created: true };
  });
}
if (require.main === module) {
  const db = new PrismaService();
  bootstrapSuperAdmin(db, {
    email: process.env.SUPER_ADMIN_EMAIL ?? '',
    name: process.env.SUPER_ADMIN_NAME ?? '',
    password: process.env.SUPER_ADMIN_PASSWORD ?? '',
  })
    .then((result) =>
      console.log(
        result.created
          ? 'Super administrator created.'
          : 'Super administrator already exists; unchanged.',
      ),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Bootstrap failed.');
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
