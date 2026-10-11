export class Money {
  private constructor(
    public readonly minor: number,
    public readonly currency: string,
  ) {
    if (!Number.isInteger(minor) || minor <= 0) {
      throw new Error('Monetary values must be positive integer minor units.');
    }
    if (!currency || currency.trim().length !== 3) {
      throw new Error('Currency must be a 3-letter ISO code.');
    }
  }

  static fromMinor(minor: number, currency: string): Money {
    return new Money(minor, currency.toUpperCase());
  }

  static fromDecimal(value: number, currency: string): Money {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Amount must be positive.');
    }
    return new Money(Math.round(value * 100), currency.toUpperCase());
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor - other.minor, this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch.');
    }
  }
}
