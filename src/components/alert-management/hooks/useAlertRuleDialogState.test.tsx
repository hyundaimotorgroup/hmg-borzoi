import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { emptyForm, newChannel, newThresholdRow } from "../utils";
import { useAlertRuleDialogState } from "./useAlertRuleDialogState";

describe("useAlertRuleDialogState", () => {
  it("syncs form data and clears only the requested error buckets", () => {
    const { result } = renderHook(() => useAlertRuleDialogState());

    act(() => {
      result.current.replaceValidationState({
 fieldErrors: { name: " ", cluster: "Select a cluster" },
 thresholdErrors: { threshold1: " " },
 channelErrors: { channel1: "URL " },
      });
    });

    act(() => {
      result.current.syncFormData(
        {
          ...emptyForm(),
          name: "CPU Alert",
        },
        {
          clearFieldErrors: ["name"],
          clearThresholdErrors: true,
        }
      );
    });

    expect(result.current.formData.name).toBe("CPU Alert");
    expect(result.current.fieldErrors).toEqual({ cluster: "Select a cluster" });
    expect(result.current.thresholdErrors).toEqual({});
 expect(result.current.channelErrors).toEqual({ channel1: "URL " });
  });

  it("merges validation state and clears channel-specific errors on demand", () => {
    const { result } = renderHook(() => useAlertRuleDialogState());

    act(() => {
      result.current.mergeValidationState({
 fieldErrors: { sqlQuery: " " },
 thresholdErrors: { threshold1: " " },
 channelErrors: { channel1: "URL " },
      });
    });

    act(() => {
      result.current.mergeValidationState({
 fieldErrors: { compareColumn: " " },
 thresholdErrors: { threshold2: " " },
 channelErrors: { channel2: " URL " },
      });
    });

    act(() => {
      result.current.clearChannelError("channel1");
    });

    expect(result.current.fieldErrors).toEqual({
 sqlQuery: " ",
 compareColumn: " ",
    });
 expect(result.current.thresholdErrors).toEqual({ threshold2: " " });
 expect(result.current.channelErrors).toEqual({ channel2: " URL " });
  });

  it("resets form, variable panels, and testing state together", () => {
    const { result } = renderHook(() => useAlertRuleDialogState());

    act(() => {
      result.current.setHydratedFormData({
        ...emptyForm(),
        name: "Memory Alert",
        thresholds: [newThresholdRow("warning", ">=", "80")],
        channels: [newChannel()],
      });
      result.current.toggleVariablePanel("channel-1", true);
      result.current.setTestingChannelId("channel-1");
      result.current.replaceValidationState({
 fieldErrors: { name: " " },
 thresholdErrors: { threshold1: " " },
 channelErrors: { "channel-1": " " },
      });
    });

    act(() => {
      result.current.resetState();
    });

    expect(result.current.formData).toMatchObject({
      ...emptyForm(),
      thresholds: [
        expect.objectContaining({
          severity: "warning",
          operator: ">=",
          value: "80",
        }),
      ],
      channels: [
        expect.objectContaining({
          type: "Slack",
          url: "",
          messageTemplate: "default — standard format (with table)",
        }),
      ],
    });
    expect(result.current.openVariablePanels).toEqual({});
    expect(result.current.testingChannelId).toBeNull();
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.thresholdErrors).toEqual({});
    expect(result.current.channelErrors).toEqual({});
  });
});
