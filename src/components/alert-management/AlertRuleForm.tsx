"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";

import type {
  AlertFormFieldErrorKey,
  AlertFormFieldErrors,
  AlertRuleFormData,
  AlertRuleFormSyncOptions,
  AlertThresholdErrors,
  ClusterOption,
} from "./types";
import { BasicInfoSection } from "./BasicInfoSection";
import { SqlQuerySection } from "./SqlQuerySection";
import { ThresholdConfigSection } from "./ThresholdConfigSection";
import { NotificationChannelsSection } from "./NotificationChannelsSection";

const RHF_FIELD_ERROR_KEYS: AlertFormFieldErrorKey[] = [
  "name",
  "cluster",
  "description",
  "sqlQuery",
  "checkInterval",
  "compareColumn",
];

export type AlertRuleFormProps = {
  formId: string;
  prefix: string;
  switchId: string;
  formData: AlertRuleFormData;
  clusters: ClusterOption[];
  fieldErrors: AlertFormFieldErrors;
  thresholdErrors: AlertThresholdErrors;
  channelErrors: Record<string, string>;
  testingChannelId: string | null;
  openVariablePanels: Record<string, boolean>;
  onToggleVariablePanel: (channelId: string, open: boolean) => void;
  syncFormData: (formData: AlertRuleFormData, options?: AlertRuleFormSyncOptions) => void;
  handleTestQuery: (formData: AlertRuleFormData) => Promise<AlertRuleFormData | null>;
  handleTestNotification: (formData: AlertRuleFormData, channelId: string) => void;
  onSubmit: (formData: AlertRuleFormData) => void;
};

export function AlertRuleForm({
  formId,
  prefix,
  switchId,
  formData,
  clusters,
  fieldErrors,
  thresholdErrors,
  channelErrors,
  testingChannelId,
  openVariablePanels,
  onToggleVariablePanel,
  syncFormData,
  handleTestQuery,
  handleTestNotification,
  onSubmit,
}: AlertRuleFormProps) {
  const form = useForm<AlertRuleFormData>({
    values: formData,
  });
  const watchedFormData = useWatch({ control: form.control });
  const currentFormData = {
    ...formData,
    ...watchedFormData,
  } as AlertRuleFormData;
  useEffect(() => {
    RHF_FIELD_ERROR_KEYS.forEach((fieldName) => {
      const message = fieldErrors[fieldName];
      if (message) {
        form.setError(fieldName, {
          type: "manual",
          message,
        });
        return;
      }

      form.clearErrors(fieldName);
    });
  }, [fieldErrors, form]);

  return (
    <Form {...form}>
      <form
        id={formId}
        className="space-y-6 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form.getValues());
        }}
      >
        <BasicInfoSection prefix={prefix} clusters={clusters} syncFormData={syncFormData} />

        <div className="border-t border-gray-200" />

        <SqlQuerySection
          currentFormData={currentFormData}
          handleTestQuery={handleTestQuery}
          syncFormData={syncFormData}
        />

        <div className="border-t border-gray-200" />

        <ThresholdConfigSection
          currentFormData={currentFormData}
          thresholdErrors={thresholdErrors}
          syncFormData={syncFormData}
        />

        <div className="border-t border-gray-200" />

        <NotificationChannelsSection
          currentFormData={currentFormData}
          channelErrors={channelErrors}
          testingChannelId={testingChannelId}
          openVariablePanels={openVariablePanels}
          onToggleVariablePanel={onToggleVariablePanel}
          handleTestNotification={handleTestNotification}
          syncFormData={syncFormData}
        />

        <div className="border-t border-gray-200" />

        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Rule Settings</p>
          <FormField
            control={form.control}
            name="ruleEnabled"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <Label className="text-sm">Status</Label>
                <div className="flex h-10 items-center gap-3">
                  <FormControl>
                    <Switch
                      id={switchId}
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        syncFormData({ ...form.getValues(), ruleEnabled: checked });
                      }}
                    />
                  </FormControl>
                  <Label htmlFor={switchId} className="cursor-pointer text-sm font-normal text-gray-600">
                    {field.value ? "Enabled" : "Disabled"}
                  </Label>
                </div>
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}
