import { logger } from "@/lib/utils/logger";
import { format } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Network, Server } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createCHUserSchema, updateCHUserSchema } from "@/lib/validation";
import type { ChUser, Role, Profile, ProfileSetting, ClusterOption } from "../types";

interface CHUsersTabProps {
  chUsers: ChUser[];
  roles: Role[];
  profiles: Profile[];
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;
  selectedCluster: string;
  clusterOptions: ClusterOption[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => Promise<void>;
}

interface UserForm {
  username: string;
  cluster: string;
  authType: string;
  password: string;
  passwordConfirm: string;
  roles: string[];
  profiles: string[];
}

interface ApiProfileResponse {
  id?: string;
  name: string;
  settings?: Record<string, string | number> | ProfileSetting[];
  description?: string;
  clusterId?: string;
}

function parseProfileSettings(settings: ApiProfileResponse["settings"]): ProfileSetting[] {
  const parsedSettings: ProfileSetting[] = [];
  if (Array.isArray(settings)) {
    settings.forEach((s) => {
      if (!s.name) {
        return;
      }
      parsedSettings.push({
        name: s.name,
        ...(s.value !== undefined && s.value !== null ? { value: s.value } : {}),
        ...(s.min !== undefined && s.min !== null ? { min: s.min } : {}),
        ...(s.max !== undefined && s.max !== null ? { max: s.max } : {}),
        ...(s.mode !== undefined && s.mode !== null ? { mode: s.mode } : {}),
      });
    });
  } else if (typeof settings === 'object' && settings !== null) {
    Object.entries(settings).forEach(([name, value]) => {
      parsedSettings.push({ name, value });
    });
  }
  return parsedSettings;
}

function getClusterSelectTriggerClass(option?: ClusterOption | null): string {
  if (option?.isLogical) {
    return "border-purple-200 bg-purple-50/60 text-purple-900 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-100";
  }
  if (option) {
    return "border-blue-200 bg-blue-50/60 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100";
  }
  return "";
}

function summarizeClickHouseError(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();
  const normalized = singleLine.replace(/^Unrecognized token:\s*/i, "").trim();

  const syntaxMatch = normalized.match(
    /Syntax error: failed at position \d+ \(([^)]+)\):\s*([^.]*)\.\s*Expected one of:/i
  );
  if (syntaxMatch) {
    const token = syntaxMatch[1]?.trim();
    const snippet = syntaxMatch[2]?.trim();

    if (snippet) {
      return `Syntax error near \`${snippet}\``;
    }
    if (token) {
      return `Syntax error near \`${token}\``;
    }
    return "Syntax error in SQL query";
  }

  const dbExceptionMatch = normalized.match(/DB::Exception:\s*(.*?)(?:\s*\(version|\s*Stack trace:|$)/i);
  if (dbExceptionMatch?.[1]) {
    return dbExceptionMatch[1].trim();
  }

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177)}...`;
}

export function CHUsersTab({
  chUsers,
  roles,
  profiles,
  setProfiles,
  selectedCluster,
  clusterOptions,
  searchQuery,
  onSearchChange,
  onRefresh,
}: CHUsersTabProps) {
  // Dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ChUser | null>(null);

  // Form/SQL tab state
  const [addTab, setAddTab] = useState<"form" | "sql">("form");
  const [editTab, setEditTab] = useState<"form" | "sql">("form");
  const [addSubmitError, setAddSubmitError] = useState("");
  const [editSubmitError, setEditSubmitError] = useState("");
  const [addSubmitSuccess, setAddSubmitSuccess] = useState("");
  const [editSubmitSuccess, setEditSubmitSuccess] = useState("");
  const [clearEditSqlOnClick, setClearEditSqlOnClick] = useState(false);

  // SQL state
  const [sqlQuery, setSqlQuery] = useState("");

  // Form state
  const [form, setForm] = useState<UserForm>({
    username: "",
    cluster: "",
    authType: "password",
    password: "",
    passwordConfirm: "",
    roles: [],
    profiles: [],
  });

  // Helper: get role name by id
  const getRoleName = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (role) return role.name;
    const parts = roleId.split('-');
    return parts[parts.length - 1];
  };

  // Helper: get profile by id
  const getProfile = (profileId: string) => profiles.find((p) => p.id === profileId);

  const filteredUsers = chUsers.filter((u) => {
    if (selectedCluster === "" || selectedCluster === "all") {
      return searchQuery === "" || u.username.toLowerCase().includes(searchQuery.toLowerCase());
    }
    const opt = clusterOptions.find((o) => o.id === selectedCluster);
    return (
      (searchQuery === "" || u.username.toLowerCase().includes(searchQuery.toLowerCase())) &&
      u.cluster === opt?.name
    );
  });

  // Reset to page 1 on search/cluster change — handled internally by DataTable
  useEffect(() => { /* DataTable resets internally on data change */ }, [searchQuery, selectedCluster]);

  const toggleRole = (roleId: string) => {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(roleId)
        ? prev.roles.filter((r) => r !== roleId)
        : [...prev.roles, roleId],
    }));
  };

  const resetForm = () => {
    setForm({
      username: "",
      cluster: "",
      authType: "password",
      password: "",
      passwordConfirm: "",
      roles: [],
      profiles: [],
    });
    setSqlQuery("");
    setAddSubmitError("");
    setEditSubmitError("");
    setAddSubmitSuccess("");
    setEditSubmitSuccess("");
    setClearEditSqlOnClick(false);
  };

  const getApiErrorMessage = async (response: Response, fallback: string) => {
    const errorData = await response.json().catch(() => ({ error: fallback }));
    const baseMessage = errorData.details || errorData.error || fallback;
    if (typeof errorData.failedStatement === "string" && errorData.failedStatement.trim()) {
      return `${baseMessage} (failed statement: ${errorData.failedStatement})`;
    }
    return baseMessage;
  };

  const showAddError = (message: string) => {
    const displayMessage = summarizeClickHouseError(message);
    logger.error('Failed to add user:', displayMessage);
    setAddSubmitError(displayMessage);
    setAddSubmitSuccess("");
    toast.error(displayMessage);
  };

  const showEditError = (message: string) => {
    const displayMessage = summarizeClickHouseError(message);
    logger.error('Failed to update user:', displayMessage);
    setEditSubmitError(displayMessage);
    setEditSubmitSuccess("");
    toast.error(displayMessage);
  };

  const loadProfilesForCluster = async (clusterId: string) => {
    try {
      const physicalClusterId = getPhysicalClusterId(clusterId);
      const res = await fetch(`/api/clusters/${physicalClusterId}/ch-profiles`);
      if (res.ok) {
        const data: ApiProfileResponse[] = await res.json();
        const converted: Profile[] = data.map((p) => ({
          id: p.id || p.name,
          name: p.name,
          cluster: '',
          clusterId: physicalClusterId,
          description: p.description || '',
          settings: parseProfileSettings(p.settings),
          createdAt: format(new Date(), 'yyyy-MM-dd'),
        }));
        setProfiles((prev) => [
          ...prev.filter((p) => p.clusterId !== clusterId),
          ...converted,
        ]);
      }
    } catch (error) {
      logger.error('Failed to load profiles:', error);
    }
  };

  const toApiAuthType = (authType: UserForm["authType"]) => {
    if (authType === "password" || authType === "token") {
      return "sha256_password" as const;
    }
    if (authType === "ldap") {
      return "ldap" as const;
    }
    return "no_password" as const;
  };

  const buildUserPayload = ({
    mode,
    logicalClusterName,
    variant,
  }: {
    mode: "form" | "sql";
    logicalClusterName: string | null;
    variant: "create" | "update";
  }) => {
    const roleNames = form.roles.map((roleId) => getRoleName(roleId));
    const profileNames = form.profiles
      .map((profileId) => getProfile(profileId)?.name)
      .filter((name): name is string => !!name);

    if (mode === "sql") {
      return {
        username: variant === "update" ? form.username : undefined,
        sqlQuery,
        logicalCluster: logicalClusterName || undefined,
      };
    }

    return {
      username: form.username,
      password: form.password || undefined,
      authType: toApiAuthType(form.authType),
      roles: roleNames,
      profiles: profileNames,
      logicalCluster: logicalClusterName || undefined,
    };
  };

  const validateUserPayload = (
    payload: ReturnType<typeof buildUserPayload>,
    variant: "create" | "update"
  ) => {
    const schema = variant === "create" ? createCHUserSchema : updateCHUserSchema;
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      if (variant === "create") {
        setAddSubmitError("");
      } else {
        setEditSubmitError("");
      }
      return parsed.data;
    }

 const message = parsed.error.issues[0]?.message ?? " .";
    if (variant === "create") {
      showAddError(message);
    } else {
      showEditError(message);
    }
    return null;
  };

  const handleAdd = async () => {
    setAddSubmitError("");
    setAddSubmitSuccess("");
    try {
      const selectedOption = clusterOptions.find((opt) => opt.id === form.cluster);
      const physicalClusterId = selectedOption?.isLogical
        ? selectedOption.physicalClusterId!
        : form.cluster.replace(/^physical:/, '');
      const logicalClusterName = selectedOption?.actualClusterName || null;
      const payload = buildUserPayload({
        mode: addTab,
        logicalClusterName,
        variant: "create",
      });
      const validated = validateUserPayload(payload, "create");
      if (!validated) {
        return;
      }

      if (addTab === "sql") {
        const response = await fetch(`/api/clusters/${physicalClusterId}/ch-users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validated),
        });

        if (!response.ok) {
          showAddError(await getApiErrorMessage(response, 'Failed to execute user SQL'));
          return;
        }

        const data = await response.json().catch(() => null) as { message?: string; executedCount?: number } | null;
        const successMessage = data?.executedCount
          ? `Executed ${data.executedCount} SQL statement(s) successfully`
          : (data?.message || "User SQL executed successfully");
        setAddSubmitSuccess(successMessage);
        setAddSubmitError("");
        toast.success(successMessage);
        await onRefresh();
        return;
      }

      if (form.authType === 'password') {
        if (form.password !== form.passwordConfirm) {
          showAddError('Passwords do not match');
          return;
        }
      }

      const response = await fetch(`/api/clusters/${physicalClusterId}/ch-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      });

      if (!response.ok) {
        showAddError(await getApiErrorMessage(response, 'Failed to create user'));
        return;
      }

      await onRefresh();
      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to create user. Please try again.';
      showAddError(rawMessage);
    }
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setEditSubmitError("");
    setEditSubmitSuccess("");
    try {
      const selectedOption = clusterOptions.find((opt) => opt.id === form.cluster);
      const physicalClusterId = selectedOption?.isLogical
        ? selectedOption.physicalClusterId!
        : form.cluster.replace(/^physical:/, '');
      const logicalClusterName = selectedOption?.actualClusterName || null;
      const payload = buildUserPayload({
        mode: editTab,
        logicalClusterName,
        variant: "update",
      });
      const validated = validateUserPayload(payload, "update");
      if (!validated) {
        return;
      }

      if (editTab === "sql") {
        const response = await fetch(`/api/clusters/${physicalClusterId}/ch-users`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validated),
        });

        if (!response.ok) {
          showEditError(await getApiErrorMessage(response, 'Failed to execute user SQL'));
          return;
        }

        const data = await response.json().catch(() => null) as { message?: string; executedCount?: number } | null;
        const successMessage = data?.executedCount
          ? `Executed ${data.executedCount} SQL statement(s) successfully`
          : (data?.message || "User SQL executed successfully");
        setEditSubmitSuccess(successMessage);
        setEditSubmitError("");
        toast.success(successMessage);
        await onRefresh();
        return;
      }

      if (form.password && form.password !== form.passwordConfirm) {
        showEditError('Passwords do not match');
        return;
      }

      const response = await fetch(`/api/clusters/${physicalClusterId}/ch-users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      });

      if (!response.ok) {
        showEditError(await getApiErrorMessage(response, 'Failed to update user'));
        return;
      }

      await onRefresh();
      setIsEditOpen(false);
      setSelectedUser(null);
      resetForm();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to update user. Please try again.';
      showEditError(rawMessage);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    try {
      const physicalClusterId = selectedUser.clusterId || selectedUser.cluster.replace(/^physical:/, '');
      const opt = clusterOptions.find(
        (o) => o.name === selectedUser.cluster || o.id.endsWith(`:${selectedUser.cluster}`)
      );
      const logicalClusterName = opt?.actualClusterName || null;

      const qp = new URLSearchParams({ username: selectedUser.username });
      if (logicalClusterName) qp.set('logicalCluster', logicalClusterName);

      const response = await fetch(`/api/clusters/${physicalClusterId}/ch-users?${qp.toString()}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to delete user');
      }

      await onRefresh();
      setIsDeleteOpen(false);
      setSelectedUser(null);
    } catch (error) {
      logger.error('Failed to delete user:', error);
      toast.error('Failed to delete user. Please try again.');
    }
  };

  const openEdit = async (user: ChUser) => {
    setSelectedUser(user);
    setEditTab("form");
    setClearEditSqlOnClick(true);

    const rawAuthType = Array.isArray(user.authType)
      ? user.authType[0] || "password"
      : (typeof user.authType === 'string' ? user.authType : "password");

    let authType = 'password';
    if (rawAuthType === 'no_password') authType = 'no_password';
    else if (rawAuthType === 'ldap') authType = 'ldap';
    else if (rawAuthType.includes('password')) authType = 'password';

    const roleIds = (user.roles || [])
      .map((roleName) => roles.find((r) => r.name === roleName)?.id)
      .filter((id): id is string => !!id);

    const profileIds = (user.profiles || [])
      .map((profileName) => profiles.find((p) => p.name === profileName)?.id)
      .filter((id): id is string => !!id);

 // When in "all" state, get the correct ClusterOption ID via selectedClusterId or clusterId
    const clusterOptionId = user.selectedClusterId ||
      clusterOptions.find((o) => o.id === `physical:${user.clusterId}`)?.id ||
      user.clusterId ||
      user.cluster;

    setForm({
      username: user.username,
      cluster: clusterOptionId,
      authType,
      password: "",
      passwordConfirm: "",
      roles: roleIds,
      profiles: profileIds,
    });

    try {
      const clusterId = user.clusterId || user.cluster;
      const res = await fetch(`/api/clusters/${clusterId}/ddl?type=user&name=${encodeURIComponent(user.username)}`);
      if (res.ok) {
        const data = await res.json();
        setSqlQuery(data.combined || data.ddl || `-- DDL not available\nALTER USER ${user.username};`);
      } else {
        const userProfiles = user.profiles.map((pid) => getProfile(pid)).filter((p): p is Profile => !!p);
        const userRoles = user.roles.map((rid) => getRoleName(rid));
        let ddl = `-- Current User DDL\nALTER USER ${user.username}\n`;
        if (userProfiles.length > 0) {
          ddl += `SETTINGS PROFILE ${userProfiles.map((p) => `'${p.name}'`).join(', ')}\n`;
        }
        if (userRoles.length > 0) {
          ddl += `-- Assigned Roles:\n`;
          userRoles.forEach((rn) => { ddl += `-- GRANT ${rn} TO ${user.username};\n`; });
        }
        setSqlQuery(ddl);
      }
    } catch (error) {
      logger.error('Failed to fetch DDL:', error);
      setSqlQuery(`-- Error fetching DDL\nALTER USER ${user.username};`);
    }

    setIsEditOpen(true);
  };

  const openDelete = (user: ChUser) => {
    setSelectedUser(user);
    setIsDeleteOpen(true);
  };

  // Compute cluster dropdown for dialogs
  const getPhysicalClusterId = (clusterId: string) => {
    const opt = clusterOptions.find((o) => o.id === clusterId);
    return opt?.isLogical ? opt.physicalClusterId! : clusterId.replace(/^physical:/, '');
  };

  const columns = useMemo<ColumnDef<ChUser>[]>(() => [
    {
      accessorKey: "username",
      header: "Username",
      size: 140,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
          {row.original.username}
        </span>
      ),
    },
    {
      accessorKey: "cluster",
      header: "Cluster",
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
          {row.original.cluster}
        </span>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      size: 120,
      meta: { truncate: false as const },
      cell: ({ row }) => {
        const userRoles = row.original.roles || [];
        return (
          <div className="flex flex-wrap gap-1">
            {userRoles.map((roleName) => (
              <Badge key={roleName} variant="secondary" className="text-xs">{roleName}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "profiles",
      header: "Profile",
      size: 100,
      meta: { truncate: false as const },
      cell: ({ row }) => {
        const userProfiles = row.original.profiles || [];
        return (
          <div className="flex flex-wrap gap-1">
            {userProfiles.map((profileName) => (
              <Badge key={profileName} variant="secondary" className="text-xs">{profileName}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 80,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <Badge className={row.original.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 80,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(row.original)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => openDelete(row.original)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [roles, profiles, clusterOptions]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="dark:text-white">ClickHouse Users</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">User = Role (permissions) + Profile (resources)</p>
            </div>
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={() => {
                setAddTab("form");
                setForm({
                  username: "",
                  cluster: selectedCluster === "all" ? "" : selectedCluster,
                  authType: "password",
                  password: "",
                  passwordConfirm: "",
                  roles: [],
                  profiles: [],
                });
                setSqlQuery("");
                setIsAddOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={filteredUsers} />
        </CardContent>
      </Card>

      {/* Add user dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => {
        setIsAddOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add ClickHouse User</DialogTitle>
            <DialogDescription>User = Role (permissions) + Profile (resources)</DialogDescription>
          </DialogHeader>
          <Tabs value={addTab} onValueChange={(v) => {
            setAddTab(v as "form" | "sql");
            setAddSubmitError("");
            setAddSubmitSuccess("");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="sql">SQL Query</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ch-cluster">Cluster *</Label>
	                  {selectedCluster === "all" ? (
	                    <Select
	                      value={form.cluster || undefined}
	                      onValueChange={async (value) => {
	                        setForm({ ...form, cluster: value });
	                        await loadProfilesForCluster(value);
	                      }}
	                    >
                        <SelectTrigger className={getClusterSelectTriggerClass(clusterOptions.find((o) => o.id === form.cluster))}>
                          {form.cluster ? (
                            <div className="flex items-center gap-2 truncate">
                              {clusterOptions.find((o) => o.id === form.cluster)?.isLogical ? <Network className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" /> : <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                              <span className="truncate">{clusterOptions.find((o) => o.id === form.cluster)?.displayName || form.cluster}</span>
                            </div>
                          ) : (
                            <SelectValue placeholder="Select cluster" />
                          )}
                        </SelectTrigger>
	                      <SelectContent>
                        {clusterOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <div className="flex items-center gap-2">
                              {option.isLogical ? <Network className="w-3.5 h-3.5 text-purple-600" /> : <Server className="w-3.5 h-3.5 text-blue-600" />}
                              <span>{option.displayName}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
	                  ) : (
	                    <div className={`flex items-center gap-2 px-3 py-2 border rounded-md ${getClusterSelectTriggerClass(clusterOptions.find((o) => o.id === form.cluster)) || "bg-gray-50 border-gray-200"}`}>
	                      {(() => {
	                        const opt = clusterOptions.find((o) => o.id === form.cluster);
                        return (
                          <>
                            {opt?.isLogical ? <Network className="w-4 h-4 text-purple-600" /> : <Server className="w-4 h-4 text-blue-600" />}
                            <span className="text-sm">{opt?.displayName || form.cluster}</span>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ch-username">Username *</Label>
                  <Input id="ch-username" placeholder="Enter username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ch-authtype">Authentication Type *</Label>
                  <Select value={form.authType} onValueChange={(value) => setForm({ ...form, authType: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="password">Password (SHA256)</SelectItem>
                      <SelectItem value="no_password">No Password</SelectItem>
                      <SelectItem value="ldap">LDAP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.authType === "password" && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="ch-password">Password *</Label>
                      <Input id="ch-password" type="password" placeholder="Enter password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ch-password-confirm">Confirm Password *</Label>
                      <Input id="ch-password-confirm" type="password" placeholder="Re-enter password" value={form.passwordConfirm} onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })} autoComplete="new-password" />
                      {form.password && form.passwordConfirm && form.password !== form.passwordConfirm && (
                        <p className="text-xs text-red-500">Passwords do not match</p>
                      )}
                    </div>
                  </>
                )}
                <div className="grid gap-2">
                  <Label>Roles (Permissions) - Multiple selection allowed</Label>
                  <div className="grid grid-cols-1 gap-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                    {form.cluster && (() => {
                      const physId = getPhysicalClusterId(form.cluster);
                      return roles.filter((r) => r.clusterId === physId).map((role) => (
                        <div key={role.id} className="flex items-start space-x-2">
                          <Checkbox id={`user-role-${role.id}`} checked={form.roles.includes(role.id)} onCheckedChange={() => toggleRole(role.id)} />
                          <label htmlFor={`user-role-${role.id}`} className="text-sm cursor-pointer flex-1">
                            <div className="font-medium">{role.name}</div>
                            <div className="text-xs text-gray-600">{role.description}</div>
                          </label>
                        </div>
                      ));
                    })()}
                    {!form.cluster && <p className="text-xs text-gray-500 text-center py-2">Select a cluster first</p>}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Profile (Resource Constraints) - Multiple selection allowed</Label>
                  <div className="grid grid-cols-1 gap-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                    {form.cluster && (() => {
                      const physId = getPhysicalClusterId(form.cluster);
                      return profiles.filter((p) => p.clusterId === physId).map((profile) => (
                        <div key={profile.id} className="flex items-start space-x-2">
                          <Checkbox
                            id={`user-profile-${profile.id}`}
                            checked={form.profiles.includes(profile.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setForm({ ...form, profiles: [...form.profiles, profile.id] });
                              } else {
                                setForm({ ...form, profiles: form.profiles.filter((p) => p !== profile.id) });
                              }
                            }}
                          />
                          <label htmlFor={`user-profile-${profile.id}`} className="text-sm cursor-pointer flex-1">
                            <div className="font-medium">{profile.name}</div>
                            <div className="text-xs text-gray-600">{profile.description}</div>
                          </label>
                        </div>
                      ));
                    })()}
                     {!form.cluster && <p className="text-xs text-gray-500 text-center py-2">Select a cluster first</p>}
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sql" className="space-y-4 mt-4">
              <div className="grid gap-4">
	                <div className="grid gap-2">
	                  <Label htmlFor="sql-cluster">Cluster *</Label>
	                  {selectedCluster === "all" ? (
	                    <Select value={form.cluster || undefined} onValueChange={(value) => setForm({ ...form, cluster: value })}>
                        <SelectTrigger className={getClusterSelectTriggerClass(clusterOptions.find((o) => o.id === form.cluster))}>
                          {form.cluster ? (
                            <div className="flex items-center gap-2 truncate">
                              {clusterOptions.find((o) => o.id === form.cluster)?.isLogical ? <Network className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" /> : <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                              <span className="truncate">{clusterOptions.find((o) => o.id === form.cluster)?.displayName || form.cluster}</span>
                            </div>
                          ) : (
                            <SelectValue placeholder="Select cluster" />
                          )}
                        </SelectTrigger>
	                      <SelectContent>
                        {clusterOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <div className="flex items-center gap-2">
                              {option.isLogical ? <Network className="w-3.5 h-3.5 text-purple-600" /> : <Server className="w-3.5 h-3.5 text-blue-600" />}
                              <span>{option.displayName}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
	                  ) : (
	                    <div className={`flex items-center gap-2 px-3 py-2 border rounded-md ${getClusterSelectTriggerClass(clusterOptions.find((o) => o.id === form.cluster)) || "bg-gray-50 border-gray-200"}`}>
	                      {(() => {
	                        const opt = clusterOptions.find((o) => o.id === form.cluster);
                        return (
                          <>
                            {opt?.isLogical ? <Network className="w-4 h-4 text-purple-600" /> : <Server className="w-4 h-4 text-blue-600" />}
                            <span className="text-sm">{opt?.displayName || form.cluster}</span>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-sql">SQL Query</Label>
                  <Textarea
                    id="user-sql"
                    placeholder={"CREATE USER username IDENTIFIED BY 'password'\nSETTINGS PROFILE 'profile_name'\nGRANT role_name TO username;"}
                    value={sqlQuery}
                    onChange={(e) => {
                      setSqlQuery(e.target.value);
                      setAddSubmitError("");
                      setAddSubmitSuccess("");
                    }}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  {addSubmitError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {addSubmitError}
                    </div>
                  )}
                  {addSubmitSuccess && (
                    <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                      {addSubmitSuccess}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">SQL mode executes exactly the statements you enter. Existing direct grants are not revoked automatically, so privilege changes are additive unless you explicitly add `REVOKE` statements.</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={handleAdd}
              disabled={addTab === "form"
                ? (!form.username || !form.cluster || (form.authType === 'password' && (!form.password || form.password !== form.passwordConfirm)))
                : (!sqlQuery || !form.cluster)}
            >
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setSelectedUser(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit ClickHouse User</DialogTitle>
            <DialogDescription>Update user&apos;s auth, roles, and profile</DialogDescription>
          </DialogHeader>
          <Tabs value={editTab} onValueChange={(v) => {
            setEditTab(v as "form" | "sql");
            setEditSubmitError("");
            setEditSubmitSuccess("");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="sql">SQL Query (Current DDL)</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-ch-cluster">Cluster *</Label>
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-50">
                    {(() => {
                      const opt = clusterOptions.find((o) => o.id === form.cluster);
                      return (
                        <>
                          {opt?.isLogical ? <Network className="w-4 h-4 text-purple-600" /> : <Server className="w-4 h-4 text-blue-600" />}
                          <span className="text-sm">{opt?.displayName || form.cluster}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-ch-username">Username *</Label>
                  <Input id="edit-ch-username" placeholder="Enter username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-ch-authtype">Authentication Type *</Label>
                  <Select value={form.authType} onValueChange={(value) => setForm({ ...form, authType: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="password">Password (SHA256)</SelectItem>
                      <SelectItem value="no_password">No Password</SelectItem>
                      <SelectItem value="ldap">LDAP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.authType === "password" && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-ch-password">New Password (leave empty to keep current)</Label>
                      <Input id="edit-ch-password" type="password" placeholder="Enter new password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
                    </div>
                    {form.password && (
                      <div className="grid gap-2">
                        <Label htmlFor="edit-ch-password-confirm">Confirm New Password *</Label>
                        <Input id="edit-ch-password-confirm" type="password" placeholder="Re-enter new password" value={form.passwordConfirm} onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })} autoComplete="new-password" />
                        {form.password && form.passwordConfirm && form.password !== form.passwordConfirm && (
                          <p className="text-xs text-red-500">Passwords do not match</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div className="grid gap-2">
                  <Label>Roles (Permissions) - Multiple selection allowed</Label>
                  <div className="grid grid-cols-1 gap-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                    {form.cluster && (() => {
                      const physId = getPhysicalClusterId(form.cluster);
                      return roles.filter((r) => r.clusterId === physId).map((role) => (
                        <div key={role.id} className="flex items-start space-x-2">
                          <Checkbox id={`edit-user-role-${role.id}`} checked={form.roles.includes(role.id)} onCheckedChange={() => toggleRole(role.id)} />
                          <label htmlFor={`edit-user-role-${role.id}`} className="text-sm cursor-pointer flex-1">
                            <div className="font-medium">{role.name}</div>
                            <div className="text-xs text-gray-600">{role.description}</div>
                          </label>
                        </div>
                      ));
                    })()}
                    {!form.cluster && <p className="text-xs text-gray-500 text-center py-2">Select a cluster first</p>}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Profile (Resource Constraints) - Multiple selection allowed</Label>
                  <div className="grid grid-cols-1 gap-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                    {form.cluster && (() => {
                      const physId = getPhysicalClusterId(form.cluster);
                      return profiles.filter((p) => p.clusterId === physId).map((profile) => (
                        <div key={profile.id} className="flex items-start space-x-2">
                          <Checkbox
                            id={`edit-user-profile-${profile.id}`}
                            checked={form.profiles.includes(profile.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setForm({ ...form, profiles: [...form.profiles, profile.id] });
                              } else {
                                setForm({ ...form, profiles: form.profiles.filter((p) => p !== profile.id) });
                              }
                            }}
                          />
                          <label htmlFor={`edit-user-profile-${profile.id}`} className="text-sm cursor-pointer flex-1">
                            <div className="font-medium">{profile.name}</div>
                            <div className="text-xs text-gray-600">{profile.description}</div>
                          </label>
                        </div>
                      ));
                    })()}
                    {!form.cluster && <p className="text-xs text-gray-500 text-center py-2">Select a cluster first</p>}
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sql" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-sql-cluster">Cluster *</Label>
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-50">
                    {(() => {
                      const opt = clusterOptions.find((o) => o.id === form.cluster);
                      return (
                        <>
                          {opt?.isLogical ? <Network className="w-4 h-4 text-purple-600" /> : <Server className="w-4 h-4 text-blue-600" />}
                          <span className="text-sm">{opt?.displayName || form.cluster}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-user-sql">SQL Query (Current DDL)</Label>
                  <Textarea
                    id="edit-user-sql"
                    placeholder="ALTER USER username..."
                    value={sqlQuery}
                    onClick={() => {
                      if (clearEditSqlOnClick) {
                        setSqlQuery("");
                        setClearEditSqlOnClick(false);
                      }
                    }}
                    onChange={(e) => {
                      if (clearEditSqlOnClick) {
                        setClearEditSqlOnClick(false);
                      }
                      setSqlQuery(e.target.value);
                      setEditSubmitError("");
                      setEditSubmitSuccess("");
                    }}
                    rows={15}
                    className="font-mono text-sm bg-gray-50 border-gray-300 whitespace-pre"
                    style={{ lineHeight: '1.5' }}
                  />
                  {editSubmitError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {editSubmitError}
                    </div>
                  )}
                  {editSubmitSuccess && (
                    <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                      {editSubmitSuccess}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">SQL mode executes exactly the statements you enter. Existing direct grants are not revoked automatically, so privilege changes are additive unless you explicitly add `REVOKE` statements.</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={handleEdit}
              disabled={editTab === "form" ? (!form.username || !form.cluster) : (!sqlQuery || !form.cluster)}
            >
              Update User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete ClickHouse User</DialogTitle>
            <DialogDescription>Are you sure you want to delete this user? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Username:</span>
                  <span className="text-sm">{selectedUser.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Cluster:</span>
                  <span className="text-sm">{selectedUser.cluster}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Roles:</span>
                  <span className="text-sm">{selectedUser.roles.length} roles</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
