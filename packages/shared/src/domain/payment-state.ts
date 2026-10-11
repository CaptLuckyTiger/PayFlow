export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
}

export class PaymentStateMachine {
  private static readonly transitions: Record<PaymentStatus, PaymentStatus[]> = {
    [PaymentStatus.PENDING]: [PaymentStatus.PROCESSING, PaymentStatus.REJECTED, PaymentStatus.CANCELLED],
    [PaymentStatus.PROCESSING]: [
      PaymentStatus.APPROVED,
      PaymentStatus.REJECTED,
      PaymentStatus.TIMEOUT,
      PaymentStatus.FAILED,
    ],
    [PaymentStatus.APPROVED]: [PaymentStatus.CANCELLED],
    [PaymentStatus.REJECTED]: [],
    [PaymentStatus.CANCELLED]: [],
    [PaymentStatus.FAILED]: [PaymentStatus.PROCESSING],
    [PaymentStatus.TIMEOUT]: [PaymentStatus.PROCESSING],
  };

  static canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    return this.transitions[from]?.includes(to) ?? false;
  }

  static transition(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
    if (!this.canTransition(from, to)) {
      throw new Error(`Invalid payment transition: ${from} -> ${to}`);
    }
    return to;
  }
}
