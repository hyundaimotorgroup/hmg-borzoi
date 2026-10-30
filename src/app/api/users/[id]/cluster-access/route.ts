import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole, withAudit } from "@/lib/auth/middleware";
import { encryptPassword } from "@/lib/clickhouse/index";
import { credentialCache } from "@/lib/cache/credential-cache";
import { parseRequestJson, userClusterAccessSchema } from "@/lib/validation";
import { USER_CLUSTER_ACCESS_SAFE_SELECT } from "@/lib/prisma-selects";

/**
 * GET /api/users/[id]/cluster-access
 * Cluster
 */
export const GET = withRole(async (_request: NextRequest, { params }) => {
  try {
    const { id } = await params;

    const userAccess = await prisma.userClusterAccess.findMany({
      where: { userId: id },
      select: USER_CLUSTER_ACCESS_SAFE_SELECT,
    });

    return NextResponse.json(userAccess);
  } catch (error) {
    logger.error("Failed to fetch user cluster access:", error);
    return NextResponse.json(
      { error: "Failed to fetch user cluster access" },
      { status: 500 }
    );
  }
}, ['admin']);

/**
 * PUT /api/users/[id]/cluster-access
 * Cluster
 *
 * Body:
 * {
 *   "clusterAccess": [
 *     {
 *       "clusterId": "...",
 *       "chUsername": "...",
 *       "chPassword": "..."   // Required when creating new access, omit to keep the existing password
 *     }
 *   ]
 * }
 */
export const PUT = withRole(
  withAudit(async (request: NextRequest, { params }) => {
    try {
      const { id } = await params;
      logger.debug('[PUT cluster-access] User ID:', id);

      const parsed = await parseRequestJson(request, userClusterAccessSchema);
      if (!parsed.success) {
        return parsed.response;
      }
      const { clusterAccess } = parsed.data;
      logger.debug(`[PUT cluster-access] Received ${clusterAccess?.length ?? 0} cluster access entries for clusters: ${clusterAccess?.map((access) => access.clusterId).join(', ') ?? '(none)'}`);

      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true }
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      const isAdminTarget = targetUser.role === 'admin';

      const requestedClusterIds = Array.isArray(clusterAccess)
        ? Array.from(new Set(clusterAccess.map((access: { clusterId: string }) => access.clusterId).filter(Boolean)))
        : [];

      const sharedClusters = requestedClusterIds.length > 0
        ? await prisma.cluster.findMany({
            where: { id: { in: requestedClusterIds } },
            select: { id: true, username: true, password: true },
          })
        : [];
      const sharedClusterMap = new Map(sharedClusters.map((cluster) => [cluster.id, cluster]));

 // ()
      const existingAccess = await prisma.userClusterAccess.findMany({
        where: { userId: id },
        select: { clusterId: true, chPassword: true }
      });
      const existingPasswordMap = new Map(
        existingAccess.map(a => [a.clusterId, a.chPassword])
      );

      if (clusterAccess && clusterAccess.length > 0) {
        for (const access of clusterAccess) {
          if (isAdminTarget) {
            const sharedCluster = sharedClusterMap.get(access.clusterId);
            if (!sharedCluster) {
              return NextResponse.json(
                { error: `Cluster ${access.clusterId} not found` },
                { status: 400 }
              );
            }

            if (!sharedCluster.username || !sharedCluster.password) {
              return NextResponse.json(
                { error: `Cluster ${access.clusterId} is missing shared credentials in Cluster.` },
                { status: 400 }
              );
            }

            continue;
          }

          const hasPassword = access.chPassword && access.chPassword.trim() !== '';
          const hasStoredPassword = Boolean(existingPasswordMap.get(access.clusterId));

          if (!access.chUsername) {
            return NextResponse.json(
              { error: `ClickHouse username is required for cluster ${access.clusterId}` },
              { status: 400 }
            );
          }

          if (!hasPassword && !hasStoredPassword) {
            return NextResponse.json(
              { error: `ClickHouse password is required for cluster ${access.clusterId} when no stored password exists.` },
              { status: 400 }
            );
          }
        }
      }

 //
      logger.debug('[PUT cluster-access] Deleting existing access...');
      await prisma.userClusterAccess.deleteMany({
        where: { userId: id },
      });

 //
      if (clusterAccess && clusterAccess.length > 0) {
        const dataToCreate = await Promise.all(
          clusterAccess.map(async (access: {
            clusterId: string;
            chUsername?: string;
            chPassword?: string;
          }, index: number) => {
            logger.debug(`\n[PUT cluster-access] Processing access[${index}]:`);
            logger.debug(`  - Cluster ID: ${access.clusterId}`);
            logger.debug(`  - User ID: ${id}`);
            logger.debug(`  - CH Username: ${access.chUsername || '(not provided)'}`);
            logger.debug(`  - CH Password provided: ${access.chPassword ? (access.chPassword.trim() !== '' ? 'YES (new password)' : 'EMPTY (keep existing)') : 'NO (null)'}`);

            if (isAdminTarget) {
              const sharedCluster = sharedClusterMap.get(access.clusterId);
              if (!sharedCluster) {
                throw new Error(`Cluster ${access.clusterId} not found`);
              }

              logger.debug(`  ♻️  Admin role detected - using shared cluster credentials`);
              return {
                userId: id,
                clusterId: access.clusterId,
                chUsername: sharedCluster.username,
                chPassword: sharedCluster.password,
              };
            }

            let finalPassword: string | null = null;
            if (access.chPassword && access.chPassword.trim() !== '') {
              logger.debug(`  ✅ Encrypting new password (length: ${access.chPassword.length})`);
              finalPassword = await encryptPassword(access.chPassword);
            } else if (access.chPassword === '' && existingPasswordMap.has(access.clusterId)) {
              const existingPwd = existingPasswordMap.get(access.clusterId);
              logger.debug(`  ♻️  Keeping existing password: ${existingPwd ? 'YES' : 'NO'}`);
              finalPassword = existingPwd || null;
            } else {
              logger.debug(`  ⚠️  No password set (will be null)`);
            }

            const result = {
              userId: id,
              clusterId: access.clusterId,
              chUsername: access.chUsername || null,
              chPassword: finalPassword,
            };

            logger.debug(`  📝 Final data: clusterId=${result.clusterId}, chUsername=${result.chUsername || '(none)'}, chPassword=${result.chPassword ? '[ENCRYPTED]' : 'null'}`);

            return result;
          })
        );

        logger.debug(`[PUT cluster-access] Creating ${dataToCreate.length} access entries for clusters: ${dataToCreate.map((d) => d.clusterId).join(', ')}`);
        await prisma.userClusterAccess.createMany({ data: dataToCreate });

        const { clickHouseClientPool } = await import('@/lib/cache/client-pool');
        for (const access of dataToCreate) {
          credentialCache.invalidate(id, access.clusterId);
          clickHouseClientPool.invalidateCluster(access.clusterId);
        }
      }

 //
      logger.debug('[PUT cluster-access] Fetching updated access...');
      const updatedAccess = await prisma.userClusterAccess.findMany({
        where: { userId: id },
        select: USER_CLUSTER_ACCESS_SAFE_SELECT,
      });

      logger.debug('[PUT cluster-access] Success! Updated access count:', updatedAccess.length);
      return NextResponse.json(updatedAccess);
    } catch (error) {
      logger.error("[PUT cluster-access] ERROR:", error);
      logger.error("[PUT cluster-access] Error stack:", error instanceof Error ? error.stack : 'No stack');
      return NextResponse.json(
        { error: "Failed to update user cluster access", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }, 'UPDATE_USER_CLUSTER_ACCESS', 'user'),
  ['admin']
);
