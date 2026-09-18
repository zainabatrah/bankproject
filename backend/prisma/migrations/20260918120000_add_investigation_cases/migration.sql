-- CreateTable
CREATE TABLE "InvestigationCase" (
    "id" SERIAL NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'INVESTIGATING',
    "assignedAnalyst" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "outcome" TEXT,
    "alertId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestigationCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationCase_alertId_key" ON "InvestigationCase"("alertId");

-- CreateIndex
CREATE INDEX "InvestigationCase_status_idx" ON "InvestigationCase"("status");

-- CreateIndex
CREATE INDEX "InvestigationCase_createdAt_idx" ON "InvestigationCase"("createdAt");

-- AddForeignKey
ALTER TABLE "InvestigationCase" ADD CONSTRAINT "InvestigationCase_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "FraudAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
