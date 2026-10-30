import { logger } from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import { executeClickHouseQuery } from "@/lib/clickhouse/index";
import { withClusterAccess } from "@/lib/auth/middleware";

/**
 * GET /api/clusters/[id]/logical-clusters
 * Cluster Cluster(distributed cluster) 
 */
export const GET = withClusterAccess(
  async (
    _request,
    { params },
    user
  ) => {
    try {
      const { id } = await params;
            const userId = user?.id;

      // node_count matters: ClickHouse's default config often registers a
      // built-in cluster entry (commonly named "default") even on a
      // standalone single-node server. Treating that as a real distributed
      // cluster and attaching ON CLUSTER to DDL fails on such servers (no
      // Keeper/distributed-DDL coordination configured). Callers must only
      // apply ON CLUSTER for entries where node_count > 1.
      const clustersQuery = `
        SELECT cluster, count() AS node_count
        FROM system.clusters
        GROUP BY cluster
        ORDER BY cluster
      `;

      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000));
      const clustersResult = await Promise.race([
        executeClickHouseQuery<{ cluster: string; node_count: number | string }>(id, clustersQuery, undefined, userId),
        timeout,
      ]);
      const logicalClusters = (clustersResult || []).map((row) => ({
        name: row.cluster,
        nodeCount: Number(row.node_count),
        physicalClusterId: id
      }));

      return NextResponse.json(logicalClusters);
    } catch (error) {
      logger.error("Failed to fetch logical clusters:", error);
      return NextResponse.json(
        { error: "Failed to fetch logical clusters", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }
);
