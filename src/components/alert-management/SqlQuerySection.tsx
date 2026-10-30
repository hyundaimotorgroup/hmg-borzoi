"use client";

import dynamic from "next/dynamic";
import { useFormContext } from "react-hook-form";
import {
  applyAlertSqlQueryChange,
  applyAlertTemplateSelection,
} from "@/components/alert-management/form-state";
import {
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  getTemplateById,
} from "@/lib/alert/query-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { CheckCircle, XCircle } from "lucide-react";

import type { AlertRuleFormData, AlertRuleFormSyncOptions } from "./types";

const SQLEditor = dynamic(() => import("../SQLEditor").then(m => ({ default: m.SQLEditor })), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
      Loading editor…
    </div>
  ),
});

export type SqlQuerySectionProps = {
  currentFormData: AlertRuleFormData;
  handleTestQuery: (formData: AlertRuleFormData) => Promise<AlertRuleFormData | null>;
  syncFormData: (formData: AlertRuleFormData, options?: AlertRuleFormSyncOptions) => void;
};

export function SqlQuerySection({ currentFormData, handleTestQuery, syncFormData }: SqlQuerySectionProps) {
  const form = useFormContext<AlertRuleFormData>();
  const filteredTemplates = getTemplatesByCategory(currentFormData.templateCategory);
  const selectedTemplate =
    currentFormData.selectedTemplate !== "custom" ? getTemplateById(currentFormData.selectedTemplate) : undefined;
  const selectedCategory = selectedTemplate
    ? TEMPLATE_CATEGORIES.find((category) => category.value === selectedTemplate.category)
    : undefined;

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

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs uppercase tracking-wider text-gray-500">SQL Query</p>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-6 shrink-0 px-2 text-[10px] sm:h-7 sm:px-2.5 sm:text-[11px]"
          type="button"
          onClick={async () => {
            const nextFormData = await handleTestQuery(form.getValues());
            if (nextFormData) {
              replaceDerivedFormData(nextFormData);
            }
          }}
        >
          Run Test
        </Button>
      </div>
      <div className="mb-3 overflow-x-auto pb-1">
        <div className="grid min-w-[620px] grid-cols-5 gap-2">
          {TEMPLATE_CATEGORIES.map((category) => (
            <Button
              key={category.value}
              variant={currentFormData.templateCategory === category.value ? "default" : "outline"}
              size="sm"
              className="h-auto min-h-8 w-full px-2 py-2 text-xs"
              type="button"
              onClick={() => {
                form.setValue("templateCategory", category.value);
                syncScalarField("templateCategory", category.value);
              }}
            >
              <span className="mr-1">{category.icon}</span>
              {category.label}
            </Button>
          ))}
        </div>
      </div>
      {currentFormData.templateCategory !== "custom" && (
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {filteredTemplates.map((template) => (
            <Button
              key={template.id}
              variant={currentFormData.selectedTemplate === template.id ? "default" : "outline"}
              size="sm"
              className="h-auto min-w-0 items-start justify-start px-3 py-3 text-left"
              type="button"
              onClick={() => {
                const currentValues = form.getValues();
                const previousTemplate =
                  currentValues.selectedTemplate !== "custom"
                    ? getTemplateById(currentValues.selectedTemplate)
                    : undefined;
                replaceDerivedFormData(applyAlertTemplateSelection(currentValues, template, previousTemplate));
              }}
            >
              <span className="text-xs">{template.name}</span>
              <span className="mt-1 line-clamp-2 whitespace-normal break-words text-[10px] font-normal text-gray-500 dark:text-gray-400">
                {template.description}
              </span>
            </Button>
          ))}
          <Button
            variant={currentFormData.selectedTemplate === "custom" ? "default" : "outline"}
            size="sm"
            className="h-auto min-w-0 items-start justify-start px-3 py-3 text-left"
            type="button"
            onClick={() => {
              form.setValue("selectedTemplate", "custom");
              syncScalarField("selectedTemplate", "custom");
            }}
          >
            <span className="text-xs">Edit manually</span>
            <span className="mt-1 whitespace-normal break-words text-[10px] font-normal text-gray-500 dark:text-gray-400">
              Custom query
            </span>
          </Button>
        </div>
      )}
      {selectedTemplate && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-gray-900 dark:text-gray-100">{selectedTemplate.name}</p>
              <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">
                {selectedTemplate.description}
              </p>
            </div>
            {selectedCategory && (
              <Badge variant="outline" className="shrink-0">
                {selectedCategory.icon} {selectedCategory.label}
              </Badge>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-white/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-gray-500">Suggested column</p>
              <p className="mt-1 break-all font-mono text-gray-900 dark:text-gray-100">
                {selectedTemplate.suggestedColumn}
              </p>
            </div>
            <div className="rounded-lg border border-white/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-gray-500">Suggested threshold</p>
              <p className="mt-1 font-mono text-gray-900 dark:text-gray-100">
                {selectedTemplate.suggestedOperator} {selectedTemplate.suggestedValue}
              </p>
            </div>
            <div className="rounded-lg border border-white/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-gray-500">Recommended interval</p>
              <p className="mt-1 text-gray-900 dark:text-gray-100">
                Every {selectedTemplate.suggestedCheckIntervalMinutes} min
              </p>
            </div>
            <div className="rounded-lg border border-white/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-gray-500">Time range</p>
              <p className="mt-1 text-gray-900 dark:text-gray-100">
                {selectedTemplate.timeRangeMinutes
                  ? `${selectedTemplate.timeRangeMinutes} min window`
                  : "Realtime / current state"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
            The rule description above is reused in notification templates as{" "}
            <code className="rounded bg-white px-1 dark:bg-slate-900">{"{{description}}"}</code>.
          </p>
        </div>
      )}
      <FormField
        control={form.control}
        name="sqlQuery"
        render={({ field, fieldState }) => (
          <FormItem className="min-w-0 space-y-2">
            <div
              className={`min-w-0 overflow-hidden rounded-lg ${
                fieldState.error ? "ring-1 ring-red-500" : ""
              }`}
            >
              <FormControl>
                <SQLEditor
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    replaceDerivedFormData(applyAlertSqlQueryChange(form.getValues(), value), {
                      clearFieldErrors: ["sqlQuery"],
                    });
                  }}
                  height="280px"
                />
              </FormControl>
            </div>
            <FormMessage className="text-xs" />
          </FormItem>
        )}
      />
      <div className="text-xs text-gray-500">
        SELECT queries only. Write a query returning a single numeric value.
      </div>
      {currentFormData.testResult && (
        <div
          className={`rounded-lg border p-4 ${
            currentFormData.testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-start gap-3">
            {currentFormData.testResult.success ? (
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}
            <div className="flex-1">
              <p
                className={`mb-2 text-sm ${
                  currentFormData.testResult.success ? "text-green-900" : "text-red-900"
                }`}
              >
                {currentFormData.testResult.success ? "Query Test Successful" : "Query Test Failed"}
              </p>
              {currentFormData.testResult.success ? (
                <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <span className="text-gray-600">Rows Returned:</span>
                    <span className="ml-2 text-gray-900">{currentFormData.testResult.rowCount}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Threshold Met:</span>
                    <span
                      className={`ml-2 ${
                        currentFormData.testResult.thresholdMet ? "text-orange-600" : "text-green-600"
                      }`}
                    >
                      {currentFormData.testResult.thresholdMet ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Execution Time:</span>
                    <span className="ml-2 text-gray-900">
                      {currentFormData.testResult.executionTimeMs}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Matched Severity:</span>
                    <span className="ml-2 text-gray-900">
                      {currentFormData.testResult.matchedSeverity || "None"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-700">{currentFormData.testResult.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
