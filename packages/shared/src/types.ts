export type PaymentStatusValue =
  'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FAILED' | 'TIMEOUT';

export type LedgerEntryType = 'CREDIT' | 'DEBIT' | 'ADJUSTMENT';

export interface CreatePaymentInput {
  accountId: string;
  amountMinor: number;
  currency: string;
  description: string;
  idempotencyKey: string;
}

export interface PaymentProviderResult {
  status: 'APPROVED' | 'REJECTED' | 'TIMEOUT' | 'TEMPORARY_ERROR' | 'PERMANENT_ERROR';
  providerReference?: string;
  message?: string;
}
