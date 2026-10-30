import { getTableType } from "./utils";
import type { TableDependency, TableType } from "./types";

export interface LineageRow {
  hostName: string;
  database: string;
  name: string;
  engine: string;
  engineFull: string;
  depDatabases: string[];
  depTables: string[];
  rows: string;
  size: string;
}

export interface ReverseLineageDependency {
  database: string;
  table: string;
  tableType: TableType;
  relationshipType: TableDependency["relationshipType"];
  dependencyType: TableDependency["type"];
}

export function buildLineageUrl(
  clusterId: string,
  database: string,
  tableName: string,
  clusterName?: string,
): string {
  const base = `/api/clusters/${clusterId}/databases/${encodeURIComponent(database)}/lineage?table=${encodeURIComponent(tableName)}`;
  return clusterName ? `${base}&cluster=${encodeURIComponent(clusterName)}` : base;
}

/**
 * Parses the (database, table) pair out of a Distributed engine's engineFull
 * string, e.g. "Distributed('cluster', 'db', 'table')". Grabs the parenthesized
 * argument list as one unambiguous chunk first, then splits on commas, avoiding
 * the backtracking-prone overlap of a single regex with adjacent `'?...'?\s*`.
 */
function parseDistributedEngineFull(engineFull: string): { db: string; table: string } | null {
  const inner = engineFull.match(/Distributed\s*\(([^)]*)\)/i)?.[1];
  if (!inner) return null;

  const args = inner.split(",").map((arg) => arg.trim().replaceAll(/(?:^'|'$)/g, ""));
  if (args.length < 3) return null;

  return { db: args[1], table: args[2] };
}

export function buildLineageDependencies(row: LineageRow, currentDb: string): TableDependency[] {
  const tableType = getTableType(row.engine);

  if (tableType === "Distributed") {
    const parsed = parseDistributedEngineFull(row.engineFull);
    if (!parsed?.table) return [];
    const normalizedRef = normalizeDependencyRef(parsed.db || currentDb, parsed.table, currentDb);
    return [{
      database: normalizedRef.database,
      table: normalizedRef.table,
      type: "source",
      relationshipType: "distributed_to_local",
    }];
  }

  if (tableType === "View" || tableType === "MaterializedView") {
    return dedupeLineageDependencies(
      row.depDatabases.flatMap((db, index) => {
        const encoded = row.depTables[index];
        if (!encoded) return [];

        const [clause, ...rest] = encoded.split(":");
        const normalizedRef = normalizeDependencyRef(db || currentDb, rest.join(":").trim(), currentDb);
        if (!normalizedRef.table) return [];

        return [{
          database: normalizedRef.database,
          table: normalizedRef.table,
          type: tableType === "MaterializedView" && clause === "TO" ? "target" : "source",
          relationshipType: tableType === "View" ? "view_to_table" : "materialized_view_to_table",
        }];
      }),
    );
  }

  return [];
}

export function collectReverseLineageDependencies(
  rows: LineageRow[],
  selectedDatabase: string,
  selectedTable: string,
): ReverseLineageDependency[] {
  const reverseDeps = new Map<string, ReverseLineageDependency>();

  rows.forEach((row) => {
    if (row.database === selectedDatabase && row.name === selectedTable) return;

    buildLineageDependencies(row, row.database).forEach((dep) => {
      if (dep.database !== selectedDatabase || dep.table !== selectedTable) return;

      const key = `${row.database}.${row.name}:${dep.relationshipType}:${dep.type}`;
      if (!reverseDeps.has(key)) {
        reverseDeps.set(key, {
          database: row.database,
          table: row.name,
          tableType: getTableType(row.engine),
          relationshipType: dep.relationshipType,
          dependencyType: dep.type,
        });
      }
    });
  });

  return [...reverseDeps.values()].sort((a, b) => {
    if (a.database !== b.database) return a.database.localeCompare(b.database);
    if (a.table !== b.table) return a.table.localeCompare(b.table);
    if (a.relationshipType !== b.relationshipType) {
      return a.relationshipType.localeCompare(b.relationshipType);
    }
    return a.dependencyType.localeCompare(b.dependencyType);
  });
}

export function getLineageRelationshipLabel(
  relationshipType: TableDependency["relationshipType"],
  type: TableDependency["type"],
  direction: "forward" | "reverse",
): string {
  if (direction === "forward") {
    if (relationshipType === "distributed_to_local") return "Distributed -> Local";
    if (relationshipType === "view_to_table") return "View -> Source Table";
    if (relationshipType === "materialized_view_to_table") {
      return type === "target" ? "Materialized View -> Target Table" : "Materialized View -> Source Table";
    }
    return "Related Table";
  }

  if (relationshipType === "distributed_to_local") return "Used by Distributed Table";
  if (relationshipType === "view_to_table") return "Read by View";
  if (relationshipType === "materialized_view_to_table") {
    return type === "target" ? "Written by Materialized View" : "Read by Materialized View";
  }
  return "Related Table";
}

function dedupeLineageDependencies(dependencies: TableDependency[]): TableDependency[] {
  const deduped = new Map<string, TableDependency>();

  dependencies.forEach((dependency) => {
    const key = `${dependency.database}.${dependency.table}:${dependency.relationshipType}:${dependency.type}`;
    if (!deduped.has(key)) {
      deduped.set(key, dependency);
    }
  });

  return [...deduped.values()];
}

export function normalizeDependencyRef(
  database: string,
  rawTable: string,
  currentDb: string,
): { database: string; table: string } {
  const cleaned = rawTable
    .replace(/[`"'()[\]]/g, "")
    .replace(/[;,]/g, "")
    .replace(/\s+AS\s+\w+$/i, "")
    .replace(/\s+\w+$/i, "")
    .trim();

  if (!cleaned) {
    return { database: database || currentDb, table: "" };
  }

  const parts = cleaned.split(".");
  if (parts.length >= 2) {
    const inferredDatabase = parts.at(-2)?.trim() || database || currentDb;
    const inferredTable = parts.at(-1)?.trim() || "";
    return {
      database: inferredDatabase,
      table: inferredTable,
    };
  }

  return {
    database: database || currentDb,
    table: cleaned,
  };
}
