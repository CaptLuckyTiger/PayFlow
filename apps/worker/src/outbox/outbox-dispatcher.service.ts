import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus as DatabasePaymentStatus } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Agent } from 'undici';
import type { LookupFunction } from 'node:net';
import {
  FakePaymentProvider,
  parseAllowedWebhookHosts,
  resolvePublicWebhookAddresses,
  signWebhookPayload,
  validateWebhookUrl,
} from '@payflow/shared';
import { PrismaService } from '../prisma/prisma.service';

const QUEUE_NAME = 'payflow-outbox';
const MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 5 * 60 * 1000;
const CLAIM_HEARTBEAT_MS = 30 * 1000;

const lookupPublicWebhookHost: LookupFunction = (hostname, options, callback) => {
  void resolvePublicWebhookAddresses(hostname)
    .then((addresses) => {
      if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    })
    .catch((error: unknown) => {
      const dnsError = new Error(
        error instanceof Error ? error.message : 'Unable to resolve a public webhook destination.',
      ) as NodeJS.ErrnoException;
      dnsError.code = 'EHOSTUNREACH';
      callback(dnsError, '', 0);
    });
};

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly redis: IORedis;
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly webhookAgent: Agent;
  private pollTimer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FakePaymentProvider,
    private readonly config: ConfigService,
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
          : this.processEvent(job),
      {
        connection: this.redis,
        concurrency: 5,
      },
    );
    this.webhookAgent = new Agent({ connect: { lookup: lookupPublicWebhookHost } });
  }

  async onModuleInit(): Promise<void> {
    this.worker.on('completed', (job) => {
      this.logger.log(`Processed outbox event ${job.data.eventId}`);
    });
    this.worker.on('failed', (job, error) => {
      void this.handleFailedJob(job, error).catch((failure: unknown) => {
        this.logger.error('Unable to persist a terminal outbox job failure.', failure);
      });
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
    await Promise.all([this.worker.close(), this.queue.close(), this.webhookAgent.close()]);
    await this.redis.quit();
  }

  private async dispatchPendingEvents(): Promise<void> {
    if (this.polling) {
      return;
    }

    this.polling = true;
    try {
      const staleClaim = new Date(Date.now() - CLAIM_LEASE_MS);
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          OR: [
            { status: 'PENDING' },
            { status: 'PROCESSING', claimedAt: null },
            { status: 'PROCESSING', claimedAt: { lte: staleClaim } },
          ],
        },
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

  private async processEvent(job: Job): Promise<void> {
    const eventId = job.data.eventId as string;
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status === 'PUBLISHED' || event.status === 'FAILED') {
      return;
    }

    const staleClaim = new Date(Date.now() - CLAIM_LEASE_MS);
    let claimToken = typeof job.data.claimToken === 'string' ? job.data.claimToken : undefined;
    const ownsLiveClaim =
      event.status === 'PROCESSING' &&
      claimToken !== undefined &&
      event.claimToken === claimToken &&
      event.claimedAt !== null &&
      event.claimedAt > staleClaim;

    if (ownsLiveClaim) {
      const renewed = await this.prisma.outboxEvent.updateMany({
        where: { id: eventId, status: 'PROCESSING', claimToken },
        data: { claimedAt: new Date(), attempts: { increment: 1 } },
      });
      if (renewed.count === 0) {
        return;
      }
    } else {
      claimToken = randomUUID();
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: {
          id: eventId,
          OR: [
            { status: 'PENDING' },
            { status: 'PROCESSING', claimedAt: null },
            { status: 'PROCESSING', claimedAt: { lte: staleClaim } },
          ],
        },
        data: {
          status: 'PROCESSING',
          claimedAt: new Date(),
          claimToken,
          attempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) {
        return;
      }
      await job.updateData({ ...job.data, claimToken });
    }

    if (event.eventType !== 'payment.requested') {
      await this.prisma.outboxEvent.updateMany({
        where: { id: eventId, status: 'PROCESSING', claimToken },
        data: {
          status: 'FAILED',
          claimedAt: null,
          claimToken: null,
          lastError: `Unsupported event type: ${event.eventType}`,
        },
      });
      return;
    }

    const heartbeat = setInterval(() => {
      void this.prisma.outboxEvent
        .updateMany({
          where: { id: eventId, status: 'PROCESSING', claimToken },
          data: { claimedAt: new Date() },
        })
        .catch((error: unknown) => {
          this.logger.error(`Unable to renew outbox claim ${eventId}.`, error);
        });
    }, CLAIM_HEARTBEAT_MS);

    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: event.aggregateId },
      });
      if (!payment) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: eventId, status: 'PROCESSING', claimToken },
          data: {
            status: 'FAILED',
            claimedAt: null,
            claimToken: null,
            lastError: 'Payment not found for outbox event.',
          },
        });
        return;
      }

      if (payment.status === DatabasePaymentStatus.CANCELLED) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: eventId, status: 'PROCESSING', claimToken },
          data: { status: 'PUBLISHED', publishedAt: new Date(), claimedAt: null, claimToken: null },
        });
        return;
      }

      if (payment.status === DatabasePaymentStatus.PENDING) {
        const claimedPayment = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: DatabasePaymentStatus.PENDING },
          data: { status: DatabasePaymentStatus.PROCESSING },
        });
        if (claimedPayment.count === 0) {
          const currentPayment = await this.prisma.payment.findUnique({ where: { id: payment.id } });
          if (!currentPayment || currentPayment.status !== DatabasePaymentStatus.PROCESSING) {
            await this.prisma.outboxEvent.updateMany({
              where: { id: eventId, status: 'PROCESSING', claimToken },
              data: {
                status: 'PUBLISHED',
                publishedAt: new Date(),
                claimedAt: null,
                claimToken: null,
              },
            });
            return;
          }
        }
      } else if (payment.status !== DatabasePaymentStatus.PROCESSING) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: eventId, status: 'PROCESSING', claimToken },
          data: { status: 'PUBLISHED', publishedAt: new Date(), claimedAt: null, claimToken: null },
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
        const completedClaim = await tx.outboxEvent.updateMany({
          where: { id: eventId, status: 'PROCESSING', claimToken },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            claimedAt: null,
            claimToken: null,
            lastError: null,
          },
        });
        if (completedClaim.count !== 1) {
          return;
        }

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
      });
    } finally {
      clearInterval(heartbeat);
    }
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

    try {
      validateWebhookUrl(
        delivery.endpoint.url,
        parseAllowedWebhookHosts(this.config.get<string>('ALLOWED_WEBHOOK_HOSTS')),
      );
    } catch (error) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'REJECTED',
          lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Invalid webhook destination.',
        },
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
    const requestOptions: RequestInit & { dispatcher: Agent } = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayFlow-Timestamp': String(signed.timestamp),
        'X-PayFlow-Signature': signed.signature,
      },
      body: signed.body,
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
      dispatcher: this.webhookAgent,
    };
    const response = await fetch(delivery.endpoint.url, requestOptions);
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
    await this.prisma.$transaction(async (tx) => {
      const claimToken = job.data.claimToken as string | undefined;
      const failed = await tx.outboxEvent.updateMany({
        where: {
          id: eventId,
          status: 'PROCESSING',
          ...(claimToken ? { claimToken } : {}),
        },
        data: {
          status: 'FAILED',
          claimedAt: null,
          claimToken: null,
          lastError: error.message.slice(0, 1000),
        },
      });
      if (failed.count === 1) {
        const event = await tx.outboxEvent.findUnique({ where: { id: eventId } });
        if (event) {
          await tx.payment.updateMany({
            where: {
              id: event.aggregateId,
              status: DatabasePaymentStatus.PROCESSING,
            },
            data: { status: DatabasePaymentStatus.FAILED },
          });
        }
      }
    });
  }
}
