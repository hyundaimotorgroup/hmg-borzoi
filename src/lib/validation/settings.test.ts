import { describe, expect, it } from "vitest";

import { displaySettingsSchema, generalSettingsSchema } from "./settings";

describe("settings validation", () => {
  it("accepts valid general settings", () => {
    const result = generalSettingsSchema.safeParse({
      appName: "ClickHouse Monitor",
      defaultCluster: "ckc01",
      refreshInterval: "60",
      cacheTTL: "60",
      timezone: "UTC",
      language: "en",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid cache ttl", () => {
    const result = generalSettingsSchema.safeParse({
      appName: "ClickHouse Monitor",
      defaultCluster: "ckc01",
      refreshInterval: "60",
      cacheTTL: "0",
      timezone: "UTC",
      language: "en",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid display settings", () => {
    const result = displaySettingsSchema.safeParse({
      theme: "system",
      compactMode: false,
      showGridLines: true,
      defaultChartType: "line",
    });

    expect(result.success).toBe(true);
  });
});
