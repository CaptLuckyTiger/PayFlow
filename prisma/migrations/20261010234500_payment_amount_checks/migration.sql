ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_amountMinor_positive_check" CHECK ("amountMinor" > 0);

ALTER TABLE "LedgerEntry"
ADD CONSTRAINT "LedgerEntry_amountMinor_positive_check" CHECK ("amountMinor" > 0);
