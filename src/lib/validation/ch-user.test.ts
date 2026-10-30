import { describe, expect, it } from "vitest";

import { createCHUserSchema, updateCHUserSchema } from "./ch-user";
import { splitSqlStatements } from "./sql";

describe("ch user validation", () => {
  it("accepts form-based user creation", () => {
    const result = createCHUserSchema.safeParse({
      username: "analytics",
      password: "secret",
      authType: "sha256_password",
      roles: ["reader"],
      profiles: ["readonly"],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      username: "analytics",
      password: "secret",
      authType: "sha256_password",
      roles: ["reader"],
      profiles: ["readonly"],
    });
  });

  it("requires password for password-based user creation", () => {
    const result = createCHUserSchema.safeParse({
      username: "analytics",
      authType: "sha256_password",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Password is required for the selected authentication type");
  });

  it("accepts sql-based user updates without username", () => {
    const result = updateCHUserSchema.safeParse({
      sqlQuery: "ALTER USER analytics SETTINGS PROFILE readonly",
    });

    expect(result.success).toBe(true);
  });

  it("requires username for form-based user updates", () => {
    const result = updateCHUserSchema.safeParse({
      roles: ["reader"],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Username is required");
  });

  it("splits SQL statements for user mutations", () => {
    expect(splitSqlStatements("CREATE USER a; GRANT reader TO a;")).toEqual([
      "CREATE USER a",
      "GRANT reader TO a",
    ]);
  });
});
