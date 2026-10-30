"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Server } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { AlertRuleFormData, AlertRuleFormSyncOptions, ClusterOption } from "./types";
import { ClusterSelectItems } from "./ClusterSelectItems";

export type BasicInfoSectionProps = {
  prefix: string;
  clusters: ClusterOption[];
  syncFormData: (formData: AlertRuleFormData, options?: AlertRuleFormSyncOptions) => void;
};

export function BasicInfoSection({ prefix, clusters, syncFormData }: BasicInfoSectionProps) {
  const form = useFormContext<AlertRuleFormData>();
  const syncScalarField = <K extends keyof AlertRuleFormData>(
    field: K,
    value: AlertRuleFormData[K],
    options?: AlertRuleFormSyncOptions
  ) => {
    syncFormData({ ...form.getValues(), [field]: value }, options);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-gray-500">Basic Information</p>
        <FormField
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-1.5">
              <Label htmlFor={`${prefix}-name`} className="text-sm">
                Rule Name <span className="text-red-500">*</span>
              </Label>
              <FormControl>
                <Input
                  {...field}
                  id={`${prefix}-name`}
                  placeholder="e.g., High CPU Usage"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    syncScalarField("name", e.target.value, { clearFieldErrors: ["name"] });
                  }}
                  className={`h-9 ${fieldState.error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </div>
      <div className="space-y-1.5">
        <FormField
          control={form.control}
          name="cluster"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-1.5">
              <Label htmlFor={`${prefix}-cluster`} className="text-sm">
                Cluster <span className="text-red-500">*</span>
              </Label>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  syncScalarField("cluster", value, { clearFieldErrors: ["cluster"] });
                }}
              >
                <FormControl>
                  <SelectTrigger
                    id={`${prefix}-cluster`}
                    className={`h-9 ${fieldState.error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      <span>All Clusters</span>
                    </div>
                  </SelectItem>
                  <ClusterSelectItems clusters={clusters} />
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </div>
      <div className="space-y-1.5">
        <FormField
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <FormItem className="space-y-1.5">
              <Label htmlFor={`${prefix}-desc`} className="text-sm">
                Description <span className="font-normal text-gray-400">(optional, used in notifications)</span>
              </Label>
              <FormControl>
                <Textarea
                  {...field}
                  id={`${prefix}-desc`}
                  placeholder="Explain what this alert monitors and why it matters. This text is reused in notification templates."
                  value={field.value ?? ""}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    syncScalarField("description", e.target.value, { clearFieldErrors: ["description"] });
                  }}
                  className={`min-h-[96px] resize-y ${fieldState.error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
              </FormControl>
              <FormMessage className="text-xs" />
              <p className="text-xs text-gray-500">
                Used for context in Slack, Teams, Webhook, and email templates via{" "}
                <code className="rounded bg-gray-100 px-1 dark:bg-slate-800">{"{{description}}"}</code>.
              </p>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
