import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { PrismaService } from './prisma/prisma.service';
import { OutboxDispatcherService } from './outbox/outbox-dispatcher.service';
import { FakePaymentProvider } from '@payflow/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(__dirname, '../../../.env'), resolve(__dirname, '../../../.env.local')],
    }),
  ],
  providers: [
    PrismaService,
    { provide: FakePaymentProvider, useFactory: () => new FakePaymentProvider() },
    OutboxDispatcherService,
  ],
})
export class WorkerModule {}
