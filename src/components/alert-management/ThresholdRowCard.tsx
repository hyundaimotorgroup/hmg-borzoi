"use client";

import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormControl, FormField } from "@/components/ui/form";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { AlertRuleFormData, ThresholdRow } from "./types";

export type ThresholdRowCardProps = {
  threshold: ThresholdRow & { fieldKey: string };
  index: number;
  thresholdError: string | undefined;
  canRemove: boolean;
  onUpdateThreshold: (updater: (t: ThresholdRow) => ThresholdRow) => void;
  onRemove: () => void;
};

export function ThresholdRowCard({
  threshold,
  index,
  thresholdError,
  canRemove,
  onUpdateThreshold,
  onRemove,
}: ThresholdRowCardProps) {
  const { control } = useFormContext<AlertRuleFormData>();

  return (
    <div
      key={threshold.fieldKey}
      className="relative grid min-w-0 gap-2 rounded-lg border border-gray-200 bg-white p-3 pr-12 shadow-sm dark:border-slate-700 dark:bg-slate-950 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(120px,0.8fr)] md:items-center md:p-2.5 md:pr-12"
    >
      <div className="min-w-0 space-y-1 md:space-y-0">
        <Label className="text-xs text-gray-500 md:sr-only">Severity</Label>
        <FormField
          control={control}
          name={`thresholds.${index}.severity`}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value: "critical" | "warning" | "info") => {
                onUpdateThreshold((t) => ({ ...t, severity: value }));
              }}
            >
              <FormControl>
                <SelectTrigger className="h-9 md:h-8">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="min-w-0 space-y-1 md:space-y-0">
        <Label className="text-xs text-gray-500 md:sr-only">Operator</Label>
        <FormField
          control={control}
          name={`thresholds.${index}.operator`}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                onUpdateThreshold((t) => ({ ...t, operator: value }));
              }}
            >
              <FormControl>
                <SelectTrigger className="h-9 md:h-8">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value=">">&gt; greater than</SelectItem>
                <SelectItem value=">=">&gt;= at least</SelectItem>
                <SelectItem value="<">&lt; less than</SelectItem>
                <SelectItem value="<=">&lt;= at most</SelectItem>
                <SelectItem value="=">= equals</SelectItem>
                <SelectItem value="!=">!= not equals</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="min-w-0 space-y-1 md:space-y-0">
        <Label className="text-xs text-gray-500 md:sr-only">Value</Label>
        <FormField
          control={control}
          name={`thresholds.${index}.value`}
          render={({ field }) => (
            <FormControl>
              <Input
                {...field}
                type="number"
                value={field.value ?? ""}
                onChange={(event) => {
                  onUpdateThreshold((t) => ({ ...t, value: event.target.value }));
                }}
                className={`h-9 md:h-8 ${thresholdError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              />
            </FormControl>
          )}
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8"
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove threshold ${index + 1}`}
      >
        <X className="h-4 w-4" />
      </Button>
      {thresholdError && (
        <p className="text-xs text-red-500 md:col-span-3">{thresholdError}</p>
      )}
    </div>
  );
}
