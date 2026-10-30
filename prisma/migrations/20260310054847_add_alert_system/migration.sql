-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "query" TEXT NOT NULL,
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
    "thresholdOperator" TEXT NOT NULL,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "thresholdColumnName" TEXT,
    "notificationChannels" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastExecutedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL,
    "alertRuleId" TEXT NOT NULL,
    "queryResult" TEXT,
    "thresholdMet" BOOLEAN NOT NULL DEFAULT false,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "executionTimeMs" INTEGER NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertRule_clusterId_idx" ON "AlertRule"("clusterId");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE INDEX "AlertRule_createdAt_idx" ON "AlertRule"("createdAt");

-- CreateIndex
CREATE INDEX "ExecutionLog_alertRuleId_idx" ON "ExecutionLog"("alertRuleId");

-- CreateIndex
CREATE INDEX "ExecutionLog_executedAt_idx" ON "ExecutionLog"("executedAt");

-- CreateIndex
CREATE INDEX "ExecutionLog_thresholdMet_idx" ON "ExecutionLog"("thresholdMet");

-- CreateIndex
CREATE INDEX "SavedQuery_userId_idx" ON "SavedQuery"("userId");

-- CreateIndex
CREATE INDEX "SavedQuery_createdAt_idx" ON "SavedQuery"("createdAt");

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuery" ADD CONSTRAINT "SavedQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
