import { describe, expect, it } from "vitest";

import { chRoleMutationSchema, splitSqlStatements } from "./ch-role";

describe("ch role validation", () => {
  it("accepts form-based role mutations", () => {
    const result = chRoleMutationSchema.safeParse({
      roleName: "analytics_reader",
      profiles: ["readonly"],
      logicalCluster: "cluster_a",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      roleName: "analytics_reader",
      profiles: ["readonly"],
      logicalCluster: "cluster_a",
    });
  });

  it("accepts sql-based role mutations without roleName", () => {
    const result = chRoleMutationSchema.safeParse({
      sqlQuery: "CREATE ROLE analytics_reader",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      sqlQuery: "CREATE ROLE analytics_reader",
    });
  });

  it("requires roleName when sqlQuery is absent", () => {
    const result = chRoleMutationSchema.safeParse({
      profiles: ["readonly"],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Role name is required");
  });

  it("splits sql statements on semicolons and trims blanks", () => {
    expect(splitSqlStatements("CREATE ROLE a; GRANT SELECT ON db.* TO a; ;")).toEqual([
      "CREATE ROLE a",
      "GRANT SELECT ON db.* TO a",
    ]);
  });
});
