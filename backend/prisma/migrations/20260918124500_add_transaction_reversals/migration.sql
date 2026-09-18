-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "reversedById" INTEGER,
ADD COLUMN "reversalReason" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
