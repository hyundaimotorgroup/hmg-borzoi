export interface SqlAutocompleteMetadata {
  databases: string[];
  tablesByDatabase: Record<string, string[]>;
}

export type SqlCompletionKind = "keyword" | "database" | "table" | "qualifiedTable";

export interface SqlCompletionEntry {
  kind: SqlCompletionKind;
  label: string;
  insertText?: string;
  detail: string;
  sortText: string;
}

export const SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "ORDER BY",
  "LIMIT",
  "HAVING",
  "WITH",
  "JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "OUTER JOIN",
  "ON",
  "AS",
  "DISTINCT",
  "UNION",
  "UNION ALL",
  "INSERT INTO",
  "VALUES",
  "CREATE TABLE",
  "DROP TABLE",
  "ALTER TABLE",
  "TRUNCATE TABLE",
  "OPTIMIZE TABLE",
  "DESCRIBE TABLE",
  "SHOW TABLES",
  "SHOW DATABASES",
  "USE",
  "EXPLAIN",
  "SYSTEM",
  "FORMAT",
];

const TABLE_EXPECTATION_RE =
  /\b(?:FROM|JOIN|INTO|UPDATE|TABLE|DESCRIBE|DESC|EXPLAIN|TRUNCATE|OPTIMIZE)\s+([`"\w.]*)$/i;
const DATABASE_EXPECTATION_RE = /\b(?:USE|DATABASE)\s+([`"\w]*)$/i;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function normalizeSqlIdentifier(identifier: string): string {
  return identifier.replace(/(?:^[`"]+|[`"]+$)/g, "").trim();
}

export function getSqlCompletions(
  linePrefix: string,
  metadata: SqlAutocompleteMetadata,
): SqlCompletionEntry[] {
  const qualifierMatch = linePrefix.match(/([`"\w]+)\.$/);
  const qualifier = qualifierMatch
    ? normalizeSqlIdentifier(qualifierMatch[1]).toLowerCase()
    : "";

  if (qualifier) {
    const qualifiedTables = uniqueSorted(metadata.tablesByDatabase[qualifier] || []);
    return qualifiedTables.map((tableName, index) => ({
      kind: "table",
      label: tableName,
      detail: `Table in ${qualifier}`,
      sortText: `0-${index.toString().padStart(4, "0")}`,
    }));
  }

  const expectsDatabase = DATABASE_EXPECTATION_RE.test(linePrefix);
  const expectsTable = !expectsDatabase && TABLE_EXPECTATION_RE.test(linePrefix);

  const databases = uniqueSorted(metadata.databases);
  const bareTables = uniqueSorted(
    Object.values(metadata.tablesByDatabase).flatMap((tableNames) => tableNames),
  );
  const qualifiedTables = uniqueSorted(
    Object.entries(metadata.tablesByDatabase).flatMap(([database, tableNames]) =>
      tableNames.map((tableName) => `${database}.${tableName}`),
    ),
  );

  const keywordEntries = SQL_KEYWORDS.map((keyword, index) => ({
    kind: "keyword" as const,
    label: keyword,
    insertText: keyword,
    detail: "SQL keyword",
    sortText: `${expectsDatabase || expectsTable ? "9" : "0"}-${index
      .toString()
      .padStart(4, "0")}`,
  }));

  const databaseEntries = databases.map((database, index) => ({
    kind: "database" as const,
    label: database,
    detail: "Database",
    sortText: `${expectsDatabase ? "0" : expectsTable ? "3" : "2"}-${index
      .toString()
      .padStart(4, "0")}`,
  }));

  const tableEntries = bareTables.map((tableName, index) => ({
    kind: "table" as const,
    label: tableName,
    detail: "Table",
    sortText: `${expectsTable ? "0" : "3"}-${index.toString().padStart(4, "0")}`,
  }));

  const qualifiedTableEntries = qualifiedTables.map((tableName, index) => ({
    kind: "qualifiedTable" as const,
    label: tableName,
    detail: "Qualified table",
    // Right after bare table names ("0") when a table is expected; otherwise
    // lowest priority (after keywords/databases/tables) in the "4" bucket.
    sortText: `${expectsTable ? "1" : "4"}-${index.toString().padStart(4, "0")}`,
  }));

  return [
    ...keywordEntries,
    ...databaseEntries,
    ...tableEntries,
    ...qualifiedTableEntries,
  ].sort((a, b) => a.sortText.localeCompare(b.sortText) || a.label.localeCompare(b.label));
}
