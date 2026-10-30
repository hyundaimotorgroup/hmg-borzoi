import { NextResponse } from "next/server";
import { executeClickHouseQuery } from "@/lib/clickhouse/index";
import { quoteString } from "@/lib/clickhouse/utils";
import { withClusterAccess } from "@/lib/auth/middleware";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/clusters/[id]/databases/[database]/lineage?table=<tableName>
 *
 * Fetches only the tables directly related to the selected table across all nodes.
 *
 * Phase 1 (single node):
 *   - forward deps of the target table
 *     · View/MatView → DDL parsing (create_table_query); dependencies_* columns are empty in ClickHouse
 *     · Distributed → engine_full parsing
 *   - reverse deps (View/MatView/Distributed that reference this table)
 *   → finalize the set of related table names
 *
 * Phase 2 (clusterAllReplicas):
 *   - query only the finalized table names across all nodes (including hostName())
 */

// ────────────────────────────────────────────────────────────────
// Utility for extracting db.table references from DDL
// ────────────────────────────────────────────────────────────────

/**
 * Extracts tables referenced in a CREATE VIEW/MATERIALIZED VIEW DDL.
 *
 * Extraction targets:
 *  - FROM   db.table
 *  - JOIN   db.table
 *  - TO     db.table  (MaterializedView target)
 *
 * If there is no db prefix, currentDb is used.
 */
type DdlRefClause = "FROM" | "JOIN" | "TO";

function normalizeDdlRef(
  rawDatabase: string,
  rawTable: string,
  currentDb: string,
): { database: string; table: string } {
  const cleanedTable = rawTable
    .replace(/[`"'()[\]]/g, "")
    .replace(/[;,]/g, "")
    .replace(/\s+AS\s+\w+$/i, "")
    .replace(/\s+\w+$/i, "")
    .trim();

  if (!cleanedTable) {
    return { database: rawDatabase || currentDb, table: "" };
  }

  const parts = cleanedTable.split(".");
  if (parts.length >= 2) {
    return {
      database: parts.at(-2)?.trim() || rawDatabase || currentDb,
      table: parts.at(-1)?.trim() || "",
    };
  }

  return {
    database: rawDatabase || currentDb,
    table: cleanedTable,
  };
}

function extractDdlRefs(
  ddl: string,
  currentDb: string,
): { database: string; table: string; clause: DdlRefClause }[] {
  if (!ddl) return [];

  const results: { database: string; table: string; clause: DdlRefClause }[] = [];
  const seen = new Set<string>();

  // Backtick or plain identifier pattern
  const identStr = "(?:`[^`]+`|\\w+)";

  // FROM db.table / JOIN db.table / TO db.table
  const pattern = new RegExp(
    `\\b(FROM|JOIN|TO)\\s+(${identStr})\\.(${identStr})`,
    "gi",
  );

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(ddl)) !== null) {
    const clause = m[1].toUpperCase() as DdlRefClause;
    const rawDb  = m[2].replace(/`/g, "");
    const rawTbl = m[3].replace(/`/g, "");
    const normalized = normalizeDdlRef(rawDb, rawTbl, currentDb);
    // Exclude system tables
    if (normalized.database === "system" || normalized.database === "information_schema") continue;
    if (!normalized.table) continue;
    const key = `${clause}:${normalized.database}.${normalized.table}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ database: normalized.database, table: normalized.table, clause });
    }
  }

  // FROM table (no db prefix)
  const patternNoDb = new RegExp(
    `\\b(FROM|JOIN|TO)\\s+(${identStr})`,
    "gi",
  );
  while ((m = patternNoDb.exec(ddl)) !== null) {
    const nextChar = ddl[patternNoDb.lastIndex] ?? "";
    if (nextChar === ".") continue;
    const clause = m[1].toUpperCase() as DdlRefClause;
    const rawTbl = m[2].replace(/`/g, "");
    const normalized = normalizeDdlRef(currentDb, rawTbl, currentDb);
    // Filter out keywords that may be mistaken for table names
    if (/^(SELECT|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|WITH|AS|ON|SET|BY|ALL)$/i.test(normalized.table)) continue;
    if (!normalized.table) continue;
    const key = `${clause}:${normalized.database}.${normalized.table}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ database: normalized.database, table: normalized.table, clause });
    }
  }

  return results;
}

/**
 * Parses the (database, table) pair out of a Distributed engine's engine_full
 * string, e.g. "Distributed('cluster', 'db', 'table')". Grabs the parenthesized
 * argument list as one unambiguous chunk first, then splits on commas, so there's
 * no backtracking-prone overlap between quote/whitespace matchers (unlike a single
 * regex with adjacent `'?...'?\s*`).
 */
function parseDistributedEngineFull(engineFull: string): { db: string; table: string } | null {
  const inner = engineFull.match(/Distributed\s*\(([^)]*)\)/i)?.[1];
  if (!inner) return null;

  const args = inner.split(",").map((arg) => arg.trim().replaceAll(/(?:^'|'$)/g, ""));
  if (args.length < 3) return null;

  return { db: args[1], table: args[2] };
}

export const GET = withClusterAccess(async (request, { params }, user) => {
  try {
    const { id, database } = await params;
    const userId = user?.id;

    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const clusterName = searchParams.get("cluster");

    if (!table) {
      return NextResponse.json({ error: "table query parameter is required" }, { status: 400 });
    }

    const quotedDb    = quoteString(database);
    const quotedTable = quoteString(table);
    // Use the specified logical cluster name if provided, otherwise auto-detect from the local node
    const clusterExpr = clusterName
      ? quoteString(clusterName)
      : `(SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1)`;

    // ── Phase 1: Collect related table names from a single node ──────────

    const phase1Query = `
      SELECT
        name,
        engine,
        engine_full,
        create_table_query
      FROM system.tables
      WHERE database = ${quotedDb}
        AND (
          name = ${quotedTable}
          OR (
            engine IN ('View', 'MaterializedView')
            AND create_table_query LIKE concat('%', ${quotedTable}, '%')
          )
          OR (
            engine = 'Distributed'
            AND engine_full LIKE concat('%', ${quotedTable}, '%')
          )
        )
    `;

    const phase1Rows = await executeClickHouseQuery(id, phase1Query, undefined, userId);

    if (!phase1Rows || phase1Rows.length === 0) {
      return NextResponse.json({ nodes: [] });
    }

    const target = (phase1Rows as Array<{
      name: string;
      engine: string;
      engine_full: string;
      create_table_query: string;
    }>).find((row) => row.name === table);

    if (!target) {
      return NextResponse.json({ nodes: [] });
    }

    // Build the set of related tables (keyed by database.table)
    const relatedRefs = new Map<string, { database: string; table: string }>();
    const addRelatedRef = (refDb: string, refTable: string) => {
      const normalized = normalizeDdlRef(refDb, refTable, database);
      if (!normalized.table) return;
      const key = `${normalized.database}.${normalized.table}`;
      if (!relatedRefs.has(key)) {
        relatedRefs.set(key, { database: normalized.database, table: normalized.table });
      }
    };

    addRelatedRef(database, table);

    // forward deps: View / MaterializedView → DDL parsing
    if (target.engine === "View" || target.engine === "MaterializedView") {
      const refs = extractDdlRefs(target.create_table_query, database);
      refs.forEach(({ database: refDb, table: refTable }) => addRelatedRef(refDb, refTable));
    }

    // forward deps: Distributed → local table (engine_full parsing)
    if (target.engine === "Distributed") {
      const parsed = parseDistributedEngineFull(target.engine_full);
      if (parsed?.table) addRelatedRef(parsed.db || database, parsed.table);
    }

    (phase1Rows as Array<{
      name: string;
      engine: string;
      engine_full: string;
      create_table_query: string;
    }>)
      .filter((row) => row.name !== table)
      .forEach((row) => {
        if (row.engine === "View" || row.engine === "MaterializedView") {
          // Check whether the View/MatView actually references the target table via DDL parsing
          const refs = extractDdlRefs(row.create_table_query, database);
          const refersToTarget = refs.some(
            (ref) => ref.table === table && ref.database === database
          );
          if (refersToTarget) {
            addRelatedRef(database, row.name);
            refs.forEach(({ database: refDb, table: refTable }) => addRelatedRef(refDb, refTable));
          }
        }

        if (row.engine === "Distributed") {
          // Check whether the Distributed table points exactly to the target table via engine_full parsing
          const parsed = parseDistributedEngineFull(row.engine_full);
          const localDb = parsed?.db || database;
          const localTable = parsed?.table || "";
          if (localTable === table && localDb === database) {
            addRelatedRef(database, row.name);
          }
        }
      });

    logger.debug(`[Lineage API] Related tables for ${database}.${table}:`, [...relatedRefs.values()]);

    // ── Phase 2: Query only related tables across all nodes ────────────────

    const relatedPredicates = [...relatedRefs.values()]
      .map(({ database: refDb, table: refTable }) => `(database = ${quoteString(refDb)} AND name = ${quoteString(refTable)})`)
      .join(" OR ");

    const allNodesQuery = `
      SELECT
        hostName()                      AS host_name,
        database,
        name,
        engine,
        engine_full,
        create_table_query,
        total_rows                      AS rows,
        formatReadableSize(total_bytes) AS size
      FROM clusterAllReplicas(${clusterExpr}, system.tables)
      WHERE ${relatedPredicates}
      ORDER BY host_name, database, name
      SETTINGS skip_unavailable_shards = 1
    `;

    const allRows = await executeClickHouseQuery(id, allNodesQuery, undefined, userId);

    const nodes = (allRows as Record<string, unknown>[] ?? []).map((r) => {
      const engine = String(r.engine ?? "");
      const ddl    = String(r.create_table_query ?? "");

      // Parse dependent tables from DDL
      let depDatabases: string[] = [];
      let depTables: string[]    = [];

      if (engine === "View" || engine === "MaterializedView") {
        const refs = extractDdlRefs(ddl, String(r.database ?? database));
        depDatabases = refs.map((ref) => ref.database);
        depTables    = refs.map((ref) => `${ref.clause}:${ref.table}`);
      }

      return {
        hostName:    String(r.host_name ?? ""),
        database:    String(r.database ?? ""),
        name:        String(r.name ?? ""),
        engine,
        engineFull:  String(r.engine_full ?? ""),
        depDatabases,
        depTables,
        rows:        String(r.rows ?? "0"),
        size:        String(r.size ?? "0 B"),
      };
    });

    logger.debug(`[Lineage API] Found ${nodes.length} node-table rows (${relatedRefs.size} distinct tables)`);
    return NextResponse.json({ nodes });
  } catch (error) {
    logger.error("[Lineage API] ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch lineage", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
