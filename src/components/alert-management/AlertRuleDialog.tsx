"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { AlertRuleForm } from "./AlertRuleForm";

import type { ClusterOption } from "./types";
import type { AlertRuleDialogState } from "./hooks/useAlertRuleDialogState";

type AlertRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  prefix: string;
  switchId: string;
  title: string;
  description: string;
  submitLabel: string;
  clusters: ClusterOption[];
  dialogState: AlertRuleDialogState;
  handleTestQuery: (formData: AlertRuleDialogState["formData"]) => Promise<AlertRuleDialogState["formData"] | null>;
  handleTestNotification: (formData: AlertRuleDialogState["formData"], channelId: string) => void;
  onSubmit: (formData: AlertRuleDialogState["formData"]) => void;
};

export function AlertRuleDialog({
  open,
  onOpenChange,
  formId,
  prefix,
  switchId,
  title,
  description,
  submitLabel,
  clusters,
  dialogState,
  handleTestQuery,
  handleTestNotification,
  onSubmit,
}: AlertRuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-auto overflow-x-hidden overflow-y-auto sm:max-w-none"
        style={{ width: "min(960px, calc(100vw - 2rem))", maxWidth: "min(960px, calc(100vw - 2rem))" }}
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <AlertRuleForm
          formId={formId}
          prefix={prefix}
          switchId={switchId}
          formData={dialogState.formData}
          clusters={clusters}
          fieldErrors={dialogState.fieldErrors}
          thresholdErrors={dialogState.thresholdErrors}
          channelErrors={dialogState.channelErrors}
          testingChannelId={dialogState.testingChannelId}
          openVariablePanels={dialogState.openVariablePanels}
          onToggleVariablePanel={dialogState.toggleVariablePanel}
          syncFormData={dialogState.syncFormData}
          handleTestQuery={handleTestQuery}
          handleTestNotification={handleTestNotification}
          onSubmit={onSubmit}
        />
        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form={formId} className="bg-gray-900 hover:bg-gray-800 text-white">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
