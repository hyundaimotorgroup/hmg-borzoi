ALTER TABLE "AlertRule"
ADD COLUMN     "thresholds" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "ExecutionLog"
ADD COLUMN     "matchedSeverity" TEXT;
