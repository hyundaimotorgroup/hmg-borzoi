CREATE INDEX IF NOT EXISTS "AlertRule_createdBy_idx" ON "AlertRule"("createdBy");

UPDATE "AlertRule"
SET "createdBy" = (
  SELECT "id"
  FROM "User"
  WHERE "role" = 'admin'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "createdBy" IS NULL;
