import { describe, expect, it } from "vitest";

import { parseDdlObjectReference } from "./query-log";

describe("parseDdlObjectReference", () => {
  it("extracts an explicitly qualified table name", () => {
    expect(
      parseDdlObjectReference("CREATE TABLE analytics.events (id UInt64)", "default")
    ).toEqual({
      database: "analytics",
      table: "events",
    });
  });

  it("keeps the current database for unqualified table names", () => {
    expect(
      parseDdlObjectReference("ALTER TABLE events ADD COLUMN user_id UInt64", "warehouse")
    ).toEqual({
      database: "warehouse",
      table: "events",
    });
  });

  it("normalizes a malformed current_database fallback containing a table suffix", () => {
    expect(
      parseDdlObjectReference("GRANT SELECT ON default.events TO analyst", "default.events")
    ).toEqual({
      database: "default",
      table: "events",
    });
  });

  it("returns database-only references for database DDL", () => {
    expect(
      parseDdlObjectReference("CREATE DATABASE reporting", "default")
    ).toEqual({
      database: "reporting",
    });
  });
});
