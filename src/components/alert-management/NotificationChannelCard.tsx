"use client";

import dynamic from "next/dynamic";
import { useFormContext } from "react-hook-form";
import { AVAILABLE_VARIABLES, NOTIFICATION_TEMPLATES, type ChannelType } from "@/lib/alert/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormControl, FormField, FormItem } from "@/components/ui/form";

import type { AlertRuleFormData, NotificationChannel, NotificationChannelUiType } from "./types";
import { CHANNEL_PLACEHOLDER } from "./utils";

const JSONEditor = dynamic(
  () => import("../JSONEditor").then((mod) => ({ default: mod.JSONEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
        Loading editor…
      </div>
    ),
  }
);

const CHANNEL_TYPE_TO_KEY: Record<"Slack" | "Teams" | "Webhook" | "Email", ChannelType> = {
  Slack: "slack",
  Teams: "teams",
  Webhook: "webhook",
  Email: "email",
};

const getPreviewTemplateType = (messageTemplate: string) => {
  if (messageTemplate === "minimal — text only") return "compact" as const;
  if (messageTemplate === "verbose — full query result") return "verbose" as const;
  return "basic" as const;
};

const getAvailableVariablesForChannel = (channelType: ChannelType) =>
  AVAILABLE_VARIABLES.filter((variable) => !variable.channels || variable.channels.includes(channelType));

export type NotificationChannelCardProps = {
  channel: NotificationChannel & { fieldKey: string };
  index: number;
  channelError: string | undefined;
  testingChannelId: string | null;
  isVariablesOpen: boolean;
  canRemove: boolean;
  onUpdateChannel: (updater: (ch: NotificationChannel) => NotificationChannel) => void;
  onRemove: () => void;
  onTest: () => void;
  onToggleVariablePanel: (open: boolean) => void;
};

export function NotificationChannelCard({
  channel,
  index,
  channelError,
  testingChannelId,
  isVariablesOpen,
  canRemove,
  onUpdateChannel,
  onRemove,
  onTest,
  onToggleVariablePanel,
}: NotificationChannelCardProps) {
  const { control } = useFormContext<AlertRuleFormData>();
  const channelType = CHANNEL_TYPE_TO_KEY[channel.type];
  const previewTemplateType = getPreviewTemplateType(channel.messageTemplate);
  const template = NOTIFICATION_TEMPLATES[channelType]?.[previewTemplateType]?.template;
  const availableVariables = getAvailableVariablesForChannel(channelType);
  const previewLabel =
    channelType === "teams" ? "Template preview (Adaptive Card JSON):" : "Template preview (JSON):";
  const previewHint =
    channelType === "teams"
      ? "MS Teams sends Adaptive Card payloads. Rich table-style results use {{allRowsTeamsContent}}."
      : channelType === "email"
        ? "Email templates can embed HTML table output via {{allRowsHtmlTable}}."
        : channelType === "webhook"
          ? "Webhook templates can include the raw result array via {{allRowsJson}}."
          : "Slack templates can render table-style rows with {{allRowsSlackBlocks}}.";

  return (
    <div key={channel.fieldKey} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="text-base text-gray-900">Channel {index + 1}</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onTest}
            disabled={testingChannelId !== null || channel.type === "Email"}
          >
            {channel.type === "Email"
              ? "Email not supported"
              : testingChannelId === channel.id
                ? "Testing…"
                : "Test Notification"}
          </Button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded text-gray-400 transition-colors hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              aria-label="Remove channel"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
        <FormField
          control={control}
          name={`channels.${index}.type`}
          render={({ field }) => (
            <FormItem className="min-w-0 space-y-1.5">
              <Label className="text-sm">
                Type <span className="text-red-500">*</span>
              </Label>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  onUpdateChannel((ch) => ({ ...ch, type: value as NotificationChannelUiType }));
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Slack">Slack</SelectItem>
                  <SelectItem value="Teams">MS Teams</SelectItem>
                  <SelectItem value="Webhook">Webhook</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name={`channels.${index}.url`}
        render={({ field }) => (
          <FormItem className="min-w-0 space-y-1.5">
            <Label className="text-sm">
              URL <span className="text-red-500">*</span>
            </Label>
            <FormControl>
              <Input
                {...field}
                className={`h-10 ${
                  channelError ? "border-red-500 focus-visible:ring-red-500" : ""
                }`}
                placeholder={CHANNEL_PLACEHOLDER[channel.type]}
                value={field.value ?? ""}
                onChange={(event) => {
                  onUpdateChannel((ch) => ({ ...ch, url: event.target.value }));
                }}
              />
            </FormControl>
            {channelError && (
              <p className="text-xs text-red-500">{channelError}</p>
            )}
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={`channels.${index}.messageTemplate`}
        render={({ field }) => (
          <FormItem className="space-y-1.5">
            <Label className="text-sm">Message Template</Label>
            <Select
              value={field.value}
              onValueChange={(value) => {
                onUpdateChannel((ch) => ({ ...ch, messageTemplate: value }));
              }}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="default — standard format (with table)">
                  Standard — name + value + table
                </SelectItem>
                <SelectItem value="minimal — text only">Minimal — text only</SelectItem>
                <SelectItem value="verbose — full query result">Verbose — full query result</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
      <div
        className={`grid gap-4 ${
          channelType === "teams"
            ? "xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.95fr)]"
            : "xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]"
        }`}
      >
        <div className="min-w-0 space-y-2">
          {channel.messageTemplate === "custom" ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Custom Message (JSON)</Label>
                <span className="text-xs text-gray-400">{channel.customMessage.length} chars</span>
              </div>
              <FormField
                control={control}
                name={`channels.${index}.customMessage`}
                render={({ field }) => (
                  <FormControl>
                    <JSONEditor
                      value={field.value}
                      onChange={(value) => {
                        onUpdateChannel((ch) => ({ ...ch, customMessage: value }));
                      }}
                      height="350px"
                      placeholder={`{\n  "text": "Alert: {{ruleName}}",\n  "value": "{{queryResult}}"\n}`}
                    />
                  </FormControl>
                )}
              />
              <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-gray-600">
                Use valid JSON. Variables like{" "}
                <code className="rounded bg-white px-1">{"{{ruleName}}"}</code> and{" "}
                <code className="rounded bg-white px-1">{"{{queryResult}}"}</code> will be
                replaced when sent.
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-sm text-gray-600">{previewLabel}</Label>
                <Badge variant="outline" className="w-fit">
                  {channel.type}
                </Badge>
              </div>
              <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs text-gray-600">
                {previewHint}
              </div>
              <pre
                className={`max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-gray-200 bg-gray-50 p-4 font-mono leading-relaxed text-gray-700 ${
                  channelType === "teams" ? "max-h-[420px] text-xs" : "min-h-[320px] text-sm"
                }`}
              >
                {typeof template === "string" ? template : JSON.stringify(template, null, 2)}
              </pre>
            </>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <Collapsible
            open={isVariablesOpen}
            onOpenChange={onToggleVariablePanel}
          >
            <div className="rounded-lg border border-gray-200 bg-slate-50">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <div>
                  <p className="text-sm text-gray-700">
                    Available variables for {channel.type}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {availableVariables.length} variables · click to{" "}
                    {isVariablesOpen ? "collapse" : "expand"}
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                    isVariablesOpen ? "rotate-180" : "rotate-0"
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-gray-200 px-4 py-4">
                <div className="space-y-2">
                  {availableVariables.map((variable) => (
                    <div
                      key={variable.name}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all text-xs text-gray-900">
                          {`{{${variable.name}}}`}
                        </code>
                        {variable.channels && (
                          <Badge variant="outline" className="text-[10px]">
                            {variable.channels.join(", ")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-600">{variable.description}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-gray-500">
                        e.g. {variable.example}
                      </p>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
          {channelType === "teams" && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-950">
              <p className="">MS Teams notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Adaptive Card JSON can be larger than other channel payloads.</li>
                <li>Use the compact template when you want a smaller card footprint.</li>
                <li>
                  <code className="rounded bg-white px-1">{"{{allRowsTeamsContent}}"}</code> is
                  the Teams-specific rich row variable.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
