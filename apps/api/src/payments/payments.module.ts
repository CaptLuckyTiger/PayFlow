import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FakePaymentProvider } from './fake-payment-provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: FakePaymentProvider, useFactory: () => new FakePaymentProvider() }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
