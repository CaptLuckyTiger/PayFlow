import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptWebhookSecret, parseAllowedWebhookHosts, validateWebhookUrl } from '@payflow/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createEndpoint(userId: string, url: string, secret: string, active = true) {
    this.validateWebhookUrl(url);
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        userId,
        url,
        secret: encryptWebhookSecret(secret, this.getSecretKey()),
        active,
      },
    });
    return { ...endpoint, secret };
  }

  async listEndpoints(userId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        url: true,
        active: true,
        createdAt: true,
      },
    });
  }

  async deleteEndpoint(userId: string, endpointId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id: endpointId, userId } });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found.');
    }

    await this.prisma.webhookEndpoint.delete({ where: { id: endpointId } });
    return { deleted: true, id: endpointId };
  }

  async listDeliveries(userId: string, page: number, limit: number) {
    const where = { endpoint: { userId } };
    const [data, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        select: {
          id: true,
          endpointId: true,
          eventId: true,
          status: true,
          attempts: true,
          nextAttemptAt: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
          endpoint: { select: { id: true, url: true, active: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private validateWebhookUrl(url: string): void {
    try {
      validateWebhookUrl(url, parseAllowedWebhookHosts(this.config.get<string>('ALLOWED_WEBHOOK_HOSTS')));
    } catch (error) {
      throw new BadRequestException('Webhook destination is invalid.', { cause: error });
    }
  }

  private getSecretKey(): string {
    const key = this.config.get<string>('WEBHOOK_ENCRYPTION_KEY');
    if (!key) {
      throw new Error('WEBHOOK_ENCRYPTION_KEY is required to protect webhook secrets.');
    }
    if (key.trim().length < 32) {
      throw new Error('WEBHOOK_ENCRYPTION_KEY must be configured with at least 32 characters.');
    }
    return key;
  }
}
