import { NextRequest, NextResponse } from "next/server";
import { executeClickHouseQuery } from "@/lib/clickhouse/index";
import { DDLQueries } from "@/lib/clickhouse/queries/ddl";
import { withClusterAccess } from "@/lib/auth/middleware";
import { formatSQL, formatGrantsList } from "@/lib/utils/sql-formatter";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/clusters/[id]/ddl?type=user&name=username
 * GET /api/clusters/[id]/ddl?type=role&name=rolename
 * GET /api/clusters/[id]/ddl?type=profile&name=profilename
 *
 * Retrieves ClickHouse DDL
 */
export const GET = withClusterAccess(
  async (
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> },
    user
  ) => {
    try {
      const { id } = await params;
      const userId = user?.id;
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type'); // user, role, profile
      const name = searchParams.get('name');

      if (!type || !name) {
        return NextResponse.json(
          { error: "Type and name are required" },
          { status: 400 }
        );
      }

      let ddlQuery: string;
      let grantsQuery: string | null = null;

      switch (type) {
        case 'user':
          ddlQuery = DDLQueries.getUserDDL(name);
          break;
        case 'role':
          ddlQuery = DDLQueries.getRoleDDL(name);
          grantsQuery = DDLQueries.getRoleGrants(name);
          break;
        case 'profile':
          ddlQuery = DDLQueries.getProfileDDL(name);
          break;
        default:
          return NextResponse.json(
            { error: "Invalid type. Must be 'user', 'role', or 'profile'" },
            { status: 400 }
          );
      }

 // Execute DDL query
      logger.debug(`[DDL API] Executing query:`, ddlQuery);
      const ddlResult = await executeClickHouseQuery<Record<string, string>>(id, ddlQuery, undefined, userId);
      logger.debug(`[DDL API] Query result:`, JSON.stringify(ddlResult, null, 2));

      let ddl = '';

      if (ddlResult && ddlResult.length > 0) {
        const firstRow = ddlResult[0];
        logger.debug(`[DDL API] First row keys:`, Object.keys(firstRow));

 // Try all possible column names returned by ClickHouse SHOW CREATE statements
        ddl = firstRow.statement ||
              firstRow.create_role_query ||
              firstRow.create_user_query ||
              firstRow.create_settings_profile_query ||
              firstRow['SHOW CREATE USER'] ||
              firstRow['SHOW CREATE ROLE'] ||
              firstRow['SHOW CREATE SETTINGS PROFILE'] ||
              Object.values(firstRow)[0] || // use the first value
              '';

        logger.debug(`[DDL API] Extracted DDL:`, ddl);
      } else {
        logger.debug(`[DDL API] No results returned`);
      }

 // Fetch Role GRANTS if applicable
      let grants = '';
      if (grantsQuery) {
        logger.debug(`[DDL API] Executing grants query:`, grantsQuery);
        const grantsResult = await executeClickHouseQuery<Record<string, string>>(id, grantsQuery, undefined, userId);
        logger.debug(`[DDL API] Grants result:`, JSON.stringify(grantsResult, null, 2));

        if (grantsResult && grantsResult.length > 0) {
          grants = grantsResult.map((row) => {
            return row.grant || row.query || String(Object.values(row)[0] ?? '') || '';
          }).filter(g => g).join('\n');
        }
      }

      // Format DDL and grants
      const formattedDDL = formatSQL(ddl);
      const formattedGrants = formatGrantsList(grants);

      const combined = formattedGrants
        ? `${formattedDDL}\n\n-- Grants:\n${formattedGrants}`
        : formattedDDL;

      logger.debug(`[DDL API] Final combined DDL:`, combined);

      return NextResponse.json({
        ddl: formattedDDL,
        grants: formattedGrants,
        combined
      });
    } catch (error) {
      logger.error("Failed to fetch DDL:", error);
      return NextResponse.json(
        { error: "Failed to fetch DDL", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }
);
