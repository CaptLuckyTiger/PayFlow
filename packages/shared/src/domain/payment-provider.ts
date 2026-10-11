import { randomUUID } from 'node:crypto';
import type { PaymentProviderResult } from '../types';

export interface PaymentProvider {
  execute(payment: {
    id: string;
    amountMinor: number;
    description: string;
    currency: string;
  }): Promise<PaymentProviderResult>;
}

export class FakePaymentProvider implements PaymentProvider {
  async execute(payment: {
    id: string;
    amountMinor: number;
    description: string;
    currency: string;
  }): Promise<PaymentProviderResult> {
    const mode = (process.env.PAYMENT_PROVIDER_MODE ?? 'approved').toLowerCase();
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (payment.description.toLowerCase().includes('timeout') || mode === 'timeout') {
      return { status: 'TIMEOUT', providerReference: randomUUID(), message: 'Provider timeout.' };
    }
    if (payment.description.toLowerCase().includes('reject') || mode === 'reject') {
      return {
        status: 'REJECTED',
        providerReference: randomUUID(),
        message: 'Provider rejected payment.',
      };
    }
    if (mode === 'temporary_error') {
      return {
        status: 'TEMPORARY_ERROR',
        providerReference: randomUUID(),
        message: 'Provider temporary failure.',
      };
    }
    if (mode === 'permanent_error') {
      return {
        status: 'PERMANENT_ERROR',
        providerReference: randomUUID(),
        message: 'Provider permanent failure.',
      };
    }

    return {
      status: 'APPROVED',
      providerReference: randomUUID(),
      message: 'Approved by fake provider.',
    };
  }
}
