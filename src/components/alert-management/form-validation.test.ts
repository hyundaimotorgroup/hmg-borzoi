import { describe, expect, it } from "vitest";

import {
  buildAlertChannelErrorMap,
  buildAlertFormErrorState,
  parseAlertNotificationTestForm,
  parseAlertRuleForm,
  parseAlertRuleTestForm,
} from "./form-validation";
import { emptyForm, newChannel, newThresholdRow } from "./utils";

describe("alert form validation helpers", () => {
  it("converts form state into create payload with db notification channels", () => {
    const formData = {
      ...emptyForm(),
      cluster: "ckc01",
      name: "High CPU",
      description: "CPU threshold alert",
      sqlQuery: "SELECT 95 AS cpu_usage",
      checkInterval: "5",
      compareColumn: "cpu_usage",
      thresholds: [newThresholdRow("warning", ">=", "80"), newThresholdRow("critical", ">=", "95")],
      channels: [{ ...newChannel(), url: "https://hooks.slack.com/services/test" }],
    };

    const result = parseAlertRuleForm(formData);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      clusterId: "ckc01",
      name: "High CPU",
      description: "CPU threshold alert",
      query: "SELECT 95 AS cpu_usage",
      checkIntervalMinutes: 5,
      thresholdColumnName: "cpu_usage",
      enabled: true,
      thresholds: [
        { severity: "warning", operator: ">=", value: 80, order: 0 },
        { severity: "critical", operator: ">=", value: 95, order: 1 },
      ],
      notificationChannels: [
        {
          type: "slack",
          url: "https://hooks.slack.com/services/test",
          templateType: "basic",
        },
      ],
    });
  });

  it("rejects invalid numeric threshold values before API submission", () => {
    const formData = {
      ...emptyForm(),
      cluster: "ckc01",
      name: "High CPU",
      thresholds: [newThresholdRow("warning", ">=", "abc")],
    };

    const result = parseAlertRuleForm(formData);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid number");
  });

  it("keeps API-level cluster validation when all clusters are selected", () => {
    const formData = {
      ...emptyForm(),
      cluster: "all",
      name: "High CPU",
    };

    const result = parseAlertRuleForm(formData);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Please select a specific cluster");
  });

  it("creates query test payload with numeric thresholds", () => {
    const formData = {
      ...emptyForm(),
      cluster: "ckc01",
      sqlQuery: "SELECT 1 AS value",
      compareColumn: "",
      thresholds: [newThresholdRow("warning", ">=", "10")],
    };

    const result = parseAlertRuleTestForm(formData);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      clusterId: "ckc01",
      query: "SELECT 1 AS value",
      thresholdColumnName: undefined,
      thresholds: [{ severity: "warning", operator: ">=", value: 10, order: 0 }],
    });
  });

  it("uses fallback name for notification tests and maps channel errors by channel id", () => {
    const channel = {
      ...newChannel(),
      id: "channel-1",
      url: "",
    };
    const formData = {
      ...emptyForm(),
      cluster: "ckc01",
      name: "",
      sqlQuery: "SELECT 1 AS value",
      compareColumn: "value",
      thresholds: [newThresholdRow("warning", ">=", "1")],
    };

    const invalidResult = parseAlertNotificationTestForm(formData, channel);
    expect(invalidResult.success).toBe(false);
    expect(buildAlertChannelErrorMap([channel], invalidResult.error!, "channel")).toEqual({
      "channel-1": "Enter an address matching the channel type",
    });

    const validResult = parseAlertNotificationTestForm(formData, { ...channel, url: "https://hooks.slack.com/services/test" });
    expect(validResult.success).toBe(true);
    expect(validResult.data).toMatchObject({
      clusterId: "ckc01",
      name: "Test Alert",
      thresholdColumnName: "value",
      channel: {
        type: "slack",
        url: "https://hooks.slack.com/services/test",
      },
    });
  });

  it("maps API validation issues back to form fields", () => {
    const formData = {
      ...emptyForm(),
      cluster: "all",
      name: "",
      sqlQuery: "",
      compareColumn: "",
      thresholds: [newThresholdRow("warning", ">=", "1")],
      channels: [{ ...newChannel(), url: "https://hooks.slack.com/services/test" }],
    };

    const result = parseAlertRuleForm(formData);
    expect(result.success).toBe(false);

    expect(buildAlertFormErrorState(formData, result.error!)).toEqual({
      fieldErrors: {
        cluster: "Please select a specific cluster",
        name: "Alert rule name is required",
        sqlQuery: "SQL query is required",
      },
      thresholdErrors: {},
    });
  });

  it("maps threshold parsing issues back to threshold row ids", () => {
    const threshold = newThresholdRow("warning", ">=", "abc");
    const formData = {
      ...emptyForm(),
      cluster: "ckc01",
      name: "Threshold Alert",
      sqlQuery: "SELECT 1 AS value",
      thresholds: [threshold],
      channels: [{ ...newChannel(), url: "https://hooks.slack.com/services/test" }],
    };

    const result = parseAlertRuleForm(formData);
    expect(result.success).toBe(false);

    expect(buildAlertFormErrorState(formData, result.error!)).toEqual({
      fieldErrors: {},
      thresholdErrors: {
        [threshold.id]: "Enter a valid number",
      },
    });
  });
});
