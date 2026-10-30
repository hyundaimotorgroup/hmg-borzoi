"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

import type { AlertRuleFormData, AlertRuleFormSyncOptions } from "./types";
import { newChannel } from "./utils";
import { NotificationChannelCard } from "./NotificationChannelCard";

export type NotificationChannelsSectionProps = {
  currentFormData: AlertRuleFormData;
  channelErrors: Record<string, string>;
  testingChannelId: string | null;
  openVariablePanels: Record<string, boolean>;
  onToggleVariablePanel: (channelId: string, open: boolean) => void;
  handleTestNotification: (formData: AlertRuleFormData, channelId: string) => void;
  syncFormData: (formData: AlertRuleFormData, options?: AlertRuleFormSyncOptions) => void;
};

export function NotificationChannelsSection({
  currentFormData,
  channelErrors,
  testingChannelId,
  openVariablePanels,
  onToggleVariablePanel,
  handleTestNotification,
  syncFormData,
}: NotificationChannelsSectionProps) {
  const form = useFormContext<AlertRuleFormData>();
  const channelFieldArray = useFieldArray({
    control: form.control,
    name: "channels",
    keyName: "fieldKey",
  });

  const syncChannels = (channels: AlertRuleFormData["channels"]) => {
    channelFieldArray.replace(channels);
    syncFormData({ ...form.getValues(), channels }, { clearChannelErrors: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm uppercase tracking-wider text-gray-700">
          Notification Channels
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-sm"
          type="button"
          onClick={() => syncChannels([...form.getValues("channels"), newChannel()])}
        >
          <Plus className="h-4 w-4" />
          Add Channel
        </Button>
      </div>
      <div className="space-y-4">
        {channelFieldArray.fields.map((channel, index) => (
          <NotificationChannelCard
            key={channel.fieldKey}
            channel={channel}
            index={index}
            channelError={channelErrors[channel.id]}
            testingChannelId={testingChannelId}
            isVariablesOpen={!!openVariablePanels[channel.id]}
            canRemove={currentFormData.channels.length > 1}
            onUpdateChannel={(updater) =>
              syncChannels(form.getValues("channels").map((ch, i) => (i === index ? updater(ch) : ch)))
            }
            onRemove={() =>
              syncChannels(form.getValues("channels").filter((ch) => ch.id !== channel.id))
            }
            onTest={() => handleTestNotification(form.getValues(), channel.id)}
            onToggleVariablePanel={(open) => onToggleVariablePanel(channel.id, open)}
          />
        ))}
      </div>
    </div>
  );
}
