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
import { ClusterAccessFormSection } from "../components/ClusterAccessFormSection";
import { availableRoles } from "../types";
import type { ClusterBasic, ChUser, UserFormState, ConnectionTestStatus } from "../types";
import { buildAppUserFormSchema } from "@/lib/validation";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusters: ClusterBasic[];
  chUsers: Record<string, ChUser[]>;
  isLoadingChUsers?: boolean;
  initialValues: UserFormState;
  connectionTestStatus: ConnectionTestStatus;
  onConnectionTestStatusChange: React.Dispatch<React.SetStateAction<ConnectionTestStatus>>;
  onSubmit: (form: UserFormState) => Promise<void>;
  onTestConnection: (clusterId: string, username: string, password: string) => Promise<void>;
}

export function EditUserDialog({
  open,
  onOpenChange,
  clusters,
  chUsers,
  isLoadingChUsers,
  initialValues,
  connectionTestStatus,
  onConnectionTestStatusChange,
  onSubmit,
  onTestConnection,
}: EditUserDialogProps) {
  const form = useForm<UserFormState>({
    resolver: zodResolver(buildAppUserFormSchema(true)),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const username = useWatch({ control: form.control, name: "username" }) ?? "";
  const email = useWatch({ control: form.control, name: "email" }) ?? "";
  const role = useWatch({ control: form.control, name: "role" }) ?? "viewer";
  const password = useWatch({ control: form.control, name: "password" }) ?? "";
  const confirmPassword = useWatch({ control: form.control, name: "confirmPassword" }) ?? "";
  const clusterAccess = useWatch({ control: form.control, name: "clusterAccess" }) ?? [];

  const userForm: UserFormState = {
    username,
    email,
    role,
    password,
    confirmPassword,
    clusterAccess,
  };

  const updateClusterAccess = (
    updater: (current: UserFormState["clusterAccess"]) => UserFormState["clusterAccess"]
  ) => {
    form.setValue("clusterAccess", updater(form.getValues("clusterAccess")), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleClusterToggle = (clusterId: string) => {
    updateClusterAccess((current) => {
      const existingIndex = current.findIndex((access) => access.clusterId === clusterId);
      const cluster = clusters.find((item) => item.id === clusterId);
      if (existingIndex >= 0) {
        return current.filter((_, index) => index !== existingIndex);
      }
      return [
        ...current,
        {
          clusterId,
          chUsername: role === "admin" ? cluster?.username : undefined,
          chPassword: "",
        },
      ];
    });
  };

  const handleRoleChange = (nextRole: UserFormState["role"]) => {
    form.setValue("role", nextRole, { shouldDirty: true, shouldValidate: true });
    if (nextRole === "admin") {
      updateClusterAccess((current) =>
        current.map((access) => ({
          ...access,
          chUsername: clusters.find((cluster) => cluster.id === access.clusterId)?.username,
          chPassword: "",
        }))
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Platform User</DialogTitle>
          <DialogDescription>Update user information</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="grid gap-4 py-4 overflow-y-auto flex-1">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel htmlFor="edit-username">Username *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="edit-username"
                        placeholder="e.g., john_doe"
                        autoComplete="username"
                        spellCheck={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel htmlFor="edit-email">Email *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="edit-email"
                        type="email"
                        placeholder="user@example.com"
                        autoComplete="email"
                        spellCheck={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel htmlFor="edit-role">Role *</FormLabel>
                    <Select value={field.value} onValueChange={(value) => handleRoleChange(value as UserFormState["role"])}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableRoles.map((availableRole) => (
                          <SelectItem key={availableRole} value={availableRole}>
                            {availableRole.charAt(0).toUpperCase() + availableRole.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel htmlFor="edit-password">New Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="edit-password"
                        type="password"
                        placeholder="Leave blank to keep current password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel htmlFor="edit-confirm-password">Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="edit-confirm-password"
                        type="password"
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    {password && confirmPassword && (
                      <p className={`text-xs ${password === confirmPassword ? "text-green-600" : "text-red-600"}`}>
                        {password === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-3">
                <Label>Cluster Access</Label>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  {role === "admin"
                    ? "Admin users automatically use the shared credentials configured on each cluster."
                    : "Grant access to specific clusters. Requests use the credentials stored in UserClusterAccess."}
                </p>
                <ClusterAccessFormSection
                  clusters={clusters}
                  userForm={userForm}
                  chUsers={chUsers}
                  isLoadingChUsers={isLoadingChUsers}
                  connectionTestStatus={connectionTestStatus}
                  lockSharedCredentials={role === "admin"}
                  onClusterToggle={handleClusterToggle}
                  onChUsernameChange={(clusterId, value) => {
                    updateClusterAccess((current) =>
                      current.map((access) =>
                        access.clusterId === clusterId
                          ? { ...access, chUsername: value, chPassword: "" }
                          : access
                      )
                    );
                  }}
                  onPasswordChange={(clusterId, nextPassword) => {
                    updateClusterAccess((current) =>
                      current.map((access) =>
                        access.clusterId === clusterId
                          ? { ...access, chPassword: nextPassword }
                          : access
                      )
                    );
                    onConnectionTestStatusChange((prev) => ({ ...prev, [clusterId]: { testing: false } }));
                  }}
                  onTestConnection={onTestConnection}
                  labelPrefix="edit-user"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="bg-gray-900 hover:bg-gray-800" type="submit" disabled={form.formState.isSubmitting}>
                Update User
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
