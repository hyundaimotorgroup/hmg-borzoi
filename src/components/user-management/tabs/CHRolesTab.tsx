import { logger } from "@/lib/utils/logger";
import { format } from "date-fns";
import { useState, useMemo } from "react";
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
import { chRoleMutationSchema } from "@/lib/validation";
import type { Role, Profile, ProfileSetting, ClusterOption } from "../types";

interface CHRolesTabProps {
  roles: Role[];
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  profiles: Profile[];
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;
  selectedCluster: string;
  clusterOptions: ClusterOption[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => Promise<void>;
}

interface RoleForm {
  name: string;
  cluster: string;
  profiles: string[];
  description: string;
}

interface ApiRoleResponse {
  id: string;
  name: string;
  description?: string;
  profiles?: string[];
}

interface ApiProfileResponse {
  id?: string;
  name: string;
  settings?: Record<string, string | number> | ProfileSetting[];
  description?: string;
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
    if (snippet) return `Syntax error near \`${snippet}\``;
    if (token) return `Syntax error near \`${token}\``;
    return "Syntax error in SQL query";
  }

  const dbExceptionMatch = normalized.match(/DB::Exception:\s*(.*?)(?:\s*\(version|\s*Stack trace:|$)/i);
  if (dbExceptionMatch?.[1]) {
    return dbExceptionMatch[1].trim();
  }

  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177)}...`;
}

export function CHRolesTab({
  roles,
  setRoles,
  profiles,
  setProfiles,
  selectedCluster,
  clusterOptions,
  searchQuery,
  onSearchChange,
  onRefresh,
}: CHRolesTabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const [addTab, setAddTab] = useState<"form" | "sql">("form");
  const [editTab, setEditTab] = useState<"form" | "sql">("form");
  const [addSubmitError, setAddSubmitError] = useState("");
  const [editSubmitError, setEditSubmitError] = useState("");
  const [clearEditSqlOnClick, setClearEditSqlOnClick] = useState(false);
  const [sqlQuery, setSqlQuery] = useState("");

  const [form, setForm] = useState<RoleForm>({
    name: "",
    cluster: "",
    profiles: [],
    description: "",
  });

  const filteredRoles = roles.filter((r) => {
    if (selectedCluster === "" || selectedCluster === "all") {
      return searchQuery === "" || r.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    const opt = clusterOptions.find((o) => o.id === selectedCluster);
    return (
      (searchQuery === "" || r.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      r.cluster === opt?.name
    );
  });

  const resetForm = () => {
    setForm({ name: "", cluster: "", profiles: [], description: "" });
    setSqlQuery("");
    setAddSubmitError("");
    setEditSubmitError("");
    setClearEditSqlOnClick(false);
  };

  const getApiErrorMessage = async (response: Response, fallback: string) => {
    const errorData = await response.json().catch(() => ({ error: fallback }));
    return errorData.details || errorData.error || fallback;
  };

  const showAddError = (message: string) => {
    const displayMessage = summarizeClickHouseError(message);
    logger.error('Failed to add role:', displayMessage);
    setAddSubmitError(displayMessage);
    toast.error(displayMessage);
  };

  const showEditError = (message: string) => {
    const displayMessage = summarizeClickHouseError(message);
    logger.error('Failed to update role:', displayMessage);
    setEditSubmitError(displayMessage);
    toast.error(displayMessage);
  };

  const getPhysicalClusterId = (clusterId: string) => {
    const opt = clusterOptions.find((o) => o.id === clusterId);
    return opt?.isLogical ? opt.physicalClusterId! : clusterId.replace(/^physical:/, '');
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

  const buildRoleMutationPayload = ({
    mode,
    logicalClusterName,
    roleName,
  }: {
    mode: "form" | "sql";
    logicalClusterName: string | null;
    roleName?: string;
  }) => ({
    roleName: mode === "form" ? roleName : undefined,
    profiles: mode === "form" ? form.profiles : undefined,
    sqlQuery: mode === "sql" ? sqlQuery : undefined,
    logicalCluster: logicalClusterName || undefined,
  });

  const validateRolePayload = (
    payload: ReturnType<typeof buildRoleMutationPayload>,
    variant: "add" | "edit"
  ) => {
    const parsed = chRoleMutationSchema.safeParse(payload);
    if (parsed.success) {
      if (variant === "add") {
        setAddSubmitError("");
      } else {
        setEditSubmitError("");
      }
      return parsed.data;
    }

 const message = parsed.error.issues[0]?.message ?? " .";
    if (variant === "add") {
      showAddError(message);
    } else {
      showEditError(message);
    }
    return null;
  };

  const refreshRoles = async (physicalClusterId: string, clusterLabel: string, logicalClusterName: string | null, selectedClusterId?: string) => {
    if (selectedCluster === "all") {
      await onRefresh();
      return;
    }
    const qp = logicalClusterName ? `?logicalCluster=${encodeURIComponent(logicalClusterName)}` : '';
    const res = await fetch(`/api/clusters/${physicalClusterId}/ch-roles${qp}`);
    if (res.ok) {
      const data: ApiRoleResponse[] = await res.json();
      setRoles(data.map((role) => ({
        id: `${clusterLabel}-${role.id}`,
        name: role.name,
        cluster: clusterLabel,
        clusterId: physicalClusterId,
        selectedClusterId: selectedClusterId,
        description: role.description || '',
        profiles: role.profiles || [],
        createdAt: format(new Date(), 'yyyy-MM-dd'),
      })));
    }
  };

  const handleAdd = async () => {
    setAddSubmitError("");
    try {
      const opt = clusterOptions.find((o) => o.id === form.cluster);
      const physicalClusterId = getPhysicalClusterId(form.cluster);
      const logicalClusterName = opt?.actualClusterName || null;
      const clusterName = opt?.name || '';
      const payload = buildRoleMutationPayload({
        mode: addTab,
        logicalClusterName,
        roleName: form.name,
      });
      const validated = validateRolePayload(payload, "add");
      if (!validated) {
        return;
      }

      const res = await fetch(`/api/clusters/${physicalClusterId}/ch-roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        showAddError(await getApiErrorMessage(res, 'Failed to create role'));
        return;
      }

      await refreshRoles(physicalClusterId, clusterName, logicalClusterName, form.cluster);
      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to create role. Please try again.';
      showAddError(rawMessage);
    }
  };

  const handleEdit = async () => {
    if (!selectedRole) return;
    setEditSubmitError("");
    try {
      const opt = clusterOptions.find((o) => o.id === form.cluster);
      const physicalClusterId = getPhysicalClusterId(form.cluster);
      const logicalClusterName = opt?.actualClusterName || null;
      const clusterName = opt?.name || '';
      const payload = buildRoleMutationPayload({
        mode: editTab,
        logicalClusterName,
        roleName: selectedRole.name,
      });
      const validated = validateRolePayload(payload, "edit");
      if (!validated) {
        return;
      }

      const res = await fetch(`/api/clusters/${physicalClusterId}/ch-roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        showEditError(await getApiErrorMessage(res, 'Failed to update role'));
        return;
      }

      await refreshRoles(physicalClusterId, clusterName, logicalClusterName, form.cluster);
      setIsEditOpen(false);
      setSelectedRole(null);
      resetForm();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to update role. Please try again.';
      showEditError(rawMessage);
    }
  };

  const handleDelete = async () => {
    if (!selectedRole) return;
    try {
      const physicalClusterId = selectedRole.clusterId!;
      const opt = clusterOptions.find((o) => o.id === selectedRole.selectedClusterId) ||
        clusterOptions.find((o) => o.name === selectedRole.cluster);
      const logicalClusterName = opt?.actualClusterName || null;

      const qp = new URLSearchParams({ roleName: selectedRole.name });
      if (logicalClusterName) qp.set('logicalCluster', logicalClusterName);

      const res = await fetch(`/api/clusters/${physicalClusterId}/ch-roles?${qp.toString()}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.details || 'Failed to delete role');
      }

      await refreshRoles(physicalClusterId, selectedRole.cluster, logicalClusterName, selectedRole.selectedClusterId || opt?.id);
      setIsDeleteOpen(false);
      setSelectedRole(null);
    } catch (error) {
      logger.error('Failed to delete role:', error);
      toast.error('Failed to delete role. Please try again.');
    }
  };

  const openEdit = async (role: Role) => {
    setSelectedRole(role);
    setClearEditSqlOnClick(true);

 // When "all" is selected, resolve the correct ClusterOption ID from selectedClusterId or clusterId
    const clusterOptionId = role.selectedClusterId ||
      clusterOptions.find((o) => o.id === `physical:${role.clusterId}`)?.id ||
      role.clusterId ||
      role.cluster;

    setForm({
      name: role.name,
      cluster: clusterOptionId,
      profiles: role.profiles || [],
      description: role.description,
    });

    try {
      const clusterId = role.clusterId || role.cluster;
      const res = await fetch(`/api/clusters/${clusterId}/ddl?type=role&name=${encodeURIComponent(role.name)}`);
      if (res.ok) {
        const data = await res.json();
        setSqlQuery(data.combined || data.ddl || `-- DDL not available\nCREATE ROLE IF NOT EXISTS ${role.name};`);
      } else {
        let ddl = `-- Current Role DDL\nCREATE ROLE IF NOT EXISTS ${role.name}`;
        if (role.profiles && role.profiles.length > 0) {
          ddl += ` PROFILE ${role.profiles.map((p) => `'${p}'`).join(', ')}`;
        }
        ddl += `;`;
        setSqlQuery(ddl);
      }
    } catch (error) {
      logger.error('Failed to fetch DDL:', error);
      setSqlQuery(`-- Error fetching DDL\nCREATE ROLE IF NOT EXISTS ${role.name};`);
    }

    setIsEditOpen(true);
  };

  const openDelete = (role: Role) => {
    setSelectedRole(role);
    setIsDeleteOpen(true);
  };

  const columns = useMemo<ColumnDef<Role>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      size: 150,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
          {row.original.name}
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
      accessorKey: "description",
      header: "Description",
      size: 200,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400 max-w-md truncate block">
          {row.original.description}
        </span>
      ),
    },
    {
      id: "profiles",
      header: "Profiles",
      size: 150,
      meta: { truncate: false as const },
      cell: ({ row }) => {
        const roleProfiles = row.original.profiles;
        return (
          <div className="flex flex-wrap gap-1">
            {roleProfiles && Array.isArray(roleProfiles) && roleProfiles.length > 0 ? (
              roleProfiles.map((profileName) => (
                <Badge key={String(profileName)} variant="outline" className="text-xs">
                  {typeof profileName === 'string' ? profileName : JSON.stringify(profileName)}
                </Badge>
              ))
            ) : (
              <span className="text-gray-400 text-xs">-</span>
            )}
          </div>
        );
      },
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
  ], [profiles, clusterOptions]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="dark:text-white">Roles Management</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Define role-based permissions (independent from Profile)</p>
            </div>
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={() => {
                setForm({ name: "", cluster: selectedCluster === "all" ? "" : selectedCluster, description: "", profiles: [] });
                setSqlQuery("");
                setAddSubmitError("");
                setIsAddOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Role
            </Button>
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search roles..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={filteredRoles} />
        </CardContent>
      </Card>

      {/* Add Role Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => {
        setIsAddOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Role (Permissions)</DialogTitle>
            <DialogDescription>Define permissions by role or function</DialogDescription>
          </DialogHeader>
          <Tabs value={addTab} onValueChange={(v) => {
            setAddTab(v as "form" | "sql");
            setAddSubmitError("");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="sql">SQL Query</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="role-cluster">Cluster *</Label>
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
                  <Label htmlFor="role-name">Role Name *</Label>
                  <Input id="role-name" placeholder="e.g., role_analyst" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role-description">Description</Label>
                  <Textarea id="role-description" placeholder="Role description or purpose..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="grid gap-2">
                  <Label>Profiles</Label>
                  <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                    {form.cluster && (() => {
                      const physId = getPhysicalClusterId(form.cluster);
                      const filteredProfiles = profiles.filter((p) => p.clusterId === physId);
                      return filteredProfiles.length > 0 ? filteredProfiles.map((profile) => (
                        <div key={profile.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`role-profile-${profile.id}`}
                            checked={form.profiles.includes(profile.name)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setForm({ ...form, profiles: [...form.profiles, profile.name] });
                              } else {
                                setForm({ ...form, profiles: form.profiles.filter((p) => p !== profile.name) });
                              }
                            }}
                          />
                          <Label htmlFor={`role-profile-${profile.id}`} className="font-normal cursor-pointer">{profile.name}</Label>
                        </div>
                      )) : <p className="text-sm text-gray-500">No profiles available for this cluster</p>;
                    })()}
                    {!form.cluster && <p className="text-sm text-gray-500">Please select a cluster first</p>}
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sql" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="role-sql-cluster">Cluster</Label>
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
                  <Label htmlFor="role-sql">SQL Query</Label>
                  <Textarea
                    id="role-sql"
                    placeholder={"CREATE ROLE role_name;\nGRANT SELECT ON database.* TO role_name;"}
                    value={sqlQuery}
                    onChange={(e) => {
                      setSqlQuery(e.target.value);
                      setAddSubmitError("");
                    }}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  {addSubmitError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {addSubmitError}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">SQL mode executes exactly the statements you enter. Existing grants are not revoked automatically unless you explicitly add `REVOKE` statements. Form mode only updates profiles.</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={handleAdd}
              disabled={addTab === "form" ? (!form.name || !form.cluster) : (!sqlQuery || !form.cluster)}
            >
              Add Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setSelectedRole(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Role (Permissions)</DialogTitle>
            <DialogDescription>Edit role permissions</DialogDescription>
          </DialogHeader>
          <Tabs value={editTab} onValueChange={(v) => {
            setEditTab(v as "form" | "sql");
            setEditSubmitError("");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="sql">SQL Query</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-role-cluster">Cluster *</Label>
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
                  <Label htmlFor="edit-role-name">Role Name *</Label>
                  <Input id="edit-role-name" placeholder="e.g., role_analyst" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-role-description">Description</Label>
                  <Textarea id="edit-role-description" placeholder="Role description or purpose..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="grid gap-2">
                  <Label>Profiles</Label>
                  <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                    {form.cluster && (() => {
                      const physId = getPhysicalClusterId(form.cluster);
                      const filteredProfiles = profiles.filter((p) => p.clusterId === physId);
                      return filteredProfiles.length > 0 ? filteredProfiles.map((profile) => (
                        <div key={profile.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-role-profile-${profile.id}`}
                            checked={form.profiles.includes(profile.name)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setForm({ ...form, profiles: [...form.profiles, profile.name] });
                              } else {
                                setForm({ ...form, profiles: form.profiles.filter((p) => p !== profile.name) });
                              }
                            }}
                          />
                          <Label htmlFor={`edit-role-profile-${profile.id}`} className="font-normal cursor-pointer">{profile.name}</Label>
                        </div>
                      )) : <p className="text-sm text-gray-500">No profiles available for this cluster</p>;
                    })()}
                    {!form.cluster && <p className="text-sm text-gray-500">Please select a cluster first</p>}
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sql" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-role-sql-cluster">Cluster</Label>
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
                  <Label htmlFor="edit-role-sql">SQL Query (Current DDL)</Label>
                  <Textarea
                    id="edit-role-sql"
                    placeholder={"ALTER ROLE role_name;\nGRANT SELECT ON database.* TO role_name;"}
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
                    }}
                    rows={20}
                    className="font-mono text-sm bg-gray-50 border-gray-300 whitespace-pre"
                    style={{ lineHeight: '1.5' }}
                  />
                  {editSubmitError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {editSubmitError}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">SQL mode executes exactly the statements you enter. Existing grants are not revoked automatically unless you explicitly add `REVOKE` statements. Form mode updates profiles only.</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={handleEdit}
              disabled={editTab === "form" ? (!form.name || !form.cluster) : (!sqlQuery || !form.cluster)}
            >
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>Are you sure you want to delete this role? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {selectedRole && (
            <div className="py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Role Name:</span>
                  <span className="text-sm">{selectedRole.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Cluster:</span>
                  <span className="text-sm">{selectedRole.cluster}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Profiles:</span>
                  <span className="text-sm">{selectedRole.profiles?.length || 0} profiles</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
