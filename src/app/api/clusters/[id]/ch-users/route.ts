import { NextResponse } from "next/server";
import { executeClickHouseQuery, executeClickHouseCommand } from "@/lib/clickhouse/index";
import { UserDDL } from "@/lib/clickhouse/queries/ddl";
import { quoteString } from "@/lib/clickhouse/utils";
import { withClusterAccess, withAudit } from "@/lib/auth/middleware";
import { hasRole } from "@/lib/auth/permissions";
import { logSqlCommandAudit } from "@/lib/auth/audit";
import { logger } from "@/lib/utils/logger";
import type { CHSystemUser, CHRoleGrant, CHProfileElement } from "@/types/clickhouse-system";
import {
  createCHUserSchema,
  DisallowedSqlStatementError,
  extractStatementCommandType,
  parseRequestJson,
  splitSqlStatements,
  updateCHUserSchema,
} from "@/lib/validation";

interface CHUserDirectGrant {
  user_name: string;
  access_type: string;
  database: string | null;
  table: string | null;
  column: string | null;
  is_partial_revoke: number;
  grant_option: number;
}

/**
 * GET /api/clusters/[id]/ch-users
 * Cluster ClickHouse
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

 //

 // Cluster Cluster ()
 // Cluster
      const fromUsers = logicalCluster
        ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.users)`
        : 'system.users';
      const fromRoleGrants = logicalCluster
        ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.role_grants)`
        : 'system.role_grants';
      const fromProfileElements = logicalCluster
        ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.settings_profile_elements)`
        : 'system.settings_profile_elements';
      const fromGrants = logicalCluster
        ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.grants)`
        : 'system.grants';

 // ClickHouse system.users
      const usersQuery = `
        SELECT
          name,
          id,
          storage,
          auth_type,
          host_ip,
          host_names,
          host_names_regexp,
          host_names_like,
          default_roles_all,
          default_roles_list,
          default_roles_except,
          grantees_any,
          grantees_list,
          grantees_except
        FROM ${fromUsers}
        ORDER BY name
        ${logicalCluster ? 'LIMIT 1 BY name' : ''}
      `;

 // role grants
      const roleGrantsQuery = `
        SELECT
          user_name,
          role_name,
          granted_role_name,
          granted_role_is_default,
          with_admin_option
        FROM ${fromRoleGrants}
        ORDER BY user_name, role_name
        ${logicalCluster ? 'LIMIT 1 BY user_name, granted_role_name' : ''}
      `;

 // profile (system.settings_profile_elements )
      const userProfilesQuery = `
        SELECT DISTINCT
          user_name,
          inherit_profile
        FROM ${fromProfileElements}
        WHERE user_name IS NOT NULL AND user_name != '' AND inherit_profile IS NOT NULL AND inherit_profile != ''
        ORDER BY user_name, inherit_profile
        ${logicalCluster ? 'LIMIT 1 BY user_name, inherit_profile' : ''}
      `;

      const userDirectGrantsQuery = `
        SELECT
          user_name,
          access_type,
          database,
          table,
          column,
          is_partial_revoke,
          grant_option
        FROM ${fromGrants}
        WHERE user_name IS NOT NULL AND user_name != ''
        ORDER BY user_name, access_type
        ${logicalCluster ? 'LIMIT 1 BY user_name, access_type, database, table' : ''}
      `;

      logger.debug(`[DEBUG ch-users] 🔍 Running 4 queries in parallel`);

      const [usersSettled, roleGrantsSettled, profilesSettled, directGrantsSettled] = await Promise.allSettled([
        executeClickHouseQuery<CHSystemUser>(id, usersQuery, undefined, user?.id),
        executeClickHouseQuery<CHRoleGrant>(id, roleGrantsQuery, undefined, user?.id),
        executeClickHouseQuery<CHProfileElement>(id, userProfilesQuery, undefined, user?.id),
        executeClickHouseQuery<CHUserDirectGrant>(id, userDirectGrantsQuery, undefined, user?.id),
      ]);

      if (usersSettled.status === 'rejected') {
        throw usersSettled.reason;
      }
      if (roleGrantsSettled.status === 'rejected') {
        throw roleGrantsSettled.reason;
      }

      const users = usersSettled.value || [];
      const roleGrants = roleGrantsSettled.value || [];
      let userProfiles: CHProfileElement[] = [];
      let userDirectGrants: CHUserDirectGrant[] = [];

      if (profilesSettled.status === 'fulfilled') {
        userProfiles = profilesSettled.value || [];
        logger.debug(`[API ch-users] Cluster ${id}${logicalCluster ? ` (${logicalCluster})` : ''}: Found ${userProfiles.length} user profiles`);
      } else {
        logger.warn("[API ch-users] Failed to fetch user profiles (might not have permissions):", profilesSettled.reason);
      }

      if (directGrantsSettled.status === 'fulfilled') {
        userDirectGrants = directGrantsSettled.value || [];
        logger.debug(`[API ch-users] Cluster ${id}${logicalCluster ? ` (${logicalCluster})` : ''}: Found ${userDirectGrants.length} direct grants`);
      } else {
        logger.warn("[API ch-users] Failed to fetch direct grants (might not have permissions):", directGrantsSettled.reason);
      }

      logger.debug(`[DEBUG ch-users] ✅ Found ${users.length} users:`, users.map(u => u.name));
      logger.debug(`[API ch-users] Cluster ${id}${logicalCluster ? ` (${logicalCluster})` : ''}: Found ${roleGrants.length} role grants`);

 // roles profiles
      const usersWithRoles = users.map((user) => {
        logger.debug(`[DEBUG ch-users] 🔍 Processing user: ${user.name}`);

        // Filter role grants for this user
        const userRoleGrants = roleGrants.filter(grant => grant.user_name === user.name);
        logger.debug(`[DEBUG ch-users]   - Matching role grants:`, userRoleGrants);

        const userRoles = userRoleGrants.map(grant => grant.granted_role_name || grant.role_name);
        logger.debug(`[DEBUG ch-users]   - Extracted roles:`, userRoles);

        // Filter profiles for this user
        const userProfilesFiltered = userProfiles.filter(up => up.user_name === user.name);
        logger.debug(`[DEBUG ch-users]   - Matching profiles:`, userProfilesFiltered);

        const profiles = userProfilesFiltered.map(up => up.inherit_profile).filter(Boolean) as string[];
        logger.debug(`[DEBUG ch-users]   - Extracted profiles:`, profiles);

        const userGrantsFiltered = userDirectGrants.filter((g) => g.user_name === user.name);
        const grants = [...new Set(userGrantsFiltered.map((g) => {
          let grantStr = g.access_type;
          if (g.database) grantStr += ` ON ${g.database}`;
          if (g.table) grantStr += `.${g.table}`;
          if (g.column) grantStr += `(${g.column})`;
          return grantStr;
        }))];

        logger.debug(`[API ch-users] User ${user.name}: ${userRoles.length} roles, ${profiles.length} profiles, ${grants.length} direct grants`);

        const result = {
          id: user.id?.toString() || user.name,
          username: user.name,
          authType: user.auth_type || 'no_password',
          roles: userRoles,
          profile: profiles.length > 0 ? profiles[0] : '',
          profiles: profiles,
          grants: grants,
          storage: user.storage,
          defaultRolesAll: user.default_roles_all,
          defaultRolesList: Array.isArray(user.default_roles_list)
            ? user.default_roles_list
            : (user.default_roles_list ? [user.default_roles_list] : []),
          status: 'active'
        };

        logger.debug(`[DEBUG ch-users]   ✅ Final user object:`, JSON.stringify(result, null, 2));
        return result;
      });

      return NextResponse.json(usersWithRoles);
    } catch (error) {
      logger.error("Failed to fetch CH users:", error);
      return NextResponse.json(
        { error: "Failed to fetch CH users", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/clusters/[id]/ch-users
 * ClickHouse (Cluster admin + )
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
        const parsed = await parseRequestJson(request, createCHUserSchema);
        if (!parsed.success) {
          return parsed.response;
        }
        const {
          username,
          password,
          authType,
          hostPattern,
          defaultRoles,
          profiles,
          logicalCluster,
          sqlQuery,
          roles,
        } = parsed.data;

        if (typeof sqlQuery === "string" && sqlQuery.trim()) {
          if (!(await hasRole(user.id, ["admin"]))) {
            return NextResponse.json(
              { error: "Forbidden: Only admins may execute raw user SQL" },
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

          for (let index = 0; index < statements.length; index += 1) {
            const statement = statements[index];
            const result = await executeClickHouseCommand(id, statement, user?.id);
            if (!result.success) {
              await logSqlCommandAudit({
                request,
                user,
                action: "CREATE_CH_USER",
                resourceType: "auth",
                resourceId: id,
                commandTypes: commandTypes.slice(0, index + 1),
                success: false,
              });
              return NextResponse.json(
                {
                  error: "Failed to execute user SQL",
                  details: result.error,
                  failedStatement: statement,
                  failedStatementIndex: index,
                  executedCount: index,
                  totalStatements: statements.length,
                },
                { status: 500 }
              );
            }
          }

          await logSqlCommandAudit({
            request,
            user,
            action: "CREATE_CH_USER",
            resourceType: "auth",
            resourceId: id,
            commandTypes,
            success: true,
          });

          return NextResponse.json({
            success: true,
            message: "User SQL executed successfully",
            executedCount: statements.length,
            totalStatements: statements.length,
          });
        }

        if (!username) {
          return NextResponse.json(
            { error: "Username is required" },
            { status: 400 }
          );
        }

        if (!(await hasRole(user.id, ["admin"]))) {
          return NextResponse.json(
            { error: "Forbidden: Only admins may create users" },
            { status: 403 }
          );
        }

        const clusterName = logicalCluster || undefined;
        const fromUsers = clusterName
          ? `clusterAllReplicas(${quoteString(clusterName)}, system.users)`
          : 'system.users';

        logger.debug('🔍 [API ch-users POST] Cluster Debug:');
        logger.debug('  - Cluster ID:', id);
        logger.debug('  - logicalCluster param:', logicalCluster);
        logger.debug('  - Final clusterName (ON CLUSTER):', clusterName);

        const resolvedDefaultRoles = defaultRoles && defaultRoles.length > 0
          ? defaultRoles
          : (roles && roles.length > 0 ? roles : []);
        const existingUserQuery = `
          SELECT 1
          FROM ${fromUsers}
          WHERE name = ${quoteString(username)}
          ${clusterName ? 'LIMIT 1 BY name' : 'LIMIT 1'}
        `;
        const existingUsers = await executeClickHouseQuery(id, existingUserQuery, undefined, user?.id);
        const userAlreadyExisted = Array.isArray(existingUsers) && existingUsers.length > 0;

        const createUserQuery = UserDDL.createUser({
          username,
          password,
          authType: authType || 'sha256_password',
          hostPattern: hostPattern || 'ANY',
          defaultRoles: resolvedDefaultRoles,
          profiles: profiles || [],
          clusterName
        });

        logger.debug(`📝 [API ch-users POST] Generated CREATE USER DDL for "${username}" (${createUserQuery.length} chars)`);

        const result = await executeClickHouseCommand(id, createUserQuery, user?.id);

        if (!result.success) {
          return NextResponse.json(
            { error: "Failed to create user", details: result.error },
            { status: 500 }
          );
        }

        if (resolvedDefaultRoles.length > 0) {
          logger.debug(`[API ch-users POST] Granting roles to user ${username}:`, resolvedDefaultRoles);
          const grantQuery = UserDDL.grantRole(username, resolvedDefaultRoles, clusterName);
          logger.debug(`[API ch-users POST] GRANT query:`, grantQuery);
          const grantResult = await executeClickHouseCommand(id, grantQuery, user?.id);
          if (!grantResult.success) {
            logger.error("❌ [API ch-users POST] Failed to grant roles:", grantResult.error);
            const rollbackResult = userAlreadyExisted
              ? { success: false, error: "Skipped rollback because the user already existed before this request." }
              : await executeClickHouseCommand(id, UserDDL.dropUser(username, clusterName), user?.id);

            return NextResponse.json(
              {
                error: "Failed to grant roles after creating user",
                details: grantResult.error,
                rollbackAttempted: !userAlreadyExisted,
                rollbackSucceeded: !userAlreadyExisted && rollbackResult.success,
                ...(userAlreadyExisted
                  ? { rollbackSkipped: true, rollbackReason: rollbackResult.error }
                  : (rollbackResult.success ? {} : { rollbackError: rollbackResult.error })),
              },
              { status: 500 }
            );
          } else {
            logger.debug("✅ [API ch-users POST] Successfully granted roles");
          }
        }

        return NextResponse.json({ success: true, message: "User created successfully" });
      } catch (error) {
        logger.error("Failed to create CH user:", error);
        return NextResponse.json(
          { error: "Failed to create CH user", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    },
    'CREATE_CH_USER',
    'auth'
  )
);

/**
 * PUT /api/clusters/[id]/ch-users
 * ClickHouse (Cluster admin + )
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
        const parsed = await parseRequestJson(request, updateCHUserSchema);
        if (!parsed.success) {
          return parsed.response;
        }
        const { username, password, authType, hostPattern, roles, profiles, logicalCluster, sqlQuery } = parsed.data;

        logger.debug(`[DEBUG PUT] username: "${username}", hasPassword: ${!!password}, roles: ${roles?.length ?? 0}, profiles: ${profiles?.length ?? 0}`);

        if (typeof sqlQuery === "string" && sqlQuery.trim()) {
          if (!(await hasRole(user.id, ["admin"]))) {
            return NextResponse.json(
              { error: "Forbidden: Only admins may execute raw user SQL" },
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

          for (let index = 0; index < statements.length; index += 1) {
            const statement = statements[index];
            const result = await executeClickHouseCommand(id, statement, user?.id);
            if (!result.success) {
              await logSqlCommandAudit({
                request,
                user,
                action: "UPDATE_CH_USER",
                resourceType: "auth",
                resourceId: id,
                commandTypes: commandTypes.slice(0, index + 1),
                success: false,
              });
              return NextResponse.json(
                {
                  error: "Failed to execute user SQL",
                  details: result.error,
                  failedStatement: statement,
                  failedStatementIndex: index,
                  executedCount: index,
                  totalStatements: statements.length,
                },
                { status: 500 }
              );
            }
          }

          await logSqlCommandAudit({
            request,
            user,
            action: "UPDATE_CH_USER",
            resourceType: "auth",
            resourceId: id,
            commandTypes,
            success: true,
          });

          return NextResponse.json({
            success: true,
            message: "User SQL executed successfully",
            executedCount: statements.length,
            totalStatements: statements.length,
          });
        }

        if (!username) {
          return NextResponse.json(
            { error: "Username is required" },
            { status: 400 }
          );
        }

        if (!(await hasRole(user.id, ["admin"]))) {
          return NextResponse.json(
            { error: "Forbidden: Only admins may update users" },
            { status: 403 }
          );
        }

 // Cluster (physical logical )
        const clusterName = logicalCluster || undefined;

 // ALTER USER (password, authType, hostPattern, profiles)
 // NOTE: defaultRoles GRANT
        const hasPasswordChange = password || authType === 'no_password';
        const hasHostChange = hostPattern !== undefined;
        const hasProfilesChange = Array.isArray(profiles);

        logger.debug(`[DEBUG PUT] hasPasswordChange: ${hasPasswordChange}, hasHostChange: ${hasHostChange}, hasProfilesChange: ${hasProfilesChange}`);

        if (hasPasswordChange || hasHostChange || hasProfilesChange) {
          const alterUserQuery = UserDDL.alterUser({
            username,
            password,
            authType,
            hostPattern,
            defaultRoles: undefined, // defaultRoles GRANT
            profiles: hasProfilesChange ? profiles : undefined,
            clusterName
          });

          logger.debug(`[API ch-users PUT] Generated ALTER USER DDL for "${username}" (${alterUserQuery.length} chars)`);
          const result = await executeClickHouseCommand(id, alterUserQuery, user?.id);

          if (!result.success) {
            logger.error(`❌ [API ch-users PUT] Failed to alter user:`, result.error);
            return NextResponse.json(
              { error: "Failed to alter user", details: result.error },
              { status: 500 }
            );
          }
          logger.debug(`✅ [API ch-users PUT] Successfully altered user`);
        }

 //
        if (roles) {
          logger.debug(`[API ch-users PUT] Updating roles for user ${username}. New roles:`, roles);

 // roles role ()
          const roleNames = roles;
          logger.debug(`[API ch-users PUT] Role names to apply:`, roleNames);

 //
          const roleGrantsQuery = `
            SELECT granted_role_name
            FROM system.role_grants
            WHERE user_name = ${quoteString(username)}
          `;
          const currentRoles = (await executeClickHouseQuery(id, roleGrantsQuery, undefined, user?.id) || []) as Array<{ granted_role_name: string }>;
          const currentRoleNames = currentRoles.map(r => r.granted_role_name);
          logger.debug(`[API ch-users PUT] Current roles for ${username}:`, currentRoleNames);

 //
          const rolesToGrant = roleNames.filter((r: string) => !currentRoleNames.includes(r));
          if (rolesToGrant.length > 0) {
            logger.debug(`[API ch-users PUT] Granting roles:`, rolesToGrant);
            const grantQuery = UserDDL.grantRole(username, rolesToGrant, clusterName);
            logger.debug(`[API ch-users PUT] GRANT query:`, grantQuery);
            const grantResult = await executeClickHouseCommand(id, grantQuery, user?.id);

            if (!grantResult.success) {
              logger.error(`❌ [API ch-users PUT] Failed to grant roles:`, grantResult.error);
              return NextResponse.json(
                { error: "Failed to grant roles", details: grantResult.error },
                { status: 500 }
              );
            }
            logger.debug(`✅ [API ch-users PUT] Successfully granted roles`);
          }

 //
          const rolesToRevoke = currentRoleNames.filter((r: string) => !roleNames.includes(r));
          if (rolesToRevoke.length > 0) {
            logger.debug(`[API ch-users PUT] Revoking roles:`, rolesToRevoke);
            const revokeQuery = UserDDL.revokeRole(username, rolesToRevoke, clusterName);
            logger.debug(`[API ch-users PUT] REVOKE query:`, revokeQuery);
            const revokeResult = await executeClickHouseCommand(id, revokeQuery, user?.id);

            if (!revokeResult.success) {
              logger.error(`❌ [API ch-users PUT] Failed to revoke roles:`, revokeResult.error);
              return NextResponse.json(
                { error: "Failed to revoke roles", details: revokeResult.error },
                { status: 500 }
              );
            }
            logger.debug(`✅ [API ch-users PUT] Successfully revoked roles`);
          }

 // GRANT/REVOKE DEFAULT ROLE
          if (roleNames.length > 0) {
            logger.debug(`[API ch-users PUT] Setting default roles:`, roleNames);
            const setDefaultRoleQuery = UserDDL.alterUser({
              username,
              defaultRoles: roleNames,
              clusterName
            });
            logger.debug(`[API ch-users PUT] SET DEFAULT ROLE query:`, setDefaultRoleQuery);
            const setDefaultResult = await executeClickHouseCommand(id, setDefaultRoleQuery, user?.id);

            if (!setDefaultResult.success) {
              logger.error(`❌ [API ch-users PUT] Failed to set default roles:`, setDefaultResult.error);
 // DEFAULT ROLE warning (GRANT )
              logger.warn(`⚠️ Roles granted but default role setting failed`);
            } else {
              logger.debug(`✅ [API ch-users PUT] Successfully set default roles`);
            }
          }
        }

        return NextResponse.json({ success: true, message: "User updated successfully" });
      } catch (error) {
        logger.error("Failed to update CH user:", error);
        return NextResponse.json(
          { error: "Failed to update CH user", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    },
    'UPDATE_CH_USER',
    'auth'
  ),
);

/**
 * DELETE /api/clusters/[id]/ch-users
 * ClickHouse (Cluster admin + )
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
            { error: "Forbidden: Only admins may delete users" },
            { status: 403 }
          );
        }

        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const username = searchParams.get('username');
        const logicalCluster = searchParams.get('logicalCluster');

 //

        if (!username) {
          return NextResponse.json(
            { error: "Username is required" },
            { status: 400 }
          );
        }

 // Cluster (physical logical )
        const clusterName = logicalCluster || undefined;

 // DROP USER
        const dropUserQuery = UserDDL.dropUser(username, clusterName);

 // DDL
        const result = await executeClickHouseCommand(id, dropUserQuery, user?.id);

        if (!result.success) {
          return NextResponse.json(
            { error: "Failed to drop user", details: result.error },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true, message: "User deleted successfully" });
      } catch (error) {
        logger.error("Failed to delete CH user:", error);
        return NextResponse.json(
          { error: "Failed to delete CH user", details: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    },
    'DELETE_CH_USER',
    'auth'
  )
);
