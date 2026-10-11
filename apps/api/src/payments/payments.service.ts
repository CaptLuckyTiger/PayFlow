import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PaymentStateMachine, PaymentStatus } from '@payflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FakePaymentProvider } from './fake-payment-provider';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FakePaymentProvider,
  ) {}

  async create(userId: string, dto: CreatePaymentDto) {
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
    });

    if (!account) {
      throw new NotFoundException('Account not found for this user.');
    }

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Payments can only be created for active accounts.');
    }

    const normalized = {
      accountId: dto.accountId,
      amountMinor: dto.amountMinor,
      currency: dto.currency.toUpperCase(),
      description: dto.description,
      idempotencyKey: dto.idempotencyKey,
    };

    if (account.currency !== normalized.currency) {
      throw new BadRequestException('Payment currency must match the account currency.');
    }

    const requestHash = createHash('sha256')
      .update(JSON.stringify({ userId, ...normalized }))
      .digest('hex');

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key: dto.idempotencyKey } },
      include: { payment: true },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency key reused with different payload.');
      }
      return existing.payment;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingInTx = await tx.idempotencyRecord.findUnique({
          where: { userId_key: { userId, key: dto.idempotencyKey } },
          include: { payment: true },
        });

        if (existingInTx) {
          if (existingInTx.requestHash !== requestHash) {
            throw new ConflictException('Idempotency key reused with different payload.');
          }
          return existingInTx.payment;
        }

        const payment = await tx.payment.create({
          data: {
            accountId: dto.accountId,
            userId,
            amountMinor: dto.amountMinor,
            currency: dto.currency.toUpperCase(),
            description: dto.description,
            status: 'PENDING',
            providerReference: `fake-${Date.now()}`,
          },
        });

        await tx.idempotencyRecord.create({
          data: {
            userId,
            key: dto.idempotencyKey,
            requestHash,
            paymentId: payment.id,
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'payment.requested',
            aggregateId: payment.id,
            payload: {
              paymentId: payment.id,
              accountId: payment.accountId,
              userId,
              amountMinor: payment.amountMinor,
              currency: payment.currency,
              description: payment.description,
            },
            status: 'PENDING',
          },
        });

        return payment;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      const existingAfterConflict = await this.prisma.idempotencyRecord.findUnique({
        where: { userId_key: { userId, key: dto.idempotencyKey } },
        include: { payment: true },
      });

      if (!existingAfterConflict) {
        throw error;
      }
      if (existingAfterConflict.requestHash !== requestHash) {
        throw new ConflictException('Idempotency key reused with different payload.');
      }
      return existingAfterConflict.payment;
    }
  }

  async list(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    return payment;
  }

  async cancel(userId: string, paymentId: string) {
    const payment = await this.findById(userId, paymentId);
    if (!PaymentStateMachine.canTransition(payment.status as PaymentStatus, PaymentStatus.CANCELLED)) {
      throw new BadRequestException('Payment cannot be cancelled in its current state.');
    }

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'CANCELLED' },
    });
  }

  async processPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    const result = await this.provider.execute({
      id: payment.id,
      amountMinor: payment.amountMinor,
      description: payment.description,
      currency: payment.currency,
    });

    if (result.status === 'APPROVED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'APPROVED',
          providerReference: result.providerReference ?? payment.providerReference,
        },
      });

      await this.prisma.ledgerEntry.create({
        data: {
          accountId: payment.accountId,
          paymentId: payment.id,
          entryType: 'DEBIT',
          amountMinor: payment.amountMinor,
        },
      });

      return result;
    }

    if (result.status === 'REJECTED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REJECTED' },
      });
      return result;
    }

    if (result.status === 'TIMEOUT') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'TIMEOUT' },
      });
      return result;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });

    return result;
  }
}
