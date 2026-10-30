import { describe, expect, it } from "vitest";
import { getSqlCompletions, normalizeSqlIdentifier } from "./sql-autocomplete";

const metadata = {
  databases: ["default", "analytics"],
  tablesByDatabase: {
    default: ["events", "users"],
    analytics: ["daily_rollup"],
  },
};

describe("sql autocomplete helpers", () => {
  it("normalizes quoted identifiers", () => {
    expect(normalizeSqlIdentifier("`default`")).toBe("default");
    expect(normalizeSqlIdentifier('"analytics"')).toBe("analytics");
  });

  it("prioritizes tables after FROM", () => {
    const completions = getSqlCompletions("SELECT * FROM ", metadata);
    expect(completions[0]?.detail).toBe("Table");
    expect(completions[1]?.detail).toBe("Table");
    expect(completions.some((entry) => entry.label === "default.events")).toBe(true);
  });

  it("returns database-scoped tables after database dot", () => {
    const completions = getSqlCompletions("SELECT * FROM default.", metadata);
    expect(completions.map((entry) => entry.label)).toEqual(["events", "users"]);
  });

  it("prioritizes databases after USE", () => {
    const completions = getSqlCompletions("USE ", metadata);
    expect(completions[0]?.label).toBe("analytics");
    expect(completions[1]?.label).toBe("default");
  });
});
