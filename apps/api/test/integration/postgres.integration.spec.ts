import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

describe('PostgreSQL integration', () => {
  const prisma = new PrismaClient();
  const email = `postgres-${randomUUID()}@example.test`;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email, passwordHash: 'test-only-hash' },
    });
    userId = user.id;
    const account = await prisma.account.create({
      data: { userId, currency: 'USD' },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('persists and reads a payment from PostgreSQL', async () => {
    const payment = await prisma.payment.create({
      data: {
        accountId,
        userId,
        amountMinor: 1234,
        currency: 'USD',
        description: 'postgres integration',
      },
    });

    await expect(prisma.payment.findUnique({ where: { id: payment.id } })).resolves.toMatchObject({
      id: payment.id,
      amountMinor: 1234,
    });
  });

  it('rejects non-positive payment amounts at the database boundary', async () => {
    await expect(
      prisma.payment.create({
        data: {
          accountId,
          userId,
          amountMinor: -1,
          currency: 'USD',
          description: 'invalid amount',
        },
      }),
    ).rejects.toThrow();
  });
});
