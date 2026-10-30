import { describe, expect, it } from "vitest";

import { emptyForm } from "./utils";
import {
  applyAlertQueryTestColumns,
  applyAlertQueryTestFailure,
  applyAlertQueryTestSuccess,
  applyAlertSqlQueryChange,
  applyAlertTemplateSelection,
  applyAlertTimeRangeChange,
  normalizeAlertMatchedSeverity,
  resetAlertQueryState,
} from "./form-state";
import { getTemplateById } from "@/lib/alert/query-templates";

describe("alert form state helpers", () => {
  it("resets query test state while preserving overrides", () => {
    const formData = {
      ...emptyForm(),
      queryTested: true,
      queryColumns: ["value"],
      testResult: { success: true, rowCount: 1 },
    };

    expect(resetAlertQueryState(formData, { sqlQuery: "SELECT 1" })).toMatchObject({
      sqlQuery: "SELECT 1",
      queryTested: false,
      queryColumns: [],
      testResult: null,
    });
  });

  it("marks manual SQL edits as custom and clears stale test results", () => {
    const formData = {
      ...emptyForm(),
      selectedTemplate: "memory_usage",
      queryTested: true,
      queryColumns: ["memory_gb"],
      testResult: { success: true, rowCount: 1 },
    };

    expect(applyAlertSqlQueryChange(formData, "SELECT count() AS value FROM system.tables")).toMatchObject({
      sqlQuery: "SELECT count() AS value FROM system.tables",
      selectedTemplate: "custom",
      queryTested: false,
      queryColumns: [],
      testResult: null,
    });
  });

  it("applies template time range changes to the query and resets test state", () => {
    const template = getTemplateById("failed_queries");
    expect(template).toBeDefined();

    const formData = {
      ...emptyForm(),
      selectedTemplate: "failed_queries",
      timeRangeMinutes: "5",
      queryTested: true,
      queryColumns: ["failed_count"],
      testResult: { success: true, rowCount: 1 },
    };

    const nextState = applyAlertTimeRangeChange(formData, "15", template);
    expect(nextState.timeRangeMinutes).toBe("15");
    expect(nextState.sqlQuery).toContain("INTERVAL 15 MINUTE");
    expect(nextState.queryTested).toBe(false);
    expect(nextState.queryColumns).toEqual([]);
    expect(nextState.testResult).toBeNull();
  });

  it("keeps the existing query when time range input is invalid", () => {
    const template = getTemplateById("failed_queries");
    expect(template).toBeDefined();

    const formData = {
      ...emptyForm(),
      selectedTemplate: "failed_queries",
      sqlQuery: "SELECT 1",
      queryTested: true,
    };

    const nextState = applyAlertTimeRangeChange(formData, "abc", template);
    expect(nextState.timeRangeMinutes).toBe("abc");
    expect(nextState.sqlQuery).toBe("SELECT 1");
    expect(nextState.queryTested).toBe(true);
  });

  it("fills template defaults without overwriting user-customized fields", () => {
    const previousTemplate = getTemplateById("memory_usage");
    const nextTemplate = getTemplateById("disk_usage");
    expect(previousTemplate).toBeDefined();
    expect(nextTemplate).toBeDefined();

    const formData = {
      ...emptyForm(),
      selectedTemplate: "memory_usage",
 name: " ",
      description: previousTemplate?.description ?? "",
      compareColumn: previousTemplate?.suggestedColumn ?? "",
    };

    const nextState = applyAlertTemplateSelection(formData, nextTemplate!, previousTemplate);
    expect(nextState.selectedTemplate).toBe("disk_usage");
    expect(nextState.templateCategory).toBe("system");
 expect(nextState.name).toBe(" ");
    expect(nextState.description).toBe(nextTemplate?.description);
    expect(nextState.compareColumn).toBe(nextTemplate?.suggestedColumn);
    expect(nextState.checkInterval).toBe(String(nextTemplate?.suggestedCheckIntervalMinutes));
    expect(nextState.queryTested).toBe(false);
    expect(nextState.testResult).toBeNull();
  });

  it("applies query test success metadata and picks a compare column", () => {
    const formData = {
      ...emptyForm(),
      compareColumn: "",
    };

    const nextState = applyAlertQueryTestSuccess(formData, {
      columns: ["value", "count"],
      numericColumns: ["count"],
      rowCount: 3,
      thresholdMet: true,
      matchedSeverity: "warning",
      executionTimeMs: 42,
    });

    expect(nextState.queryTested).toBe(true);
    expect(nextState.queryColumns).toEqual(["value", "count"]);
    expect(nextState.compareColumn).toBe("count");
    expect(nextState.testResult).toEqual({
      success: true,
      rowCount: 3,
      thresholdMet: true,
      matchedSeverity: "warning",
      executionTimeMs: 42,
    });
  });

  it("keeps query columns without test result when only edit-load metadata exists", () => {
    const formData = {
      ...emptyForm(),
      queryTested: false,
      queryColumns: [],
    };

    const nextState = applyAlertQueryTestColumns(formData, ["threshold_value"]);
    expect(nextState.queryTested).toBe(true);
    expect(nextState.queryColumns).toEqual(["threshold_value"]);
    expect(nextState.testResult).toBeNull();
  });

  it("applies query test failure details without clearing other form fields", () => {
    const formData = {
      ...emptyForm(),
      name: "CPU Alert",
    };

    const nextState = applyAlertQueryTestFailure(formData, {
      columns: ["value"],
      error: "Query test failed",
    });

    expect(nextState.name).toBe("CPU Alert");
    expect(nextState.queryTested).toBe(true);
    expect(nextState.queryColumns).toEqual(["value"]);
    expect(nextState.testResult).toEqual({
      success: false,
      error: "Query test failed",
    });
  });

  it("normalizes only supported matched severity values", () => {
    expect(normalizeAlertMatchedSeverity("critical")).toBe("critical");
    expect(normalizeAlertMatchedSeverity("warning")).toBe("warning");
    expect(normalizeAlertMatchedSeverity("info")).toBe("info");
    expect(normalizeAlertMatchedSeverity("unknown")).toBeUndefined();
  });
});
