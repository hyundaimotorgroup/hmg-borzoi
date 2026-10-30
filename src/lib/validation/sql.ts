export class DisallowedSqlStatementError extends Error {
  constructor(public readonly statement: string) {
    super(`Statement is not an allowed USER/ROLE/SETTINGS PROFILE command: ${statement}`);
    this.name = "DisallowedSqlStatementError";
  }
}

// Only DDL/DCL statements for managing ClickHouse users, roles and settings
// profiles are allowed through this path — anything else (e.g. DROP TABLE,
// SYSTEM commands) must not be reachable via the free-form sqlQuery field.
const ALLOWED_STATEMENT_PATTERN =
  /^(CREATE|ALTER|DROP)\s+(USER|ROLE|SETTINGS\s+PROFILE)\b|^(GRANT|REVOKE)\b/i;

// Command type only (e.g. "CREATE USER") for audit logging — never the raw
// statement, which may contain a password or other sensitive value.
export function extractStatementCommandType(statement: string): string {
  const match = statement.match(ALLOWED_STATEMENT_PATTERN);
  return match ? match[0].replace(/\s+/g, " ").toUpperCase() : "UNKNOWN";
}

export function splitSqlStatements(sqlQuery: string): string[] {
  const statements = sqlQuery
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    if (!ALLOWED_STATEMENT_PATTERN.test(statement)) {
      throw new DisallowedSqlStatementError(statement);
    }
  }

  return statements;
}
