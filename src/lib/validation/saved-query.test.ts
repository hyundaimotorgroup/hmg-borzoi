import { describe, expect, it } from "vitest";

import { createSavedQuerySchema, updateSavedQuerySchema } from "./saved-query";

describe("saved query validation", () => {
  it("accepts a valid saved query payload", () => {
    const result = createSavedQuerySchema.safeParse({
      name: "Top slow queries",
      query: "SELECT * FROM system.query_log LIMIT 10",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Top slow queries",
      query: "SELECT * FROM system.query_log LIMIT 10",
    });
  });

  it("trims saved query fields", () => {
    const result = createSavedQuerySchema.safeParse({
      name: "  Top slow queries  ",
      query: "  SELECT 1  ",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Top slow queries",
      query: "SELECT 1",
    });
  });

  it("rejects empty saved query names", () => {
    const result = createSavedQuerySchema.safeParse({
      name: "   ",
      query: "SELECT 1",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Please enter a query name.");
  });

  it("requires at least one field for updates", () => {
    const result = updateSavedQuerySchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Please enter a name or query to update.");
  });
});
