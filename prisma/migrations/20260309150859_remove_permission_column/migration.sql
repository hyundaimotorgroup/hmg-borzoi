-- RemoveColumn
ALTER TABLE "UserClusterAccess" DROP COLUMN IF EXISTS "permission";

-- DropTable (if exists from old schema)
DROP TABLE IF EXISTS "Alert";
