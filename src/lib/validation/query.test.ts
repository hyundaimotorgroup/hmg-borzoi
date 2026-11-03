import { describe, expect, it } from "vitest";

import {
  prepareQueryForExecution,
  QUERY_EXECUTION_DEFAULT_LIMIT,
  queryExecutionSchema,
} from "./query";

describe("query execution validation", () => {
  it("accepts select queries", () => {
    const result = queryExecutionSchema.safeParse({
      query: " SELECT * FROM system.tables ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.query).toBe("SELECT * FROM system.tables");
  });

  it("accepts non-empty query text", () => {
    const result = queryExecutionSchema.safeParse({
      query: "hello world",
    });

    expect(result.success).toBe(true);
    expect(result.data?.query).toBe("hello world");
  });

  it.each([
    "SELECT * FROM system.tables",
    "SELECT * FROM system.tables;",
  ])("adds a default limit to select-like queries without one: %s", (query) => {
    expect(prepareQueryForExecution(query)).toEqual({
      query: `SELECT * FROM (SELECT * FROM system.tables\n) AS subquery LIMIT ${QUERY_EXECUTION_DEFAULT_LIMIT}`,
      limitAdded: true,
      limitValue: QUERY_EXECUTION_DEFAULT_LIMIT,
    });
  });

  it.each([
    "SELECT 1 -- trailing comment",
    "SELECT *\nFROM system.tables\n-- trailing comment",
    "WITH 1 AS value SELECT value -- LIMIT is only a comment",
  ])("keeps the wrapper outside trailing line comments: %s", (query) => {
    expect(prepareQueryForExecution(query)).toEqual({
      query: `SELECT * FROM (${query}\n) AS subquery LIMIT ${QUERY_EXECUTION_DEFAULT_LIMIT}`,
      limitAdded: true,
      limitValue: QUERY_EXECUTION_DEFAULT_LIMIT,
    });
  });

  it("preserves comment markers inside literals and block comments", () => {
    const query = "SELECT '--literal' AS value /* keep this comment */";

    expect(prepareQueryForExecution(query)).toEqual({
      query: `SELECT * FROM (${query}\n) AS subquery LIMIT ${QUERY_EXECUTION_DEFAULT_LIMIT}`,
      limitAdded: true,
      limitValue: QUERY_EXECUTION_DEFAULT_LIMIT,
    });
  });

  it.each([
    "SELECT * FROM system.tables LIMIT 10",
    "SELECT * FROM system.tables LIMIT 10 -- trailing comment",
  ])("keeps explicit limits untouched: %s", (query) => {
    expect(prepareQueryForExecution(query)).toEqual({
      query,
      limitAdded: false,
      limitValue: undefined,
    });
  });
});
