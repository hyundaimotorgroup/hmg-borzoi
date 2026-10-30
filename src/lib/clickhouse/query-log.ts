export interface DdlObjectReference {
  database: string;
  table?: string;
}

const IDENTIFIER_PATTERN = '(?:`[^`]+`|"[^"]+"|[A-Za-z_][\\w$]*)';
const ON_CLUSTER_PATTERN = `(?:ON\\s+CLUSTER\\s+${IDENTIFIER_PATTERN}\\s+)?`;

const DATABASE_PATTERNS = [
  new RegExp(
    String.raw`\b(?:CREATE|DROP|ALTER)\s+DATABASE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?${ON_CLUSTER_PATTERN}(${IDENTIFIER_PATTERN})`,
    "i"
  ),
];

const TABLE_PATTERNS = [
  new RegExp(
    String.raw`\b(?:CREATE|DROP|ALTER|TRUNCATE)\s+(?:TEMPORARY\s+)?(?:TABLE|VIEW|DICTIONARY)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?${ON_CLUSTER_PATTERN}(${IDENTIFIER_PATTERN})(?:\s*\.\s*(${IDENTIFIER_PATTERN}))?`,
    "i"
  ),
  new RegExp(
    String.raw`\bRENAME\s+(?:TABLE|VIEW|DICTIONARY)\s+${ON_CLUSTER_PATTERN}(${IDENTIFIER_PATTERN})(?:\s*\.\s*(${IDENTIFIER_PATTERN}))?`,
    "i"
  ),
  new RegExp(
    String.raw`\bON\s+(${IDENTIFIER_PATTERN})(?:\s*\.\s*(${IDENTIFIER_PATTERN}))?`,
    "i"
  ),
];

function unquoteIdentifier(value: string): string {
  if (!value) return value;

  if ((value.startsWith("`") && value.endsWith("`")) || (value.startsWith("\"") && value.endsWith("\""))) {
    return value.slice(1, -1);
  }

  return value;
}

function splitQualifiedName(value: string | null | undefined): DdlObjectReference | null {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  return {
    database: unquoteIdentifier(parts[0].trim()),
    table: unquoteIdentifier(parts[1].trim()),
  };
}

export function parseDdlObjectReference(query: string, currentDatabase: string | null | undefined): DdlObjectReference {
  const normalizedCurrentDatabase = (currentDatabase || "default").trim();
  const qualifiedCurrentDatabase = splitQualifiedName(normalizedCurrentDatabase);
  const fallbackDatabase = qualifiedCurrentDatabase?.database || normalizedCurrentDatabase || "default";

  for (const pattern of DATABASE_PATTERNS) {
    const match = query.match(pattern);
    if (!match?.[1]) continue;

    return {
      database: unquoteIdentifier(match[1]),
    };
  }

  for (const pattern of TABLE_PATTERNS) {
    const match = query.match(pattern);
    if (!match?.[1]) continue;

    if (match[2]) {
      return {
        database: unquoteIdentifier(match[1]),
        table: unquoteIdentifier(match[2]),
      };
    }

    return {
      database: fallbackDatabase,
      table: unquoteIdentifier(match[1]),
    };
  }

  if (qualifiedCurrentDatabase) {
    return qualifiedCurrentDatabase;
  }

  return {
    database: fallbackDatabase,
  };
}
