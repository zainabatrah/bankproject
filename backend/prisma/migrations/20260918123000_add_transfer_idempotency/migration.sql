-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyFingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_senderAccountId_createdAt_idx" ON "Transaction"("senderAccountId", "createdAt");
