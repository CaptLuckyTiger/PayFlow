import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentStatus as DatabasePaymentStatus } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { FakePaymentProvider, signWebhookPayload } from '@payflow/shared';
import { PrismaService } from '../prisma/prisma.service';

const QUEUE_NAME = 'payflow-outbox';
const MAX_ATTEMPTS = 5;

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly redis: IORedis;
  private readonly queue: Queue;
  private readonly worker: Worker;
  private pollTimer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FakePaymentProvider,
  ) {
    this.redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(QUEUE_NAME, { connection: this.redis });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) =>
        job.name === 'deliver-webhook'
          ? this.processWebhookDelivery(job.data.deliveryId as string)
          : this.processEvent(job.data.eventId as string),
      {
        connection: this.redis,
        concurrency: 5,
      },
    );
  }

  async onModuleInit(): Promise<void> {
    this.worker.on('completed', (job) => {
      this.logger.log(`Processed outbox event ${job.data.eventId}`);
    });
    this.worker.on('failed', (job, error) => {
      void this.handleFailedJob(job, error);
    });

    await this.dispatchPendingEvents();
    this.pollTimer = setInterval(() => {
      void this.dispatchPendingEvents().catch((error: unknown) => {
        this.logger.error('Unable to dispatch pending outbox events.', error);
      });
    }, 2000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    await Promise.all([this.worker.close(), this.queue.close()]);
    await this.redis.quit();
  }

  private async dispatchPendingEvents(): Promise<void> {
    if (this.polling) {
      return;
    }

    this.polling = true;
    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { id: true },
      });
      const deliveries = await this.prisma.webhookDelivery.findMany({
        where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { id: true },
      });

      await Promise.all([
        ...events.map((event) =>
          this.queue.add(
            'process-event',
            { eventId: event.id },
            {
              jobId: event.id,
              attempts: MAX_ATTEMPTS,
              backoff: { type: 'exponential', delay: 1000 },
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
        ),
        ...deliveries.map((delivery) =>
          this.queue.add(
            'deliver-webhook',
            { deliveryId: delivery.id },
            {
              jobId: `webhook-${delivery.id}`,
              attempts: MAX_ATTEMPTS,
              backoff: { type: 'exponential', delay: 1000 },
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
        ),
      ]);
    } finally {
      this.polling = false;
    }
  }

  private async processEvent(eventId: string): Promise<void> {
    let event = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status === 'PUBLISHED' || event.status === 'FAILED') {
      return;
    }
    if (event.eventType !== 'payment.requested') {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'FAILED', lastError: `Unsupported event type: ${event.eventType}` },
      });
      return;
    }

    if (event.status === 'PENDING') {
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: { id: eventId, status: 'PENDING' },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      if (claimed.count === 0) {
        event = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
        if (!event || event.status !== 'PROCESSING') {
          return;
        }
      }
    } else {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: { attempts: { increment: 1 } },
      });
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: event.aggregateId },
    });
    if (!payment) {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'FAILED', lastError: 'Payment not found for outbox event.' },
      });
      return;
    }

    if (payment.status === DatabasePaymentStatus.CANCELLED) {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      return;
    }

    if (payment.status === DatabasePaymentStatus.PENDING) {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: DatabasePaymentStatus.PENDING },
        data: { status: DatabasePaymentStatus.PROCESSING },
      });
    } else if (payment.status !== DatabasePaymentStatus.PROCESSING) {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      return;
    }

    const result = await this.provider.execute({
      id: payment.id,
      amountMinor: payment.amountMinor,
      description: payment.description,
      currency: payment.currency,
    });

    if (result.status === 'TEMPORARY_ERROR') {
      throw new Error(result.message ?? 'Payment provider temporary failure.');
    }

    const finalStatus: DatabasePaymentStatus =
      result.status === 'APPROVED'
        ? DatabasePaymentStatus.APPROVED
        : result.status === 'REJECTED'
          ? DatabasePaymentStatus.REJECTED
          : result.status === 'TIMEOUT'
            ? DatabasePaymentStatus.TIMEOUT
            : DatabasePaymentStatus.FAILED;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: DatabasePaymentStatus.PROCESSING },
        data: {
          status: finalStatus,
          providerReference: result.providerReference ?? payment.providerReference,
        },
      });

      if (updated.count === 1 && finalStatus === DatabasePaymentStatus.APPROVED) {
        await tx.ledgerEntry.upsert({
          where: {
            paymentId_entryType: {
              paymentId: payment.id,
              entryType: 'DEBIT',
            },
          },
          create: {
            accountId: payment.accountId,
            paymentId: payment.id,
            entryType: 'DEBIT',
            amountMinor: payment.amountMinor,
          },
          update: {},
        });
      }

      if (updated.count === 1) {
        const endpoints = await tx.webhookEndpoint.findMany({
          where: { userId: payment.userId, active: true },
          select: { id: true },
        });
        if (endpoints.length > 0) {
          await tx.webhookDelivery.createMany({
            data: endpoints.map((endpoint) => ({
              endpointId: endpoint.id,
              eventId,
            })),
            skipDuplicates: true,
          });
        }
      }

      await tx.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null },
      });
    });
  }

  private async processWebhookDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });
    if (!delivery || delivery.status === 'SENT' || delivery.status === 'REJECTED') {
      return;
    }
    if (!delivery.endpoint.active) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'REJECTED', lastError: 'Webhook endpoint is inactive.' },
      });
      return;
    }

    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: delivery.eventId },
    });
    if (!event) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', lastError: 'Outbox event not found for webhook delivery.' },
      });
      return;
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: event.aggregateId },
    });
    if (!payment) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', lastError: 'Payment not found for webhook delivery.' },
      });
      return;
    }

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts: { increment: 1 } },
    });
    const payload = {
      type: 'payment.updated',
      payment: {
        id: payment.id,
        status: payment.status,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        providerReference: payment.providerReference,
      },
    };
    const signed = signWebhookPayload(delivery.endpoint.secret, delivery.eventId, payload);
    const response = await fetch(delivery.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayFlow-Timestamp': String(signed.timestamp),
        'X-PayFlow-Signature': signed.signature,
      },
      body: signed.body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}.`);
    }

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'SENT', nextAttemptAt: null, lastError: null },
    });
  }

  private async handleFailedJob(job: Job | undefined, error: Error): Promise<void> {
    if (!job) {
      this.logger.error('Outbox job failed without job metadata.', error);
      return;
    }

    this.logger.error(`Outbox job ${job.id} failed: ${error.message}`);
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    if (job.name === 'deliver-webhook') {
      await this.prisma.webhookDelivery.updateMany({
        where: { id: job.data.deliveryId as string, status: 'PENDING' },
        data: {
          status: 'FAILED',
          nextAttemptAt: null,
          lastError: error.message.slice(0, 1000),
        },
      });
      return;
    }

    const eventId = job.data.eventId as string;
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'FAILED', lastError: error.message.slice(0, 1000) },
      });
      await tx.payment.updateMany({
        where: {
          id: event.aggregateId,
          status: DatabasePaymentStatus.PROCESSING,
        },
        data: { status: DatabasePaymentStatus.FAILED },
      });
    });
  }
}
