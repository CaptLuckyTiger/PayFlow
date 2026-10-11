import { Money } from '@payflow/shared';
import { PaymentStateMachine, PaymentStatus } from '@payflow/shared';

describe('Money', () => {
  it('validates positive integer minors', () => {
    expect(() => Money.fromMinor(0, 'USD')).toThrow();
    expect(() => Money.fromDecimal(-50, 'USD')).toThrow();
    expect(Money.fromMinor(1500, 'USD').minor).toBe(1500);
  });

  it('adds and subtracts within same currency', () => {
    const total = Money.fromMinor(1500, 'USD').add(Money.fromMinor(2500, 'USD'));
    expect(total.minor).toBe(4000);
    expect(() => Money.fromMinor(100, 'USD').add(Money.fromMinor(100, 'BRL'))).toThrow();
  });
});

describe('PaymentStateMachine', () => {
  it('allows valid transitions', () => {
    expect(PaymentStateMachine.canTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING)).toBe(true);
    expect(PaymentStateMachine.canTransition(PaymentStatus.PROCESSING, PaymentStatus.APPROVED)).toBe(true);
    expect(PaymentStateMachine.canTransition(PaymentStatus.APPROVED, PaymentStatus.CANCELLED)).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(() => PaymentStateMachine.transition(PaymentStatus.REJECTED, PaymentStatus.PROCESSING)).toThrow();
  });
});
