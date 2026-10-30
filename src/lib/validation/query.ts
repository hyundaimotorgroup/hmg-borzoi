import { z } from "zod";

export const QUERY_EXECUTION_DEFAULT_LIMIT = 1000;

export const queryExecutionSchema = z.object({
  query: z.string().trim().min(1, "Query is required"),
});

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--[^\r\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function prepareQueryForExecution(
  query: string,
  limitValue = QUERY_EXECUTION_DEFAULT_LIMIT
) {
  let normalizedQuery = query.trim();
  let limitAdded = false;

  const strippedQuery = stripSqlComments(normalizedQuery);
  const isSelectLike = /^(WITH|SELECT)\b/i.test(strippedQuery);
  const hasLimit = /\bLIMIT\b/i.test(strippedQuery);
  if (isSelectLike && !hasLimit) {
    if (normalizedQuery.endsWith(";")) {
      normalizedQuery = normalizedQuery.slice(0, -1).trim();
    }
    normalizedQuery = `SELECT * FROM (${normalizedQuery}) AS subquery LIMIT ${limitValue}`;
    limitAdded = true;
  }

  return {
    query: normalizedQuery,
    limitAdded,
    limitValue: limitAdded ? limitValue : undefined,
  };
}
