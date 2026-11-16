import { describe, expect, it } from "vitest";

import {
  alertNotificationTestSchema,
  alertRuleApiCreateSchema,
  alertRuleApiPatchSchema,
  alertRuleTestSchema,
  alertRuleTriggerSchema,
  getNotificationChannelIssueMap,
  serializeAlertThresholds,
} from "./validation";

describe("alert validation helpers", () => {
  it("leaves an empty PATCH empty instead of applying create defaults", () => {
    expect(alertRuleApiPatchSchema.parse({})).toEqual({});
  });

  it("does not add enabled or resultDisplayMode to a name-only PATCH", () => {
    expect(alertRuleApiPatchSchema.parse({ name: "Renamed alert" })).toEqual({ name: "Renamed alert" });
  });

  it.each([true, false])("preserves an explicit enabled=%s PATCH", (enabled) => {
    expect(alertRuleApiPatchSchema.parse({ enabled })).toEqual({ enabled });
  });

  it("preserves an explicitly supplied result display mode in a PATCH", () => {
    expect(alertRuleApiPatchSchema.parse({ resultDisplayMode: "showAll" })).toEqual({ resultDisplayMode: "showAll" });
  });

  it("keeps enabled and result display defaults for alert creation", () => {
    const result = alertRuleApiCreateSchema.parse({
      clusterId: "ckc01",
      name: "High CPU",
      query: "SELECT value FROM metrics",
      checkIntervalMinutes: 5,
      thresholds: [{ severity: "warning", operator: ">=", value: 80 }],
      notificationChannels: [{ type: "webhook", url: "https://example.com/alerts" }],
    });
    expect(result.enabled).toBe(true);
    expect(result.resultDisplayMode).toBe("showOnlyTriggering");
  });

  it("serializes thresholds with optional order", () => {
    expect(
      serializeAlertThresholds([
        { severity: "warning", operator: ">=", value: 80, order: 0 },
        { severity: "critical", operator: ">=", value: 95 },
      ])
    ).toEqual([
      { severity: "warning", operator: ">=", value: 80, order: 0 },
      { severity: "critical", operator: ">=", value: 95 },
    ]);
  });

  it("extracts indexed notification channel issues", () => {
    const result = alertRuleApiCreateSchema.safeParse({
      clusterId: "ckc01",
      name: "High CPU",
      query: "SELECT value FROM metrics",
      checkIntervalMinutes: 5,
      thresholds: [{ severity: "warning", operator: ">=", value: 80, order: 0 }],
      notificationChannels: [{ type: "slack" }],
      enabled: true,
    });

    expect(result.success).toBe(false);
    expect(getNotificationChannelIssueMap(result.error!)).toEqual({
      0: "Enter an address matching the channel type",
    });
  });

  it("extracts single test-notification channel issues as first channel", () => {
    const result = alertNotificationTestSchema.safeParse({
      clusterId: "ckc01",
      name: "High CPU",
      query: "SELECT value FROM metrics",
      thresholds: [{ severity: "warning", operator: ">=", value: 80, order: 0 }],
      channel: { type: "email" },
    });

    expect(result.success).toBe(false);
    expect(getNotificationChannelIssueMap(result.error!, "channel")).toEqual({
      0: "Enter an address matching the channel type",
    });
  });

  it("requires alertRuleId for manual triggers", () => {
    const result = alertRuleTriggerSchema.safeParse({
      alertRuleId: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("alertRuleId is required");
  });

  it("allows SELECT queries referencing columns containing forbidden substrings", () => {
    const result = alertRuleTestSchema.safeParse({
      clusterId: "ckc02",
      query:
        "SELECT max(dateDiff('second', query_create_time, now())) as oldest_pending_ddl_seconds FROM system.distributed_ddl_queue WHERE cluster = 'ckc02' AND status IN ('Inactive', 'Active', 'Unknown')",
      thresholds: [{ severity: "warning", operator: ">=", value: 60, order: 0 }],
    });

    expect(result.success).toBe(true);
  });

  it("still rejects queries containing standalone forbidden keywords", () => {
    const result = alertRuleTestSchema.safeParse({
      clusterId: "ckc02",
      query: "SELECT 1; DROP TABLE metrics",
      thresholds: [{ severity: "warning", operator: ">=", value: 60, order: 0 }],
    });

    expect(result.success).toBe(false);
  });
});
