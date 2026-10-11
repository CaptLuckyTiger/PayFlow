import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { signWebhookPayload } from '@payflow/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async createEndpoint(userId: string, url: string, secret: string, active = true) {
    this.validateWebhookUrl(url);
    return this.prisma.webhookEndpoint.create({
      data: {
        userId,
        url,
        secret,
        active,
      },
    });
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

  async listDeliveries(userId: string) {
    return this.prisma.webhookDelivery.findMany({
      where: {
        endpoint: { userId },
      },
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
        endpoint: {
          select: {
            id: true,
            url: true,
            active: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async notify(endpointId: string, eventId: string, payload: Record<string, unknown>) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found.');
    }

    const signedPayload = signWebhookPayload(endpoint.secret, eventId, payload);

    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        endpointId,
        eventId,
        status: 'PENDING',
        attempts: 0,
      },
    });

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PayFlow-Timestamp': String(signedPayload.timestamp),
          'X-PayFlow-Signature': signedPayload.signature,
        },
        body: signedPayload.body,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}.`);
      }

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', attempts: 1 },
      });

      return { ok: true, deliveryId: delivery.id };
    } catch (error) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          attempts: 1,
          lastError: error instanceof Error ? error.message : 'Unknown webhook failure',
        },
      });
      return { ok: false, deliveryId: delivery.id };
    }
  }

  private validateWebhookUrl(url: string): void {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only http/https endpoints are allowed.');
      }

      if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new Error('Localhost webhook endpoints are not allowed.');
      }

      if (
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('172.16.')
      ) {
        throw new Error('Private or link-local endpoints are not allowed.');
      }

      if (hostname === 'metadata.google.internal' || hostname.endsWith('.internal')) {
        throw new Error('Cloud metadata endpoints are not allowed.');
      }
    } catch (error) {
      throw new BadRequestException('Webhook destination is invalid.', { cause: error });
    }
  }
}
