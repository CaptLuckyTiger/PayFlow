import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, currency: string, status: AccountStatus = AccountStatus.ACTIVE) {
    return this.prisma.account.create({
      data: {
        userId,
        currency: currency.toUpperCase(),
        status,
      },
    });
  }

  async list(userId: string) {
    return this.prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new NotFoundException('Account not found.');
    }

    return account;
  }

  async ledger(userId: string, accountId: string, page: number, limit: number) {
    await this.findById(userId, accountId);
    const [data, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        include: { payment: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ledgerEntry.count({ where: { accountId } }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
