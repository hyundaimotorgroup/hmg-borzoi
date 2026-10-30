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

  it("adds a default limit to select-like queries without one", () => {
    expect(prepareQueryForExecution("SELECT * FROM system.tables")).toEqual({
      query: `SELECT * FROM (SELECT * FROM system.tables) AS subquery LIMIT ${QUERY_EXECUTION_DEFAULT_LIMIT}`,
      limitAdded: true,
      limitValue: QUERY_EXECUTION_DEFAULT_LIMIT,
    });
  });

  it("keeps explicit limits untouched", () => {
    expect(prepareQueryForExecution("SELECT * FROM system.tables LIMIT 10")).toEqual({
      query: "SELECT * FROM system.tables LIMIT 10",
      limitAdded: false,
      limitValue: undefined,
    });
  });
});
