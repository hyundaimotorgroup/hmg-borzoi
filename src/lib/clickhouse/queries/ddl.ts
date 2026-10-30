import { quoteIdentifier, quoteString } from '../utils';

/**
 * DDL queries (retrieve DDL from actual ClickHouse)
 */
export const DDLQueries = {
  /**
   * Retrieve the actual CREATE DDL for a user
   */
  getUserDDL: (username: string, clusterName?: string) => {
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `SHOW CREATE USER${onClusterClause} ${quoteIdentifier(username)}`;
  },

  getRoleDDL: (roleName: string, clusterName?: string) => {
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `SHOW CREATE ROLE${onClusterClause} ${quoteIdentifier(roleName)}`;
  },

  getProfileDDL: (profileName: string, clusterName?: string) => {
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `SHOW CREATE SETTINGS PROFILE${onClusterClause} ${quoteIdentifier(profileName)}`;
  },

  getRoleGrants: (roleName: string, clusterName?: string) => {
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `SHOW GRANTS${onClusterClause} FOR ${quoteIdentifier(roleName)}`;
  },
};

const ALLOWED_PRIVILEGES = new Set([
  'ALL',
  'ALL PRIVILEGES',
  'NONE',
  'SELECT',
  'INSERT',
  'ALTER',
  'CREATE',
  'DROP',
  'TRUNCATE',
  'OPTIMIZE',
  'SHOW',
  'KILL QUERY',
  'KILL TRANSACTION',
  'MOVE PARTITION BETWEEN SHARDS',
  'ACCESS MANAGEMENT',
  'SYSTEM',
  'INTROSPECTION',
  'SOURCES',
  'CLUSTER',
  'CREATE DATABASE',
  'CREATE TABLE',
  'CREATE VIEW',
  'CREATE DICTIONARY',
  'CREATE TEMPORARY TABLE',
  'CREATE FUNCTION',
  'DROP DATABASE',
  'DROP TABLE',
  'DROP VIEW',
  'DROP DICTIONARY',
  'DROP FUNCTION',
  'ALTER TABLE',
  'ALTER UPDATE',
  'ALTER DELETE',
  'ALTER COLUMN',
  'ALTER ADD COLUMN',
  'ALTER DROP COLUMN',
  'ALTER MODIFY COLUMN',
  'ALTER RENAME COLUMN',
  'ALTER COMMENT COLUMN',
  'ALTER CLEAR COLUMN',
  'ALTER MATERIALIZE COLUMN',
  'ALTER SETTINGS',
  'ALTER ORDER BY',
  'ALTER SAMPLE BY',
  'ALTER INDEX',
  'ALTER ADD INDEX',
  'ALTER DROP INDEX',
  'ALTER MATERIALIZE INDEX',
  'ALTER CLEAR INDEX',
  'ALTER CONSTRAINT',
  'ALTER ADD CONSTRAINT',
  'ALTER DROP CONSTRAINT',
  'ALTER TTL',
  'ALTER MATERIALIZE TTL',
  'ALTER FETCH PARTITION',
  'ALTER FREEZE PARTITION',
  'ALTER MOVE PARTITION',
  'ALTER VIEW',
  'ALTER VIEW REFRESH',
  'ALTER VIEW MODIFY QUERY',
  'ALTER DATABASE',
  'SHOW DATABASES',
  'SHOW TABLES',
  'SHOW COLUMNS',
  'SHOW DICTIONARIES',
  'DICTGET',
  'DISPLAYSECRETSINSHOWANDSELECT',
]);

function assertValidPrivilege(privilege: string): void {
  const tokens = privilege.split(',').map((token) => token.trim());
  for (const token of tokens) {
    if (!ALLOWED_PRIVILEGES.has(token.toUpperCase())) {
      throw new Error(`Invalid or unsupported privilege: ${token}`);
    }
  }
}

/**
 * User DDL queries
 */
export const UserDDL = {
  /**
   * Build a CREATE USER query
   */
  createUser: (params: {
    username: string;
    password?: string;
    authType?: 'plaintext_password' | 'sha256_password' | 'no_password' | 'ldap';
    hostPattern?: string;
    defaultRoles?: string[];
    profiles?: string[];
    clusterName?: string;
  }) => {
    const { username, password, authType = 'sha256_password', hostPattern = 'ANY', defaultRoles = [], profiles = [], clusterName } = params;

    let authClause = '';
    if (authType === 'no_password') {
      authClause = 'NOT IDENTIFIED';
    } else if (password) {
      authClause = `IDENTIFIED WITH ${authType} BY ${quoteString(password)}`;
    } else {
      authClause = 'NOT IDENTIFIED';
    }

    const hostClause = hostPattern === 'ANY' ? 'HOST ANY' : `HOST NAME ${quoteString(hostPattern)}`;
    const defaultRolesClause = defaultRoles.length > 0
      ? `DEFAULT ROLE ${defaultRoles.map((role) => quoteIdentifier(role)).join(', ')}`
      : '';
    const profileClause = profiles.length > 0 ? `PROFILE ${profiles.map(p => quoteString(p)).join(', ')}` : '';
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';

    return `CREATE USER IF NOT EXISTS ${quoteIdentifier(username)}${onClusterClause} ${authClause} ${hostClause} ${defaultRolesClause} ${profileClause}`.trim();
  },

  /**
   * Build an ALTER USER query
   */
  alterUser: (params: {
    username: string;
    password?: string;
    authType?: 'plaintext_password' | 'sha256_password' | 'no_password' | 'ldap';
    hostPattern?: string;
    defaultRoles?: string[];
    profiles?: string[];
    clusterName?: string;
  }) => {
    const { username, password, authType, hostPattern, defaultRoles, profiles, clusterName } = params;

    const clauses: string[] = [];

    if (password && authType && authType !== 'no_password') {
      clauses.push(`IDENTIFIED WITH ${authType} BY ${quoteString(password)}`);
    } else if (authType === 'no_password') {
      clauses.push('NOT IDENTIFIED');
    }

    if (hostPattern) {
      const hostClause = hostPattern === 'ANY' ? 'HOST ANY' : `HOST NAME ${quoteString(hostPattern)}`;
      clauses.push(hostClause);
    }

    if (defaultRoles && defaultRoles.length > 0) {
      clauses.push(`DEFAULT ROLE ${defaultRoles.map((role) => quoteIdentifier(role)).join(', ')}`);
    }

    if (profiles !== undefined) {
      clauses.push(
        profiles.length > 0
          ? `PROFILE ${profiles.map(p => quoteString(p)).join(', ')}`
          : 'SETTINGS PROFILE none'
      );
    }

    // Throw an error if there are no changes
    if (clauses.length === 0) {
      throw new Error('ALTER USER requires at least one modification (password, host, roles, or profiles)');
    }

    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';

    return `ALTER USER ${quoteIdentifier(username)}${onClusterClause} ${clauses.join(' ')}`.trim();
  },

  /**
   * Build a DROP USER query
   */
  dropUser: (username: string, clusterName?: string) => {
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `DROP USER IF EXISTS ${quoteIdentifier(username)}${onClusterClause}`.trim();
  },

  /**
   * Build a GRANT ROLE query
   */
  grantRole: (username: string, roles: string[], clusterName?: string) => {
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `GRANT ${roles.map((role) => quoteIdentifier(role)).join(', ')} TO ${quoteIdentifier(username)}${onClusterClause}`.trim();
  },

  revokeRole: (username: string, roles: string[], clusterName?: string) => {
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `REVOKE ${roles.map((role) => quoteIdentifier(role)).join(', ')} FROM ${quoteIdentifier(username)}${onClusterClause}`.trim();
  },

  grantPrivilege: (params: {
    username: string;
    privilege: string;
    database?: string;
    table?: string;
    columns?: string[];
    clusterName?: string;
  }) => {
    const { username, privilege, database, table, columns, clusterName } = params;
    assertValidPrivilege(privilege);
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    let target = '*.*';
    if (database && table) {
      target = columns && columns.length > 0
        ? `${quoteIdentifier(database)}.${quoteIdentifier(table)}(${columns.map((c) => quoteIdentifier(c)).join(', ')})`
        : `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
    } else if (database) {
      target = `${quoteIdentifier(database)}.*`;
    } else if (table) {
      target = quoteIdentifier(table);
    }
    return `GRANT ${privilege} ON ${target} TO ${quoteIdentifier(username)}${onClusterClause}`.trim();
  },

  revokePrivilege: (params: {
    username: string;
    privilege: string;
    database?: string;
    table?: string;
    columns?: string[];
    clusterName?: string;
  }) => {
    const { username, privilege, database, table, columns, clusterName } = params;
    assertValidPrivilege(privilege);
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    let target = '*.*';
    if (database && table) {
      target = columns && columns.length > 0
        ? `${quoteIdentifier(database)}.${quoteIdentifier(table)}(${columns.map((c) => quoteIdentifier(c)).join(', ')})`
        : `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
    } else if (database) {
      target = `${quoteIdentifier(database)}.*`;
    } else if (table) {
      target = quoteIdentifier(table);
    }
    return `REVOKE ${privilege} ON ${target} FROM ${quoteIdentifier(username)}${onClusterClause}`.trim();
  },
};

/**
 * Role DDL queries
 */
export const RoleDDL = {
  /**
   * Build a CREATE ROLE query (supports multiple profiles)
   */
  createRole: (params: {
    roleName: string;
    profiles?: string[];
    clusterName?: string;
  }) => {
    const { roleName, profiles = [], clusterName } = params;

    const quotedRoleName = quoteIdentifier(roleName);

    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';

    if (profiles.length > 0) {
      const profilesClause = `PROFILE ${profiles.map(p => quoteString(p)).join(', ')}`;
      return `CREATE ROLE IF NOT EXISTS ${quotedRoleName}${onClusterClause} ${profilesClause}`.trim();
    }

    return `CREATE ROLE IF NOT EXISTS ${quotedRoleName}${onClusterClause}`.trim();
  },

  /**
   * Replace all profiles on ALTER ROLE (reset to none if array is empty)
   */
  alterRoleSetProfiles: (roleName: string, profiles: string[], clusterName?: string) => {
    const quotedRoleName = quoteIdentifier(roleName);
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    const profilesClause = profiles.length > 0
      ? `PROFILE ${profiles.map(p => quoteString(p)).join(', ')}`
      : 'SETTINGS PROFILE none';
    return `ALTER ROLE ${quotedRoleName}${onClusterClause} ${profilesClause}`.trim();
  },

  /**
   * Build a DROP ROLE query
   */
  dropRole: (roleName: string, clusterName?: string) => {
    const quotedRoleName = quoteIdentifier(roleName);
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `DROP ROLE IF EXISTS ${quotedRoleName}${onClusterClause}`.trim();
  },
};

/**
 * Profile DDL queries
 */
type ProfileDDLSetting = {
  name: string;
  value?: string | number;
  min?: string | number;
  max?: string | number;
  mode?: "READONLY" | "WRITABLE" | "CONST" | "CHANGEABLE_IN_READONLY";
};

type ProfileDDLChangeSet = {
  addSettings?: ProfileDDLSetting[];
  modifySettings?: ProfileDDLSetting[];
  dropSettings?: string[];
};

function normalizeProfileDDLSettings(
  settings?: Record<string, string | number> | ProfileDDLSetting[]
): ProfileDDLSetting[] {
  if (!settings) {
    return [];
  }

  if (Array.isArray(settings)) {
    return settings
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

  return Object.entries(settings).map(([name, value]) => ({ name, value }));
}

function quoteProfileSettingScalar(value: string | number): string {
  return typeof value === 'number' ? String(value) : quoteString(value);
}

function buildProfileSettingClause(setting: ProfileDDLSetting): string {
  let clause = quoteIdentifier(setting.name);
  if (setting.value !== undefined && setting.value !== null && setting.value !== "") {
    clause += ` = ${quoteProfileSettingScalar(setting.value)}`;
  }
  if (setting.min !== undefined && setting.min !== null && setting.min !== "") {
    clause += ` MIN ${quoteProfileSettingScalar(setting.min)}`;
  }
  if (setting.max !== undefined && setting.max !== null && setting.max !== "") {
    clause += ` MAX ${quoteProfileSettingScalar(setting.max)}`;
  }
  if (setting.mode) {
    clause += ` ${setting.mode}`;
  }
  return clause;
}

export const ProfileDDL = {
  /**
   * Build a CREATE SETTINGS PROFILE query (supports multiple settings values)
   */
  createProfile: (params: {
    profileName: string;
    settings?: Record<string, string | number> | ProfileDDLSetting[];
    inheritProfiles?: string[];
    clusterName?: string;
  }) => {
    const { profileName, settings = {}, inheritProfiles = [], clusterName } = params;

    const settingsClauses = normalizeProfileDDLSettings(settings).map(buildProfileSettingClause);

    const inheritClause = inheritProfiles.length > 0
      ? `INHERIT ${inheritProfiles.map((p) => quoteIdentifier(p)).join(', ')}`
      : '';

    const settingsClause = settingsClauses.length > 0
      ? `SETTINGS ${settingsClauses.join(',\n    ')}`
      : '';

    const quotedProfileName = quoteIdentifier(profileName);

    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';

    return `CREATE SETTINGS PROFILE IF NOT EXISTS ${quotedProfileName}${onClusterClause}\n${settingsClause}${inheritClause ? '\n' + inheritClause : ''}\nTO NONE`.trim();
  },

  /**
   * Build an ALTER SETTINGS PROFILE query
   */
  alterProfile: (params: {
    profileName: string;
    settings?: ProfileDDLSetting[];
    inheritProfiles?: string[];
    clusterName?: string;
  } & ProfileDDLChangeSet) => {
    const {
      profileName,
      settings = [],
      addSettings = [],
      modifySettings = [],
      dropSettings = [],
      inheritProfiles,
      clusterName,
    } = params;

    const clauses: string[] = [];

    const normalizedSettings = normalizeProfileDDLSettings(settings);
    const normalizedAddSettings = normalizeProfileDDLSettings(addSettings);
    const normalizedModifySettings = normalizeProfileDDLSettings(modifySettings);
    const normalizedDropSettings = dropSettings.filter(Boolean);

    if (normalizedSettings.length > 0) {
      const settingsClauses = normalizedSettings.map(buildProfileSettingClause);
      clauses.push(`MODIFY SETTINGS ${settingsClauses.join(', ')}`);
    } else {
      if (normalizedAddSettings.length > 0) {
        const addSettingsClauses = normalizedAddSettings.map(buildProfileSettingClause);
        clauses.push(`ADD SETTINGS ${addSettingsClauses.join(', ')}`);
      }

      if (normalizedModifySettings.length > 0) {
        const modifySettingsClauses = normalizedModifySettings.map(buildProfileSettingClause);
        clauses.push(`MODIFY SETTINGS ${modifySettingsClauses.join(', ')}`);
      }

      if (normalizedDropSettings.length > 0) {
        clauses.push(`DROP SETTINGS ${normalizedDropSettings.map((s) => quoteIdentifier(s)).join(', ')}`);
      }
    }

    if (inheritProfiles && inheritProfiles.length > 0) {
      clauses.push(`INHERIT ${inheritProfiles.map((p) => quoteIdentifier(p)).join(', ')}`);
    }

    const quotedProfileName = quoteIdentifier(profileName);

    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';

    if (clauses.length === 0) {
      throw new Error('ALTER SETTINGS PROFILE requires at least one modification');
    }

    return `ALTER SETTINGS PROFILE IF EXISTS ${quotedProfileName}${onClusterClause} ${clauses.join(' ')}`.trim();
  },

  /**
   * Build a DROP SETTINGS PROFILE query
   */
  dropProfile: (profileName: string, clusterName?: string) => {
    const quotedProfileName = quoteIdentifier(profileName);
    const onClusterClause = clusterName ? ` ON CLUSTER ${quoteString(clusterName)}` : '';
    return `DROP SETTINGS PROFILE IF EXISTS ${quotedProfileName}${onClusterClause}`.trim();
  },
};
