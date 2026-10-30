"use client";

import { useCallback, useMemo, useState } from "react";

import { emptyForm } from "../utils";

import type {
  AlertDialogValidationState,
  AlertFormFieldErrorKey,
  AlertFormFieldErrors,
  AlertRuleFormData,
  AlertRuleFormSyncOptions,
  AlertThresholdErrors,
} from "../types";

export function useAlertRuleDialogState() {
  const [formData, setFormData] = useState<AlertRuleFormData>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<AlertFormFieldErrors>({});
  const [thresholdErrors, setThresholdErrors] = useState<AlertThresholdErrors>({});
  const [channelErrors, setChannelErrors] = useState<Record<string, string>>({});
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [openVariablePanels, setOpenVariablePanels] = useState<Record<string, boolean>>({});

  const resetUiState = useCallback(() => {
    setFieldErrors({});
    setThresholdErrors({});
    setChannelErrors({});
    setTestingChannelId(null);
  }, []);

  const resetState = useCallback(() => {
    setFormData(emptyForm());
    setOpenVariablePanels({});
    resetUiState();
  }, [resetUiState]);

  const syncFormData = useCallback(
    (nextFormData: AlertRuleFormData, options?: AlertRuleFormSyncOptions) => {
      setFormData(nextFormData);

      if (options?.clearFieldErrors?.length) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          for (const fieldKey of options.clearFieldErrors ?? []) {
            delete next[fieldKey];
          }
          return next;
        });
      }

      if (options?.clearThresholdErrors) {
        setThresholdErrors({});
      }

      if (options?.clearChannelErrors) {
        setChannelErrors({});
      }
    },
    []
  );

  const replaceValidationState = useCallback((validationState: AlertDialogValidationState) => {
    setFieldErrors(validationState.fieldErrors);
    setThresholdErrors(validationState.thresholdErrors);
    setChannelErrors(validationState.channelErrors);
  }, []);

  const mergeValidationState = useCallback((validationState: AlertDialogValidationState) => {
    setFieldErrors((prev) => ({ ...prev, ...validationState.fieldErrors }));
    setThresholdErrors(validationState.thresholdErrors);
    setChannelErrors((prev) => ({ ...prev, ...validationState.channelErrors }));
  }, []);

  const clearFieldErrors = useCallback((fieldKeys: AlertFormFieldErrorKey[]) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const fieldKey of fieldKeys) {
        delete next[fieldKey];
      }
      return next;
    });
  }, []);

  const clearThresholdErrors = useCallback(() => {
    setThresholdErrors({});
  }, []);

  const clearChannelError = useCallback((channelId: string) => {
    setChannelErrors((prev) => {
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  }, []);

  const setHydratedFormData = useCallback((nextFormData: AlertRuleFormData) => {
    setFormData(nextFormData);
    setOpenVariablePanels({});
  }, []);

  const toggleVariablePanel = useCallback((channelId: string, open: boolean) => {
    setOpenVariablePanels((prev) => ({ ...prev, [channelId]: open }));
  }, []);

  return useMemo(
    () => ({
      formData,
      fieldErrors,
      thresholdErrors,
      channelErrors,
      testingChannelId,
      openVariablePanels,
      syncFormData,
      resetUiState,
      resetState,
      replaceValidationState,
      mergeValidationState,
      clearFieldErrors,
      clearThresholdErrors,
      clearChannelError,
      setHydratedFormData,
      toggleVariablePanel,
      setTestingChannelId,
    }),
    [
      channelErrors,
      clearChannelError,
      clearFieldErrors,
      clearThresholdErrors,
      fieldErrors,
      formData,
      mergeValidationState,
      openVariablePanels,
      replaceValidationState,
      resetState,
      resetUiState,
      setHydratedFormData,
      syncFormData,
      testingChannelId,
      thresholdErrors,
      toggleVariablePanel,
    ]
  );
}

export type AlertRuleDialogState = ReturnType<typeof useAlertRuleDialogState>;
