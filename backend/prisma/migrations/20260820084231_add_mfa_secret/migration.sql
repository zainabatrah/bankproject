-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaSecretEncrypted" TEXT,
ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3);
