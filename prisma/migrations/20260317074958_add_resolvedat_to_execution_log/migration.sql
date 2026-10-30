-- AlterTable
ALTER TABLE "ExecutionLog" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExecutionLog_resolvedAt_idx" ON "ExecutionLog"("resolvedAt");
