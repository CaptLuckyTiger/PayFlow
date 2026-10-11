import { Money } from '@payflow/shared';
import { PaymentStateMachine, PaymentStatus } from '@payflow/shared';
import { ConfigService } from '@nestjs/config';
import { getRequiredJwtSecret } from '../../src/auth/jwt-secrets';

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
    expect(PaymentStateMachine.canTransition(PaymentStatus.APPROVED, PaymentStatus.CANCELLED)).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(() => PaymentStateMachine.transition(PaymentStatus.REJECTED, PaymentStatus.PROCESSING)).toThrow();
  });
});

describe('JWT secrets', () => {
  it('requires configured secrets of at least 32 characters', () => {
    expect(() => getRequiredJwtSecret(new ConfigService({ JWT_SECRET: 'short' }), 'JWT_SECRET')).toThrow(
      /at least 32 characters/,
    );
    expect(getRequiredJwtSecret(new ConfigService({ JWT_SECRET: 'a'.repeat(32) }), 'JWT_SECRET')).toBe('a'.repeat(32));
  });
});
