import { describe, expect, it } from "vitest";

import {
  alertNotificationTestSchema,
  alertRuleApiCreateSchema,
  alertRuleTestSchema,
  alertRuleTriggerSchema,
  getNotificationChannelIssueMap,
  serializeAlertThresholds,
} from "./validation";

describe("alert validation helpers", () => {
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
