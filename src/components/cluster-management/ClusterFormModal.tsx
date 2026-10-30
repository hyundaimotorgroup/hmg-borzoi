"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Network, CheckCircle, XCircle } from "lucide-react";
import {
  buildClusterFormSchema,
  type ClusterConnectionTestInput,
  type ClusterFormValues,
} from "@/lib/validation";
import type { ConnectionTestResult } from "./hooks/useClusterManagement";

interface ClusterFormModalProps {
  isOpen: boolean;
  isEditMode: boolean;
  initialValues: ClusterFormValues;
  isTestingConnection: boolean;
  connectionTestResult: ConnectionTestResult | null;
  onSubmit: (data: ClusterFormValues) => Promise<void>;
  onTestConnection: (data: ClusterConnectionTestInput) => Promise<void>;
  onClose: () => void;
}

export function ClusterFormModal({
  isOpen,
  isEditMode,
  initialValues,
  isTestingConnection,
  connectionTestResult,
  onSubmit,
  onTestConnection,
  onClose,
}: ClusterFormModalProps) {
  const form = useForm<ClusterFormValues>({
    resolver: zodResolver(buildClusterFormSchema(isEditMode)),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const password = useWatch({ control: form.control, name: "password" });

  const handleSubmit = async (values: ClusterFormValues) => {
    await onSubmit(values);
  };

  const handleTestConnection = async () => {
    const isValid = await form.trigger(["host", "port", "username", "password", "useTLS"]);
    if (!isValid) {
      return;
    }

    const values = form.getValues();
    await onTestConnection({
      host: values.host,
      port: Number(values.port),
      username: values.username,
      password: values.password,
      useTLS: values.useTLS,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Cluster" : "Add Cluster"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Modify cluster information."
              : "Register a new ClickHouse cluster with monitoring account credentials."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Cluster Name *</FormLabel>
                    <FormControl>
                      <Input {...field} id="name" placeholder="Production Cluster" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Environment *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger id="environment">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="dev">Development</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="prod">Production</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="host"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Host *</FormLabel>
                    <FormControl>
                      <Input {...field} id="host" placeholder="clickhouse.example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="port"
                        type="number"
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.valueAsNumber)}
                        placeholder="8123"
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500 mt-1">HTTP interface port, usually 8123</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="useTLS"
                render={({ field }) => (
                  <FormItem className="col-span-2 flex items-center gap-2 space-y-0 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
                    <FormControl>
                      <input
                        type="checkbox"
                        id="useTLS"
                        checked={field.value}
                        onChange={(event) => field.onChange(event.target.checked)}
                        className="w-4 h-4 text-green-600 rounded"
                      />
                    </FormControl>
                    <div>
                      <Label htmlFor="useTLS" className="cursor-pointer">
                        Use TLS/SSL
                      </Label>
                      <p className="text-xs text-gray-500">Enable HTTPS when connecting to the ClickHouse HTTP interface</p>
                    </div>
                  </FormItem>
                )}
              />

              <div className="col-span-2 border-t pt-4 mt-2">
                <h4 className="text-sm text-gray-900 dark:text-white mb-1">
                  Monitoring Account
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Provide a ClickHouse user with{" "}
                  <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                    role_monitoring
                  </code>{" "}
                  privileges for read-only metric collection
                </p>
              </div>

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="username"
                        placeholder="monitoring_user"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500 mt-1">User must have role_monitoring grants</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password {!isEditMode && "*"}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="password"
                        type="password"
                        placeholder={isEditMode ? "Leave blank to keep existing password" : "••••••••"}
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500 mt-1">
                      {isEditMode
                        ? "Leave blank to keep the existing password"
                        : "Password will be encrypted and stored securely"}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            <div className="border-t pt-4">
              {isEditMode && !password && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                  Enter a new password above to test the connection
                </p>
              )}
              <Button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection || !password}
                className="w-full"
                variant="outline"
              >
                {isTestingConnection ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <Network className="w-4 h-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>

              {connectionTestResult && (
                <div
                  className={`mt-3 p-3 rounded-lg ${
                    connectionTestResult.success
                      ? "bg-green-50 text-green-800"
                      : "bg-red-50 text-red-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {connectionTestResult.success ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    <span className="text-sm">{connectionTestResult.message}</span>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="bg-gray-900 hover:bg-gray-800"
              >
                {isEditMode ? "Update Cluster" : "Add Cluster"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
