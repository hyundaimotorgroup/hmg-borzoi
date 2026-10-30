import { logger } from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import { executeClickHouseQuery, executeClickHouseCommand } from "@/lib/clickhouse/index";
import { ProfileDDL } from "@/lib/clickhouse/queries/ddl";
import { quoteString } from "@/lib/clickhouse/utils";
import { withClusterAccess, withAudit } from "@/lib/auth/middleware";
import { hasRole } from "@/lib/auth/permissions";
import { logSqlCommandAudit } from "@/lib/auth/audit";
import type { CHSystemProfile, CHProfileElement } from "@/types/clickhouse-system";
import {
  createCHProfileSchema,
  DisallowedSqlStatementError,
  extractStatementCommandType,
  parseRequestJson,
  splitSqlStatements,
  type CHProfileSettingsInput,
  updateCHProfileSchema,
} from "@/lib/validation";

type ProfileSettingPayload = {
  name: string;
  value?: string | number;
  min?: string | number;
  max?: string | number;
  mode?: "READONLY" | "WRITABLE" | "CONST" | "CHANGEABLE_IN_READONLY";
};

type ProfileSettingsDiff = {
  addSettings: ProfileSettingPayload[];
  modifySettings: ProfileSettingPayload[];
  dropSettings: string[];
};

function mapWritabilityToMode(writability: string | null | undefined): ProfileSettingPayload["mode"] | undefined {
  if (!writability) {
    return undefined;
  }

  const normalized = writability.toUpperCase();

  switch (normalized) {
    case "READONLY":
    case "READ-ONLY":
      return "READONLY";
    case "WRITABLE":
    case "WRITEABLE":
      return "WRITABLE";
    case "CONST":
      return "CONST";
    case "CHANGEABLE_IN_READONLY":
    case "CHANGEABLE IN READONLY":
      return "CHANGEABLE_IN_READONLY";
    default:
      return undefined;
  }
}

function normalizeProfileSettings(settings: CHProfileSettingsInput | undefined): ProfileSettingPayload[] {
  if (!settings) {
    return [];
  }

  if (Array.isArray(settings)) {
    return settings
      .filter((setting): setting is ProfileSettingPayload => (
        typeof setting === "object" &&
        setting !== null &&
        "name" in setting
      ))
      .filter((setting) => setting.name && (
        setting.value !== undefined ||
        setting.min !== undefined ||
        setting.max !== undefined ||
        setting.mode !== undefined
      ))
      .map((setting) => ({
        name: setting.name,
        ...(setting.value !== undefined && setting.value !== null && setting.value !== "" ? { value: setting.value } : {}),
        ...(setting.min !== undefined && setting.min !== null && setting.min !== "" ? { min: setting.min } : {}),
        ...(setting.max !== undefined && setting.max !== null && setting.max !== "" ? { max: setting.max } : {}),
        ...(setting.mode !== undefined && setting.mode !== null ? { mode: setting.mode } : {}),
      }));
  }

  if (typeof settings === "object" && settings !== null) {
    return Object.entries(settings).map(([name, value]) => ({ name, value }));
  }

  return [];
}

function getSettingIdentity(setting: ProfileSettingPayload): string {
  return setting.name.trim();
}

function isSameScalarValue(left: string | number | undefined, right: string | number | undefined): boolean {
  if (left === undefined && right === undefined) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return String(left) === String(right);
}

function areSettingsEqual(left: ProfileSettingPayload, right: ProfileSettingPayload): boolean {
  return (
    getSettingIdentity(left) === getSettingIdentity(right) &&
    isSameScalarValue(left.value, right.value) &&
    isSameScalarValue(left.min, right.min) &&
    isSameScalarValue(left.max, right.max) &&
    left.mode === right.mode
  );
}

function diffProfileSettings(
  originalSettings: ProfileSettingPayload[],
  nextSettings: ProfileSettingPayload[]
): ProfileSettingsDiff {
  const originalMap = new Map(originalSettings.map((setting) => [getSettingIdentity(setting), setting]));
  const nextMap = new Map(nextSettings.map((setting) => [getSettingIdentity(setting), setting]));

  return {
    addSettings: nextSettings.filter((setting) => !originalMap.has(getSettingIdentity(setting))),
    modifySettings: nextSettings.filter((setting) => {
      const originalSetting = originalMap.get(getSettingIdentity(setting));
      return originalSetting !== undefined && !areSettingsEqual(originalSetting, setting);
    }),
    dropSettings: originalSettings
      .filter((setting) => !nextMap.has(getSettingIdentity(setting)))
      .map((setting) => getSettingIdentity(setting)),
  };
}

/**
 * GET /api/clusters/[id]/ch-profiles
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
    const fromProfiles = logicalCluster
      ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.settings_profiles)`
      : 'system.settings_profiles';
    const fromProfileElements = logicalCluster
      ? `clusterAllReplicas(${quoteString(logicalCluster)}, system.settings_profile_elements)`
      : 'system.settings_profile_elements';

 // ClickHouse system.settings_profiles
    const profilesQuery = `
      SELECT
        name,
        id,
        storage,
        num_elements,
        apply_to_all,
        apply_to_list,
        apply_to_except
      FROM ${fromProfiles}
      ORDER BY name
      ${logicalCluster ? 'LIMIT 1 BY name' : ''}
    `;

    logger.debug(`[DEBUG ch-profiles] 🔍 Profiles Query:\n${profilesQuery}`);
    const profilesResult = await executeClickHouseQuery<CHSystemProfile>(id, profilesQuery, undefined, user?.id);
    const profiles = profilesResult || [];
    logger.debug(`[DEBUG ch-profiles] ✅ Found ${profiles.length} profiles:`, profiles.map(p => p.name));

 // settings
    const settingsQuery = `
      SELECT
        profile_name,
        setting_name,
        value,
        min,
        max,
        writability,
        inherit_profile
      FROM ${fromProfileElements}
      ORDER BY profile_name, setting_name
      ${logicalCluster ? 'LIMIT 1 BY profile_name, setting_name' : ''}
    `;

    logger.debug(`[DEBUG ch-profiles] 🔍 Settings Query:\n${settingsQuery}`);
    let settings: CHProfileElement[] = [];
    try {
      const result = await executeClickHouseQuery<CHProfileElement>(id, settingsQuery, undefined, user?.id);
      settings = result || [];
      logger.debug(`[API ch-profiles] Cluster ${id}${logicalCluster ? ` (${logicalCluster})` : ''}: Found ${settings.length} profile settings`);
      logger.debug(`[DEBUG ch-profiles] 📊 Settings Raw Data:`, JSON.stringify(settings, null, 2));
    } catch (error) {
      logger.warn("Failed to fetch profile settings:", error);
      settings = []; //
    }

 // settings
    const profilesWithSettings = profiles.map((profile) => {
      logger.debug(`[DEBUG ch-profiles] 🔍 Processing profile: ${profile.name}`);

      // Filter settings for the corresponding profile
      const profileSettings = settings.filter(
        setting => setting.profile_name === profile.name
      );
      logger.debug(`[DEBUG ch-profiles]   - Matching settings:`, profileSettings);

      const maxMemoryUsage = profileSettings.find(s => s.setting_name === 'max_memory_usage')?.value;
      const maxMemoryUsageForUser = profileSettings.find(s => s.setting_name === 'max_memory_usage_for_user')?.value;
      const maxThreads = profileSettings.find(s => s.setting_name === 'max_threads')?.value;
      const maxConcurrentQueries = profileSettings.find(s => s.setting_name === 'max_concurrent_queries_for_user')?.value;
      const maxExecutionTime = profileSettings.find(s => s.setting_name === 'max_execution_time')?.value;
      const readonly = profileSettings.some((setting) => {
        const mode = mapWritabilityToMode(setting.writability);
        return mode === "READONLY" || mode === "CONST";
      }) ? '1' : '0';

      logger.debug(`[DEBUG ch-profiles]   - Extracted key settings:`, {
        maxMemoryUsage,
        maxMemoryUsageForUser,
        maxThreads,
        maxConcurrentQueries,
        maxExecutionTime,
        readonly
      });

 // (Memory Usage )
      let tier: "xlarge" | "large" | "medium" | "small" | "monitoring" = "medium";
      if (profile.name.includes('monitoring')) {
        tier = "monitoring";
      } else if (maxMemoryUsage) {
        const memoryGB = parseInt(maxMemoryUsage) / (1024 * 1024 * 1024);
        if (memoryGB >= 150) tier = "xlarge";
        else if (memoryGB >= 100) tier = "large";
        else if (memoryGB >= 50) tier = "medium";
        else tier = "small";
      }

      logger.debug(`[API ch-profiles] Profile ${profile.name}: tier=${tier}, ${profileSettings.length} settings`);

      const result = {
        id: profile.name, // Use profile name as ID for consistency
        name: profile.name,
        storage: profile.storage,
        tier,
        maxMemoryUsage: maxMemoryUsage ? `${Math.round(parseInt(maxMemoryUsage) / (1024 * 1024 * 1024))}GB` : 'unlimited',
        maxMemoryUsageForUser: maxMemoryUsageForUser ? `${Math.round(parseInt(maxMemoryUsageForUser) / (1024 * 1024 * 1024))}GB` : 'unlimited',
        maxThreads: maxThreads ? parseInt(maxThreads) : null,
        maxConcurrentQueries: maxConcurrentQueries ? parseInt(maxConcurrentQueries) : null,
        maxExecutionTime: maxExecutionTime ? parseInt(maxExecutionTime) : null,
        readonly: readonly,
        settings: profileSettings.map(s => ({
          name: s.setting_name,
          value: s.value ?? '',
          ...(s.min !== null ? { min: s.min } : {}),
          ...(s.max !== null ? { max: s.max } : {}),
          ...(mapWritabilityToMode(s.writability) ? { mode: mapWritabilityToMode(s.writability) } : {}),
        }))
      };

      logger.debug(`[DEBUG ch-profiles]   ✅ Final profile object:`, JSON.stringify(result, null, 2));
      return result;
    });

    return NextResponse.json(profilesWithSettings);
  } catch (error) {
    logger.error("Failed to fetch CH profiles:", error);
    return NextResponse.json(
      { error: "Failed to fetch CH profiles", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});

/**
 * POST /api/clusters/[id]/ch-profiles
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
    const parsed = await parseRequestJson(request, createCHProfileSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const { profileName, settings, inheritProfiles, logicalCluster, sqlQuery } = parsed.data;

 //

    logger.debug('[POST ch-profiles] Request received', {
      profileName,
      hasSqlQuery: typeof sqlQuery === "string" && sqlQuery.trim().length > 0,
      inheritProfilesCount: inheritProfiles?.length ?? 0,
    });

    if (typeof sqlQuery === "string" && sqlQuery.trim()) {
      if (!(await hasRole(user.id, ["admin"]))) {
        return NextResponse.json(
          { error: "Forbidden: Only admins may execute raw profile SQL" },
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
            action: "CREATE_CH_PROFILE",
            resourceType: "auth",
            resourceId: id,
            commandTypes,
            success: false,
          });
          return NextResponse.json(
            { error: "Failed to execute profile SQL", details: result.error },
            { status: 500 }
          );
        }
      }

      await logSqlCommandAudit({
        request,
        user,
        action: "CREATE_CH_PROFILE",
        resourceType: "auth",
        resourceId: id,
        commandTypes,
        success: true,
      });

      return NextResponse.json({ success: true, message: "Profile SQL executed successfully" });
    }

    if (!profileName) {
      return NextResponse.json(
        { error: "Profile name is required" },
        { status: 400 }
      );
    }

    if (!(await hasRole(user.id, ["admin"]))) {
      return NextResponse.json(
        { error: "Forbidden: Only admins may create profiles" },
        { status: 403 }
      );
    }

 // Cluster (physical logical )
    const clusterName = logicalCluster || undefined;

    logger.debug('🔍 [API ch-profiles POST] Cluster Debug:');
    logger.debug('  - Cluster ID:', id);
    logger.debug('  - logicalCluster param:', logicalCluster);
    logger.debug('  - Final clusterName (ON CLUSTER):', clusterName);

    const normalizedSettings = normalizeProfileSettings(settings);

    logger.debug('[POST ch-profiles] Settings payload:', normalizedSettings);

 // CREATE SETTINGS PROFILE
    const createProfileQuery = ProfileDDL.createProfile({
      profileName,
      settings: normalizedSettings,
      inheritProfiles: inheritProfiles || [],
      clusterName
    });

    logger.debug('📝 [API ch-profiles POST] Generated DDL:', createProfileQuery);

 // DDL
    const result = await executeClickHouseCommand(id, createProfileQuery, user?.id);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to create profile", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Profile created successfully" });
  } catch (error) {
    logger.error("Failed to create CH profile:", error);
    return NextResponse.json(
      { error: "Failed to create profile", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
    },
    'CREATE_CH_PROFILE',
    'auth'
  )
);

/**
 * PUT /api/clusters/[id]/ch-profiles
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
    const parsed = await parseRequestJson(request, updateCHProfileSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const { profileName, settings, originalSettings, inheritProfiles, logicalCluster, sqlQuery } = parsed.data;

 //

    if (typeof sqlQuery === "string" && sqlQuery.trim()) {
      if (!(await hasRole(user.id, ["admin"]))) {
        return NextResponse.json(
          { error: "Forbidden: Only admins may execute raw profile SQL" },
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
            action: "UPDATE_CH_PROFILE",
            resourceType: "auth",
            resourceId: id,
            commandTypes,
            success: false,
          });
          return NextResponse.json(
            { error: "Failed to execute profile SQL", details: result.error },
            { status: 500 }
          );
        }
      }

      await logSqlCommandAudit({
        request,
        user,
        action: "UPDATE_CH_PROFILE",
        resourceType: "auth",
        resourceId: id,
        commandTypes,
        success: true,
      });

      return NextResponse.json({ success: true, message: "Profile SQL executed successfully" });
    }

    if (!profileName) {
      return NextResponse.json(
        { error: "Profile name is required" },
        { status: 400 }
      );
    }

    if (!(await hasRole(user.id, ["admin"]))) {
      return NextResponse.json(
        { error: "Forbidden: Only admins may update profiles" },
        { status: 403 }
      );
    }

 // Cluster (physical logical )
    const clusterName = logicalCluster || undefined;
    const normalizedSettings = normalizeProfileSettings(settings);
    const normalizedOriginalSettings = normalizeProfileSettings(originalSettings);
    const { addSettings, modifySettings, dropSettings } = diffProfileSettings(
      normalizedOriginalSettings,
      normalizedSettings
    );

    if (addSettings.length === 0 && modifySettings.length === 0 && dropSettings.length === 0 && (!inheritProfiles || inheritProfiles.length === 0)) {
      return NextResponse.json({ success: true, message: "No profile changes detected" });
    }

 // ALTER SETTINGS PROFILE
    const alterProfileQuery = ProfileDDL.alterProfile({
      profileName,
      addSettings,
      modifySettings,
      dropSettings,
      inheritProfiles: inheritProfiles || [],
      clusterName
    });

 // DDL
    const result = await executeClickHouseCommand(id, alterProfileQuery, user?.id);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to alter profile", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    logger.error("Failed to update CH profile:", error);
    return NextResponse.json(
      { error: "Failed to update CH profile", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
    },
    'UPDATE_CH_PROFILE',
    'auth'
  )
);

/**
 * DELETE /api/clusters/[id]/ch-profiles
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
        { error: "Forbidden: Only admins may delete profiles" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const profileName = searchParams.get('profileName');
    const logicalCluster = searchParams.get('logicalCluster');

 //

    if (!profileName) {
      return NextResponse.json(
        { error: "Profile name is required" },
        { status: 400 }
      );
    }

 // Cluster (physical logical )
    const clusterName = logicalCluster || undefined;

 // DROP SETTINGS PROFILE
    const dropProfileQuery = ProfileDDL.dropProfile(profileName, clusterName);

 // DDL
    const result = await executeClickHouseCommand(id, dropProfileQuery, user?.id);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to drop profile", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Profile deleted successfully" });
  } catch (error) {
    logger.error("Failed to delete CH profile:", error);
    return NextResponse.json(
      { error: "Failed to delete CH profile", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
    },
    'DELETE_CH_PROFILE',
    'auth'
  )
);
