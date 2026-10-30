"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { applyAlertTimeRangeChange } from "@/components/alert-management/form-state";
import { getTemplateById } from "@/lib/alert/query-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { AlertRuleFormData, AlertRuleFormSyncOptions, AlertThresholdErrors } from "./types";
import { newThresholdRow, sortThresholdRows } from "./utils";
import { ThresholdRowCard } from "./ThresholdRowCard";

export type ThresholdConfigSectionProps = {
  currentFormData: AlertRuleFormData;
  thresholdErrors: AlertThresholdErrors;
  syncFormData: (formData: AlertRuleFormData, options?: AlertRuleFormSyncOptions) => void;
};

export function ThresholdConfigSection({ currentFormData, thresholdErrors, syncFormData }: ThresholdConfigSectionProps) {
  const form = useFormContext<AlertRuleFormData>();
  const thresholdFieldArray = useFieldArray({
    control: form.control,
    name: "thresholds",
    keyName: "fieldKey",
  });

  const syncScalarField = <K extends keyof AlertRuleFormData>(
    field: K,
    value: AlertRuleFormData[K],
    options?: AlertRuleFormSyncOptions
  ) => {
    syncFormData({ ...form.getValues(), [field]: value }, options);
  };

  const replaceDerivedFormData = (nextFormData: AlertRuleFormData, options?: AlertRuleFormSyncOptions) => {
    form.reset(nextFormData);
    syncFormData(nextFormData, options);
  };

  const syncThresholdRows = (thresholds: AlertRuleFormData["thresholds"]) => {
    const sortedThresholds = sortThresholdRows(thresholds);
    thresholdFieldArray.replace(sortedThresholds);
    syncFormData(
      { ...form.getValues(), thresholds: sortedThresholds },
      { clearThresholdErrors: true }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500">
            Threshold Configuration
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Add one or more severity levels for the same metric. Only the highest matched severity
            will alert.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 text-sm"
          type="button"
          onClick={() => {
            const currentThresholds = form.getValues("thresholds");
            syncThresholdRows([
              ...currentThresholds,
              newThresholdRow("critical", currentThresholds[0]?.operator || ">=", "0"),
            ]);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Threshold
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,240px)_1fr] xl:items-start">
          <div className="min-w-0 space-y-1.5">
            <FormField
              control={form.control}
              name="compareColumn"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-1.5">
                  <Label className="text-sm">
                    Column <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      syncScalarField("compareColumn", value, { clearFieldErrors: ["compareColumn"] });
                    }}
                    disabled={!currentFormData.queryTested}
                  >
                    <FormControl>
                      <SelectTrigger
                        className={`h-9 bg-white dark:bg-slate-950 ${
                          fieldState.error ? "border-red-500 focus-visible:ring-red-500" : ""
                        }`}
                      >
                        <SelectValue placeholder={currentFormData.queryTested ? "Select column" : "Run test first"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {currentFormData.queryColumns.map((column) => (
                        <SelectItem key={column} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                  <p className="text-xs text-gray-500">Choose the numeric column from your test result.</p>
                </FormItem>
              )}
            />
          </div>

          <div className="min-w-0 space-y-2">
            <div className="hidden px-1 text-xs uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(120px,0.8fr)_40px] md:gap-2">
              <span>Severity</span>
              <span>Operator</span>
              <span>Value</span>
              <span className="sr-only">Remove</span>
            </div>

            <div className="space-y-2">
              {thresholdFieldArray.fields.map((threshold, index) => (
                <ThresholdRowCard
                  key={threshold.fieldKey}
                  threshold={threshold}
                  index={index}
                  thresholdError={thresholdErrors[threshold.id]}
                  canRemove={currentFormData.thresholds.length > 1}
                  onUpdateThreshold={(updater) =>
                    syncThresholdRows(form.getValues("thresholds").map((t, i) => (i === index ? updater(t) : t)))
                  }
                  onRemove={() =>
                    syncThresholdRows(form.getValues("thresholds").filter((t) => t.id !== threshold.id))
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {currentFormData.timeRangeMinutes && (
          <FormField
            control={form.control}
            name="timeRangeMinutes"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <Label className="text-sm">
                  Time Range (min) <span className="text-red-500">*</span>
                </Label>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      replaceDerivedFormData(
                        applyAlertTimeRangeChange(
                          form.getValues(),
                          e.target.value,
                          getTemplateById(form.getValues("selectedTemplate"))
                        )
                      );
                    }}
                    className="h-9"
                    min="1"
                    placeholder="5"
                  />
                </FormControl>
                <p className="text-xs text-gray-500">Time range for the query</p>
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="checkInterval"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-1.5">
              <Label className="text-sm">
                Check Interval (min) <span className="text-red-500">*</span>
              </Label>
              <FormControl>
                <Input
                  {...field}
                  type="number"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    syncScalarField("checkInterval", e.target.value, { clearFieldErrors: ["checkInterval"] });
                  }}
                  className={`h-9 ${fieldState.error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  min="1"
                  placeholder="5"
                />
              </FormControl>
              <FormMessage className="text-xs" />
              <p className="text-xs text-gray-500">Alert check frequency</p>
            </FormItem>
          )}
        />
      </div>
      <p className="rounded bg-blue-50 px-3 py-2 text-xs text-gray-500">
        Alert evaluates{" "}
        <span className="font-mono text-gray-700">{currentFormData.compareColumn || "column"}</span>{" "}
        against the configured thresholds and sends only the highest matched severity.
      </p>
    </div>
  );
}
