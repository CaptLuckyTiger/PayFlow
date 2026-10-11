ALTER TABLE "OutboxEvent"
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "claimToken" TEXT;

CREATE INDEX "OutboxEvent_status_claimedAt_idx"
ON "OutboxEvent"("status", "claimedAt");

CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_jti_key" ON "RefreshToken"("jti");
CREATE INDEX "RefreshToken_userId_revokedAt_expiresAt_idx"
ON "RefreshToken"("userId", "revokedAt", "expiresAt");

ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_accountId_fkey";

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_accountId_userId_fkey"
FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId")
ON DELETE RESTRICT ON UPDATE CASCADE;
