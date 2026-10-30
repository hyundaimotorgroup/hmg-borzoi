import { describe, expect, it } from "vitest";

import {
  chProfileSettingsInputSchema,
  createCHProfileSchema,
  updateCHProfileSchema,
} from "./ch-profile";
import { splitSqlStatements } from "./sql";

describe("ch profile validation", () => {
  it("accepts form-based profile creation", () => {
    const result = createCHProfileSchema.safeParse({
      profileName: "readonly_profile",
      settings: [
        { name: "readonly", value: "1", mode: "READONLY" },
        { name: "max_threads", value: 8 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts object-shaped profile settings", () => {
    const result = chProfileSettingsInputSchema.safeParse({
      readonly: "1",
      max_threads: 8,
    });

    expect(result.success).toBe(true);
  });

  it("requires profileName when sqlQuery is absent", () => {
    const result = updateCHProfileSchema.safeParse({
      settings: [{ name: "readonly", value: "1" }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Profile name is required");
  });

  it("requires some setting payload content", () => {
    const result = chProfileSettingsInputSchema.safeParse([
      { name: "readonly" },
    ]);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Setting value, range, or mode is required.");
  });

  it("splits sql statements for profile mutations", () => {
    expect(splitSqlStatements("CREATE SETTINGS PROFILE a; ALTER SETTINGS PROFILE a SETTINGS readonly = 1;")).toEqual([
      "CREATE SETTINGS PROFILE a",
      "ALTER SETTINGS PROFILE a SETTINGS readonly = 1",
    ]);
  });
});
