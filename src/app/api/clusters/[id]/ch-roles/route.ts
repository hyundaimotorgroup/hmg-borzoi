import { logger } from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import { executeClickHouseQuery, executeClickHouseCommand } from "@/lib/clickhouse/index";
import { RoleDDL } from "@/lib/clickhouse/queries/ddl";
import { quoteString } from "@/lib/clickhouse/utils";
import { withClusterAccess, withAudit } from "@/lib/auth/middleware";
import { hasRole } from "@/lib/auth/permissions";
import { logSqlCommandAudit } from "@/lib/auth/audit";
import type { CHSystemRole, CHGrant, CHProfileElement } from "@/types/clickhouse-system";
import {
  chRoleMutationSchema,
  DisallowedSqlStatementError,
  extractStatementCommandType,
  parseRequestJson,
  splitSqlStatements,
} from "@/lib/validation";

/**
 * GET /api/clusters/[id]/ch-roles
 * Fetch list of ClickHouse roles for the cluster
 */
export const GET = withClusterAccess(
  async (
    request,
    { params },
    user
  ) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(request.url);
      const logicalCluster = searchParams.get('logicalCluster');

 // Determine the FROM clause for each system table

 // If cluster specified, query across all cluster replicas (deduplication applied)
 // If no cluster specified, query the local node
      const fromRoles = logicalCluster
        ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.roles)`
        : 'system.roles';
      const fromGrants = logicalCluster
        ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.grants)`
        : 'system.grants';
      const fromProfileElements = logicalCluster
        ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.settings_profile_elements)`
        : 'system.settings_profile_elements';

 // Query to fetch roles from ClickHouse system.roles
      const rolesQuery = `
        SELECT
          name,
          id,
          storage
        FROM ${fromRoles}
        ORDER BY name
        ${logicalCluster ? 'LIMIT 1 BY name' : ''}
      `;

      logger.debug(`[DEBUG ch-roles] 🔍 Roles Query:\n${rolesQuery}`);
      const rolesResult = await executeClickHouseQuery<CHSystemRole>(id, rolesQuery, undefined, user?.id);
      const roles = rolesResult || [];
      logger.debug(`[DEBUG ch-roles] ✅ Found ${roles.length} roles:`, roles.map(r => r.name));

 // Build query to fetch grants
      const grantsQuery = `
        SELECT
          role_name,
          access_type,
          database,
          table,
          column,
          is_partial_revoke,
          grant_option
        FROM ${fromGrants}
        WHERE role_name IS NOT NULL
        ORDER BY role_name, access_type
        ${logicalCluster ? 'LIMIT 1 BY role_name, access_type, database, table' : ''}
      `;

      logger.debug(`[DEBUG ch-roles] 🔍 Grants Query:\n${grantsQuery}`);
      let grants: CHGrant[] = [];
      try {
        const grantsResult = await executeClickHouseQuery<CHGrant>(id, grantsQuery, undefined, user?.id);
        grants = grantsResult || [];
        logger.debug(`[API ch-roles] Cluster ${id}${logicalCluster ? ` (${logicalCluster})` : ''}: Found ${grants.length} grants`);
        logger.debug(`[DEBUG ch-roles] 📊 Grants Raw Data:`, JSON.stringify(grants, null, 2));
      } catch (error) {
        logger.warn("Failed to fetch grants (might not have permissions):", error);
      }

 // Fetch profiles assigned to roles (via system.settings_profile_elements)
      const roleProfilesQuery = `
        SELECT DISTINCT
          role_name,
          inherit_profile
        FROM ${fromProfileElements}
        WHERE role_name IS NOT NULL AND role_name != '' AND inherit_profile IS NOT NULL AND inherit_profile != ''
        ORDER BY role_name, inherit_profile
        ${logicalCluster ? 'LIMIT 1 BY role_name, inherit_profile' : ''}
      `;

      let roleProfiles: CHProfileElement[] = [];
      try {
        logger.debug(`[DEBUG ch-roles] 🔍 Role Profiles Query:\n${roleProfilesQuery}`);
        const profilesResult = await executeClickHouseQuery<CHProfileElement>(id, roleProfilesQuery, undefined, user?.id);
        roleProfiles = profilesResult || [];
        logger.debug(`[API ch-roles] Cluster ${id}${logicalCluster ? ` (${logicalCluster})` : ''}: Found ${roleProfiles.length} role profiles`);
        logger.debug(`[DEBUG ch-roles] 📊 Role Profiles Raw Data:`, JSON.stringify(roleProfiles, null, 2));
      } catch (error) {
        logger.warn("Failed to fetch role profiles (might not have permissions):", error);
      }

 // Combine grants and profiles with each role
      const rolesWithData = roles.map((role) => {
        logger.debug(`[DEBUG ch-roles] 🔍 Processing role: ${role.name}`);

        // Filter grants for the current role
        const roleGrantsFiltered = grants.filter(grant => grant.role_name === role.name);
        logger.debug(`[DEBUG ch-roles]   - Matching grants:`, roleGrantsFiltered);

        const roleGrants = [...new Set(roleGrantsFiltered.map((grant) => {
          let grantStr = grant.access_type;
          if (grant.database) grantStr += ` ON ${grant.database}`;
          if (grant.table) grantStr += `.${grant.table}`;
          if (grant.column) grantStr += `(${grant.column})`;
          return grantStr;
        }))];
        logger.debug(`[DEBUG ch-roles]   - Formatted grants:`, roleGrants);

        // Filter profiles for the current role
        const roleProfilesFiltered = roleProfiles.filter(rp => rp.role_name === role.name);
        logger.debug(`[DEBUG ch-roles]   - Matching profiles:`, roleProfilesFiltered);

        const profiles = roleProfilesFiltered.map(rp => rp.inherit_profile).filter(Boolean) as string[];
        logger.debug(`[DEBUG ch-roles]   - Extracted profiles:`, profiles);

        logger.debug(`[API ch-roles] Role ${role.name}: ${roleGrants.length} grants, ${profiles.length} profiles`);

        const result = {
          id: role.name, // Use role name as ID for consistency
          name: role.name,
          storage: role.storage,
          grants: roleGrants,
          profiles: profiles
        };

        logger.debug(`[DEBUG ch-roles]   ✅ Final role object:`, JSON.stringify(result, null, 2));
        return result;
      });

      return NextResponse.json(rolesWithData);
    } catch (error) {
      logger.error("Failed to fetch ClickHouse roles:", error);
      return NextResponse.json(
        { error: "Failed to fetch ClickHouse roles", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/clusters/[id]/ch-roles
 * Create a ClickHouse role (requires Cluster admin + permission)
 */
export const POST = withClusterAccess(
  withAudit(
    async (
      request,
      { params },
      user
    ) => {
      try {
        const { id } = await params;
        const parsed = await parseRequestJson(request, chRoleMutationSchema);
        if (!parsed.success) {
          return parsed.response;
        }
        const { roleName, profiles, logicalCluster, sqlQuery } = parsed.data;

 // If raw SQL is provided, execute it directly

        if (typeof sqlQuery === "string" && sqlQuery.trim()) {
          if (!(await hasRole(user.id, ["admin"]))) {
            return NextResponse.json(
              { error: "Forbidden: Only admins may execute raw role SQL" },
              { status: 403 }
            );
          }

          let statements: string[];
          try {
            statements = splitSqlStatements(sqlQuery);
          } catch (error) {
            if (error instanceof DisallowedSqlStatementError) {
              return NextResponse.json(
                { error: "Disallowed SQL statement", details: error.message },
                { status: 400 }
              );
            }
            throw error;
          }
          const commandTypes = statements.map(extractStatementCommandType);

          for (const statement of statements) {
            const result = await executeClickHouseCommand(id, statement, user?.id);
            if (!result.success) {
              await logSqlCommandAudit({
                request,
                user,
                action: "CREATE_CH_ROLE",
                resourceType: "auth",
                resourceId: id,
                commandTypes,
                success: false,
              });
              return NextResponse.json(
                { error: "Failed to execute role SQL", details: result.error },
                { status: 500 }
              );
            }
          }

          await logSqlCommandAudit({
            request,
            user,
            action: "CREATE_CH_ROLE",
            resourceType: "auth",
            resourceId: id,
            commandTypes,
            success: true,
          });

          return NextResponse.json({ success: true, message: "Role SQL executed successfully" });
        }

        if (!roleName) {
          return NextResponse.json(
            { error: "Role name is required" },
            { status: 400 }
          );
        }

        if (!(await hasRole(user.id, ["admin"]))) {
          return NextResponse.json(
            { error: "Forbidden: Only admins may create roles" },
            { status: 403 }
          );
        }

 // Determine cluster name (physical or logical cluster)
        const clusterName = logicalCluster || undefined;

        logger.debug('🔍 [API ch-roles POST] Cluster Debug:');
        logger.debug('  - Cluster ID:', id);
        logger.debug('  - logicalCluster param:', logicalCluster);
        logger.debug('  - Final clusterName (ON CLUSTER):', clusterName);

 // Build CREATE ROLE query (with Profile if specified)
        const createRoleQuery = RoleDDL.createRole({
          roleName,
          profiles: profiles || [],
          clusterName
        });

        logger.debug('📝 [API ch-roles POST] Generated DDL:', createRoleQuery);

 // Execute the DDL statement
        const result = await executeClickHouseCommand(id, createRoleQuery, user?.id);

        if (!result.success) {
          return NextResponse.json(
            { error: "Failed to create role", details: result.error },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true, message: "Role created successfully" });
      } catch (error) {
        logger.error("Failed to create ClickHouse role:", error);
        return NextResponse.json(
          { error: "Failed to create ClickHouse role", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    },
    'CREATE_CH_ROLE',
    'auth'
  )
);

/**
 * PUT /api/clusters/[id]/ch-roles
 * Update a ClickHouse role (requires Cluster admin + permission)
 */
export const PUT = withClusterAccess(
  withAudit(
    async (
      request,
      { params },
      user
    ) => {
      try {
        const { id } = await params;
        const parsed = await parseRequestJson(request, chRoleMutationSchema);
        if (!parsed.success) {
          return parsed.response;
        }
        const { roleName, profiles, logicalCluster, sqlQuery } = parsed.data;

 // If raw SQL is provided, execute it directly

        if (typeof sqlQuery === "string" && sqlQuery.trim()) {
          if (!(await hasRole(user.id, ["admin"]))) {
            return NextResponse.json(
              { error: "Forbidden: Only admins may execute raw role SQL" },
              { status: 403 }
            );
          }

          let statements: string[];
          try {
            statements = splitSqlStatements(sqlQuery);
          } catch (error) {
            if (error instanceof DisallowedSqlStatementError) {
              return NextResponse.json(
                { error: "Disallowed SQL statement", details: error.message },
                { status: 400 }
              );
            }
            throw error;
          }
          const commandTypes = statements.map(extractStatementCommandType);

          for (const statement of statements) {
            const result = await executeClickHouseCommand(id, statement, user?.id);
            if (!result.success) {
              await logSqlCommandAudit({
                request,
                user,
                action: "UPDATE_CH_ROLE",
                resourceType: "auth",
                resourceId: id,
                commandTypes,
                success: false,
              });
              return NextResponse.json(
                { error: "Failed to execute role SQL", details: result.error },
                { status: 500 }
              );
            }
          }

          await logSqlCommandAudit({
            request,
            user,
            action: "UPDATE_CH_ROLE",
            resourceType: "auth",
            resourceId: id,
            commandTypes,
            success: true,
          });

          return NextResponse.json({ success: true, message: "Role SQL executed successfully" });
        }

        if (!roleName) {
          return NextResponse.json(
            { error: "Role name is required" },
            { status: 400 }
          );
        }

        if (!(await hasRole(user.id, ["admin"]))) {
          return NextResponse.json(
            { error: "Forbidden: Only admins may update roles" },
            { status: 403 }
          );
        }

 // Determine cluster name (physical or logical cluster)
        const clusterName = logicalCluster || undefined;

 // If profiles are provided, update the role's profile assignments
        if (profiles !== undefined) {
          const alterProfileQuery = RoleDDL.alterRoleSetProfiles(roleName, profiles || [], clusterName);
          const alterResult = await executeClickHouseCommand(id, alterProfileQuery, user?.id);
          if (!alterResult.success) {
            logger.warn(`Failed to update profiles for role '${roleName}':`, alterResult.error);
          }
        }

        return NextResponse.json({ success: true, message: "Role updated successfully" });
      } catch (error) {
        logger.error("Failed to update ClickHouse role:", error);
        return NextResponse.json(
          { error: "Failed to update ClickHouse role", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    },
    'UPDATE_CH_ROLE',
    'auth'
  )
);

/**
 * DELETE /api/clusters/[id]/ch-roles
 * Delete a ClickHouse role (requires Cluster admin + permission)
 */
export const DELETE = withClusterAccess(
  withAudit(
    async (
      request,
      { params },
      user
    ) => {
      try {
        if (!(await hasRole(user.id, ["admin"]))) {
          return NextResponse.json(
            { error: "Forbidden: Only admins may delete roles" },
            { status: 403 }
          );
        }

        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const roleName = searchParams.get('roleName');
        const logicalCluster = searchParams.get('logicalCluster');

 // Validate required parameters

        if (!roleName) {
          return NextResponse.json(
            { error: "Role name is required" },
            { status: 400 }
          );
        }

 // Determine cluster name (physical or logical cluster)
        const clusterName = logicalCluster || undefined;

 // Build DROP ROLE query
        const dropRoleQuery = RoleDDL.dropRole(roleName, clusterName);

 // Execute the DDL statement
        const result = await executeClickHouseCommand(id, dropRoleQuery, user?.id);

        if (!result.success) {
          return NextResponse.json(
            { error: "Failed to drop role", details: result.error },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true, message: "Role deleted successfully" });
      } catch (error) {
        logger.error("Failed to delete ClickHouse role:", error);
        return NextResponse.json(
          { error: "Failed to delete ClickHouse role", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    },
    'DELETE_CH_ROLE',
    'auth'
  )
);
