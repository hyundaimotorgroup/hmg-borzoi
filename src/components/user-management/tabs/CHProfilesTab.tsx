import { logger } from "@/lib/utils/logger";
import { format } from "date-fns";
import { useRef, useState, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Server, Network } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createCHProfileSchema, updateCHProfileSchema } from "@/lib/validation";
import type { Profile, ProfileSetting, ProfileSettingMode, ClusterOption } from "../types";

interface CHProfilesTabProps {
  profiles: Profile[];
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;
  selectedCluster: string;
  clusterOptions: ClusterOption[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => Promise<void>;
}

interface ProfileForm {
  name: string;
  cluster: string;
  description: string;
  settings: ProfileSetting[];
}

interface SettingEntry {
  id: string;
  name: string;
  value: string;
  min: string;
  max: string;
  mode: ProfileSettingMode;
}

interface ApiProfileResponse {
  id?: string;
  name: string;
  description?: string;
  cluster?: string;
  settings?: Record<string, string | number> | ProfileSetting[];
  createdAt?: string;
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

function formatSettingClause(setting: ProfileSetting): string {
  let clause = `  ${setting.name}`;
  if (setting.value !== undefined && setting.value !== null && setting.value !== "") {
    clause += ` = ${setting.value}`;
  }
  if (setting.min !== undefined && setting.min !== null && setting.min !== "") {
    clause += ` MIN ${setting.min}`;
  }
  if (setting.max !== undefined && setting.max !== null && setting.max !== "") {
    clause += ` MAX ${setting.max}`;
  }
  if (setting.mode) {
    clause += ` ${setting.mode}`;
  }
  return clause;
}

const SETTING_MODE_OPTIONS: Array<{ value: ProfileSettingMode; label: string }> = [
  { value: "NONE", label: "Mode" },
  { value: "WRITABLE", label: "WRITABLE" },
  { value: "CONST", label: "CONST" },
  { value: "CHANGEABLE_IN_READONLY", label: "CHANGEABLE_IN_READONLY" },
];

function getClusterSelectTriggerClass(option?: ClusterOption | null): string {
  if (option?.isLogical) {
    return "border-purple-200 bg-purple-50/60 text-purple-900 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-100";
  }
  if (option) {
    return "border-blue-200 bg-blue-50/60 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100";
  }
  return "";
}

function getPhysicalClusterId(clusterId: string, clusterOptions: ClusterOption[]) {
  const option = clusterOptions.find((candidate) => candidate.id === clusterId);
  return option?.isLogical ? option.physicalClusterId! : clusterId.replace(/^physical:/, '');
}

function normalizeEditorProfileSettings(settings: ProfileSetting[]): ProfileSetting[] {
  return settings.map((setting) => ({
    ...setting,
    ...(setting.mode ? { mode: setting.mode } : {}),
  }));
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

const QUICK_TEMPLATES: Array<{
  label: string;
  badgeClass: string;
  description: string;
  settings: ProfileSetting[];
}> = [
  {
    label: "Heavy Batch",
    badgeClass: "bg-red-100 text-red-800",
    description: "Heavy batch processing (200GB memory, 32 threads)",
    settings: [
      { name: "max_memory_usage", value: 214748364800 },
      { name: "max_memory_usage_for_user", value: 268435456000 },
      { name: "max_threads", value: 32 },
      { name: "max_concurrent_queries_for_user", value: 10 },
      { name: "max_execution_time", value: 7200 },
    ],
  },
  {
    label: "Standard ETL",
    badgeClass: "bg-orange-100 text-orange-800",
    description: "Standard ETL workload (100GB memory, 16 threads)",
    settings: [
      { name: "max_memory_usage", value: 107374182400 },
      { name: "max_memory_usage_for_user", value: 128849018880 },
      { name: "max_threads", value: 16 },
      { name: "max_concurrent_queries_for_user", value: 5 },
      { name: "max_execution_time", value: 3600 },
    ],
  },
  {
    label: "Analyst",
    badgeClass: "bg-blue-100 text-blue-800",
    description: "Analyst queries (40GB memory, 8 threads)",
    settings: [
      { name: "max_memory_usage", value: 42949672960 },
      { name: "max_memory_usage_for_user", value: 53687091200 },
      { name: "max_threads", value: 8 },
      { name: "max_concurrent_queries_for_user", value: 3 },
      { name: "max_execution_time", value: 1800 },
    ],
  },
  {
    label: "BI/Service",
    badgeClass: "bg-green-100 text-green-800",
    description: "BI/Service queries (10GB memory, 4 threads)",
    settings: [
      { name: "max_memory_usage", value: 10737418240 },
      { name: "max_memory_usage_for_user", value: 16106127360 },
      { name: "max_threads", value: 4 },
      { name: "max_concurrent_queries_for_user", value: 2 },
      { name: "max_execution_time", value: 300 },
    ],
  },
  {
    label: "Monitoring",
    badgeClass: "bg-purple-100 text-purple-800",
    description: "Monitoring and health checks (2GB memory, readonly)",
    settings: [
      { name: "max_memory_usage", value: 2147483648 },
      { name: "max_memory_usage_for_user", value: 5368709120 },
      { name: "max_threads", value: 2 },
      { name: "max_concurrent_queries_for_user", value: 5 },
      { name: "max_execution_time", value: 60 },
    ],
  },
  {
    label: "Readonly",
    badgeClass: "bg-gray-100 text-gray-800",
    description: "Read-only queries (5GB memory, readonly)",
    settings: [
      { name: "max_memory_usage", value: 5368709120 },
      { name: "max_memory_usage_for_user", value: 5368709120 },
      { name: "max_threads", value: 2 },
      { name: "max_concurrent_queries_for_user", value: 1 },
      { name: "max_execution_time", value: 180 },
    ],
  },
];

export function CHProfilesTab({
  profiles,
  setProfiles,
  selectedCluster,
  clusterOptions,
  searchQuery,
  onSearchChange,
  onRefresh,
}: CHProfilesTabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  const [addTab, setAddTab] = useState<"form" | "sql">("form");
  const [editTab, setEditTab] = useState<"form" | "sql">("form");
  const [addSubmitError, setAddSubmitError] = useState("");
  const [editSubmitError, setEditSubmitError] = useState("");
  const [clearEditSqlOnClick, setClearEditSqlOnClick] = useState(false);
  const [sqlQuery, setSqlQuery] = useState("");

  const [form, setForm] = useState<ProfileForm>({
    name: "",
    cluster: "all",
    description: "",
    settings: [],
  });
  const [originalEditSettings, setOriginalEditSettings] = useState<ProfileSetting[]>([]);
  const [settingEntries, setSettingEntries] = useState<SettingEntry[]>([]);
  const nextSettingEntryIdRef = useRef(0);

  const createSettingEntry = (name = "", value = "", min = "", max = "", mode: ProfileSettingMode = "NONE"): SettingEntry => ({
    id: `setting-${nextSettingEntryIdRef.current++}`,
    name,
    value,
    min,
    max,
    mode,
  });

  const createSettingEntries = (settings: ProfileSetting[]): SettingEntry[] => (
    settings.map((setting) => createSettingEntry(
      setting.name,
      setting.value !== undefined && setting.value !== null ? String(setting.value) : "",
      setting.min !== undefined && setting.min !== null ? String(setting.min) : "",
      setting.max !== undefined && setting.max !== null ? String(setting.max) : "",
      setting.mode ?? "NONE",
    ))
  );

  const normalizeSettingEntries = (entries: SettingEntry[]): ProfileSetting[] => (
    entries
      .map((entry) => ({
        name: entry.name.trim(),
        value: entry.value.trim(),
        min: entry.min.trim(),
        max: entry.max.trim(),
        mode: entry.mode,
      }))
      .filter((entry) => entry.name && (entry.value !== "" || entry.min || entry.max || entry.mode !== "NONE"))
      .map((entry) => ({
        name: entry.name,
        ...(entry.value !== "" ? { value: entry.value } : {}),
        ...(entry.min ? { min: entry.min } : {}),
        ...(entry.max ? { max: entry.max } : {}),
        ...(entry.mode !== "NONE" ? { mode: entry.mode } : {}),
      }))
  );

  const syncSettingEntries = (entries: SettingEntry[]) => {
    setSettingEntries(entries);
    setForm((prev) => ({
      ...prev,
      settings: normalizeSettingEntries(entries),
    }));
  };

  const appendSettingEntry = () => {
    syncSettingEntries([...settingEntries, createSettingEntry()]);
  };

  const filteredProfiles = profiles.filter((p) => {
    if (selectedCluster === "" || selectedCluster === "all") {
      return searchQuery === "" || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    const opt = clusterOptions.find((o) => o.id === selectedCluster);
    return (
      (searchQuery === "" || p.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      p.cluster === opt?.name
    );
  });

  const resetForm = () => {
    setForm({ name: "", cluster: "all", description: "", settings: [] });
    setOriginalEditSettings([]);
    setSettingEntries([]);
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
    logger.error('Failed to add profile:', displayMessage);
    setAddSubmitError(displayMessage);
    toast.error(displayMessage);
  };

  const showEditError = (message: string) => {
    const displayMessage = summarizeClickHouseError(message);
    logger.error('Failed to update profile:', displayMessage);
    setEditSubmitError(displayMessage);
    toast.error(displayMessage);
  };

  const buildProfilePayload = ({
    mode,
    logicalClusterName,
    variant,
  }: {
    mode: "form" | "sql";
    logicalClusterName: string | null;
    variant: "create" | "update";
  }) => {
    if (mode === "sql") {
      return {
        profileName: variant === "update" ? form.name : undefined,
        sqlQuery,
        logicalCluster: logicalClusterName || undefined,
      };
    }

    return {
      profileName: variant === "update" ? selectedProfile?.name ?? form.name : form.name,
      settings: form.settings,
      originalSettings: variant === "update" ? originalEditSettings : undefined,
      inheritProfiles: [],
      logicalCluster: logicalClusterName || undefined,
    };
  };

  const validateProfilePayload = (
    payload: ReturnType<typeof buildProfilePayload>,
    variant: "create" | "update"
  ) => {
    const schema = variant === "create" ? createCHProfileSchema : updateCHProfileSchema;
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      if (variant === "create") {
        setAddSubmitError("");
      } else {
        setEditSubmitError("");
      }
      return parsed.data;
    }

    const message = parsed.error.issues[0]?.message ?? "Please check the profile input values.";
    if (variant === "create") {
      showAddError(message);
    } else {
      showEditError(message);
    }
    return null;
  };

  const applyTemplate = (template: (typeof QUICK_TEMPLATES)[0]) => {
    const settings = template.settings.map((setting) => ({ ...setting }));
    setForm((prev) => ({ ...prev, settings, description: template.description }));
    setSettingEntries(createSettingEntries(settings));
  };

  const updateSettingEntry = (index: number, field: "name" | "value" | "min" | "max" | "mode", value: string) => {
    const updated = [...settingEntries];
    if (field === "mode") {
      updated[index].mode = value as ProfileSettingMode;
    } else {
      updated[index][field] = value;
    }
    syncSettingEntries(updated);
  };

  const removeSettingEntry = (index: number) => {
    const updated = settingEntries.filter((_, i) => i !== index);
    syncSettingEntries(updated);
  };

  const loadProfilesAfterChange = async (physicalClusterId: string, logicalClusterName: string | null) => {
    if (selectedCluster === "all") {
      await onRefresh();
      return;
    }
    const qp = logicalClusterName ? `?logicalCluster=${encodeURIComponent(logicalClusterName)}` : '';
    const res = await fetch(`/api/clusters/${physicalClusterId}/ch-profiles${qp}`);
    if (res.ok) {
      const data: ApiProfileResponse[] = await res.json();
      const opt = clusterOptions.find((o) => o.id === selectedCluster);
      const clusterName = opt?.name || '';
      setProfiles(data.map((profile) => ({
        id: `${clusterName}-${profile.id || profile.name}`,
        name: profile.name,
        cluster: clusterName,
        clusterId: physicalClusterId,
        selectedClusterId: selectedCluster,
        description: profile.description || '',
        settings: parseProfileSettings(profile.settings),
        createdAt: format(new Date(), 'yyyy-MM-dd'),
      })));
    }
  };

  const handleAdd = async () => {
    setAddSubmitError("");
    try {
      const targetClusterId = selectedCluster === "all" ? form.cluster : selectedCluster;
      const opt = clusterOptions.find((o) => o.id === targetClusterId);
      const physicalClusterId = getPhysicalClusterId(targetClusterId, clusterOptions);
      const logicalClusterName = opt?.actualClusterName || null;
      const payload = buildProfilePayload({
        mode: addTab,
        logicalClusterName,
        variant: "create",
      });
      const validated = validateProfilePayload(payload, "create");
      if (!validated) {
        return;
      }
      const res = await fetch(`/api/clusters/${physicalClusterId}/ch-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        showAddError(await getApiErrorMessage(res, 'Failed to create profile'));
        return;
      }

      await loadProfilesAfterChange(physicalClusterId, logicalClusterName);
      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to create profile. Please try again.';
      showAddError(rawMessage);
    }
  };

  const handleEdit = async () => {
    if (!selectedProfile) return;
    setEditSubmitError("");
    try {
      const opt = clusterOptions.find((o) => o.id === form.cluster);
      const physicalClusterId = getPhysicalClusterId(form.cluster, clusterOptions);
      const logicalClusterName = opt?.actualClusterName || null;
      const payload = buildProfilePayload({
        mode: editTab,
        logicalClusterName,
        variant: "update",
      });
      const validated = validateProfilePayload(payload, "update");
      if (!validated) {
        return;
      }

      const res = await fetch(`/api/clusters/${physicalClusterId}/ch-profiles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        showEditError(await getApiErrorMessage(res, 'Failed to update profile'));
        return;
      }

      await loadProfilesAfterChange(physicalClusterId, logicalClusterName);
      setIsEditOpen(false);
      setSelectedProfile(null);
      resetForm();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to update profile. Please try again.';
      showEditError(rawMessage);
    }
  };

  const handleDelete = async () => {
    if (!selectedProfile) return;
    try {
      const targetClusterId = selectedProfile.selectedClusterId || (selectedCluster === "all" ? selectedProfile.clusterId! : selectedCluster);
      const opt = clusterOptions.find((o) => o.id === targetClusterId);
      const physicalClusterId = selectedProfile.clusterId || (opt?.isLogical ? opt.physicalClusterId! : targetClusterId.replace(/^physical:/, ''));
      const logicalClusterName = opt?.actualClusterName || null;

      const qp = new URLSearchParams({ profileName: selectedProfile.name });
      if (logicalClusterName) qp.set('logicalCluster', logicalClusterName);

      const res = await fetch(`/api/clusters/${physicalClusterId}/ch-profiles?${qp.toString()}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to delete profile' }));
        throw new Error(errorData.error || errorData.details || 'Failed to delete profile');
      }

      await loadProfilesAfterChange(physicalClusterId, logicalClusterName);
      setIsDeleteOpen(false);
      setSelectedProfile(null);
    } catch (error) {
      logger.error('Failed to delete profile:', error);
      toast.error('Failed to delete profile. Please try again.');
    }
  };

  const openEdit = async (profile: Profile) => {
    setSelectedProfile(profile);
    setClearEditSqlOnClick(true);

    // In "all" mode, selectedClusterId is not set, so find the ClusterOption using clusterId and set the correct ID
    const clusterOptionId = profile.selectedClusterId ||
      clusterOptions.find((o) => o.id === `physical:${profile.clusterId}`)?.id ||
      profile.clusterId ||
      profile.cluster;

    let resolvedName = profile.name;
    let resolvedDescription = profile.description;
    let resolvedSettings = profile.settings || [];

    try {
      const clusterId = profile.clusterId || profile.cluster;
      const res = await fetch(`/api/clusters/${clusterId}/ch-profiles`);
      if (res.ok) {
        const data: ApiProfileResponse[] = await res.json();
        const latest = data.find((p) => p.name === profile.name);

        if (latest) {
          const settingsList = parseProfileSettings(latest.settings);
          resolvedName = latest.name;
          resolvedDescription = latest.description || profile.description;
          resolvedSettings = normalizeEditorProfileSettings(settingsList);
        } else {
          logger.warn('Profile not found in latest data, using cached data');
        }
      }
    } catch (error) {
      logger.error('Failed to fetch latest profile data:', error);
    }

    try {
      const clusterId = profile.clusterId || profile.cluster;
      const res = await fetch(`/api/clusters/${clusterId}/ddl?type=profile&name=${encodeURIComponent(profile.name)}`);
      if (res.ok) {
        const data = await res.json();
        const currentDDL = data.combined || data.ddl || `-- DDL not available\nCREATE SETTINGS PROFILE IF NOT EXISTS ${profile.name};`;
        setSqlQuery(currentDDL);
      } else {
        let ddl = `-- Current Profile DDL\nCREATE SETTINGS PROFILE IF NOT EXISTS ${profile.name}\n`;
        if (profile.settings.length > 0) {
          ddl += `SETTINGS\n`;
          ddl += profile.settings.map(formatSettingClause).join(',\n');
        }
        ddl += `;`;
        setSqlQuery(ddl);
      }
    } catch (error) {
      logger.error('Failed to fetch DDL:', error);
      setSqlQuery(`-- Error fetching DDL\nCREATE SETTINGS PROFILE IF NOT EXISTS ${profile.name};`);
    }

    const normalizedResolvedSettings = normalizeEditorProfileSettings(resolvedSettings);

    setForm({
      name: resolvedName,
      cluster: clusterOptionId,
      description: resolvedDescription,
      settings: normalizedResolvedSettings,
    });
    setOriginalEditSettings(normalizedResolvedSettings.map((setting) => ({ ...setting })));
    setSettingEntries(createSettingEntries(normalizedResolvedSettings));

    setIsEditOpen(true);
  };

  const openDelete = (profile: Profile) => {
    setSelectedProfile(profile);
    setIsDeleteOpen(true);
  };

  const columns = useMemo<ColumnDef<Profile>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "cluster",
      header: "Cluster",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
          {row.original.cluster}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400 max-w-md truncate block">
          {row.original.description}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(row.original)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => openDelete(row.original)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [clusterOptions]);

  const renderSettingsEditor = () => (
    <div className="min-w-0 space-y-2 overflow-x-auto">
      {settingEntries.length === 0 ? (
        <div className="border border-dashed rounded-md p-4 text-center text-sm text-gray-500">
          No settings. Click &quot;Add&quot; to create one.
        </div>
      ) : (
        <>
          <div className="flex min-w-[760px] items-center gap-2 px-1 text-xs text-gray-500">
            <span className="w-[220px] shrink-0">Setting</span>
            <span className="w-[130px] shrink-0">Value</span>
            <span className="w-[72px] shrink-0">Min (opt)</span>
            <span className="w-[72px] shrink-0">Max (opt)</span>
            <span className="w-[140px] shrink-0">Mode (opt)</span>
            <span className="w-9 shrink-0" />
          </div>
          {settingEntries.map((setting, index) => (
            <div
              key={setting.id}
              className="flex min-w-[760px] items-center gap-2 rounded-md border border-gray-200 p-2"
            >
              <Input
                className="h-9 w-[220px] shrink-0"
                placeholder="Setting name (e.g., readonly)"
                value={setting.name}
                onChange={(e) => updateSettingEntry(index, "name", e.target.value)}
              />
              <Input
                className="h-9 w-[130px] shrink-0"
                placeholder="Value (e.g., 1)"
                value={setting.value}
                onChange={(e) => updateSettingEntry(index, "value", e.target.value)}
              />
              <Input
                className="h-9 w-[72px] shrink-0"
                placeholder="Min (opt)"
                value={setting.min}
                onChange={(e) => updateSettingEntry(index, "min", e.target.value)}
              />
              <Input
                className="h-9 w-[72px] shrink-0"
                placeholder="Max (opt)"
                value={setting.max}
                onChange={(e) => updateSettingEntry(index, "max", e.target.value)}
              />
              <Select value={setting.mode} onValueChange={(value) => updateSettingEntry(index, "mode", value)}>
                <SelectTrigger className="h-9 w-[140px] shrink-0">
                  <SelectValue placeholder="Mode (opt)" />
                </SelectTrigger>
                <SelectContent>
                  {SETTING_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeSettingEntry(index)}>
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          ))}
        </>
      )}
      <p className="text-xs text-gray-500">
        Example: `max_memory_usage = 42949672960 CONST`. `Min`, `Max`, and `Mode` are optional, and `Mode` shows the raw `writability` value.
      </p>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="dark:text-white">Profiles Management</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Resource constraints by performance tier (independent from Role)</p>
            </div>
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={() => {
                const initialSettings: ProfileSetting[] = [
                  { name: "max_memory_usage", value: 42949672960 },
                  { name: "max_threads", value: 8 },
                ];
                setForm({
                  name: "",
                  cluster: selectedCluster,
                  description: "",
                  settings: initialSettings,
                });
                setSettingEntries(createSettingEntries(initialSettings));
                setAddSubmitError("");
                setIsAddOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Profile
            </Button>
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search profiles..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={filteredProfiles} />
        </CardContent>
      </Card>

      {/* Add Profile Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => {
        setIsAddOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent
          className="max-h-[90vh] w-auto overflow-hidden overflow-y-auto sm:max-w-none"
          style={{ width: "min(960px, calc(100vw - 2rem))", maxWidth: "min(960px, calc(100vw - 2rem))" }}
        >
          <DialogHeader>
            <DialogTitle>Add Profile (Resource Constraints)</DialogTitle>
            <DialogDescription>Define resource limits by performance tier. Use Quick Templates or enter values manually.</DialogDescription>
          </DialogHeader>
          <Tabs className="min-w-0" value={addTab} onValueChange={(v) => {
            setAddTab(v as "form" | "sql");
            setAddSubmitError("");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="sql">SQL Query</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="mt-4 min-w-0 space-y-4">
              <div className="grid min-w-0 gap-4 max-h-[60vh] overflow-y-auto">
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="profile-cluster">Cluster *</Label>
                  {selectedCluster === "all" ? (
                    <Select
                      value={form.cluster}
                      onValueChange={async (value) => {
                        setForm({ ...form, cluster: value });
                        try {
                          const physicalClusterId = getPhysicalClusterId(value, clusterOptions);
                          const res = await fetch(`/api/clusters/${physicalClusterId}/ch-profiles`);
                          if (res.ok) {
                            const data: ApiProfileResponse[] = await res.json();
                            const converted: Profile[] = data.map((p) => ({
                              id: p.id || p.name,
                              name: p.name,
                              cluster: p.cluster || '',
                              clusterId: physicalClusterId,
                              description: p.description || '',
                              settings: parseProfileSettings(p.settings),
                              createdAt: p.createdAt || format(new Date(), 'yyyy-MM-dd'),
                            }));
                            setProfiles((prev) => [
                              ...prev.filter((p) => p.clusterId !== physicalClusterId),
                              ...converted,
                            ]);
                          }
                        } catch (error) {
                          logger.error('Failed to load profiles for cluster:', error);
                        }
                      }}
	                    >
                        <SelectTrigger className={getClusterSelectTriggerClass(clusterOptions.find((o) => o.id === form.cluster))}>
                          {form.cluster && form.cluster !== "all" ? (
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

                {form.cluster && form.cluster !== "all" && profiles.filter((p) => p.clusterId === form.cluster).length > 0 && (
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <Label className="text-sm mb-2 block">Copy from Existing Profile</Label>
                    <Select
                      value=""
                      onValueChange={(profileName) => {
                        const found = profiles.find((p) => p.name === profileName && p.clusterId === form.cluster);
                        if (found?.settings) {
                          const copiedSettings = found.settings.map((setting) => ({ ...setting }));
                          setForm((prev) => ({ ...prev, settings: copiedSettings, description: `Copied from ${profileName}` }));
                          setSettingEntries(createSettingEntries(copiedSettings));
                        } else {
                          logger.warn('No settings found for profile:', profileName);
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select existing profile to copy..." /></SelectTrigger>
                      <SelectContent>
                        {profiles.filter((p) => p.clusterId === form.cluster).map((profile) => (
                          <SelectItem key={profile.id} value={profile.name}>
                            {profile.name} ({profile.settings.length} settings)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <Label className="text-sm mb-2 block">Quick Templates</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {QUICK_TEMPLATES.map((template) => (
                      <Button
                        key={template.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={() => applyTemplate(template)}
                      >
                        <Badge className={`${template.badgeClass} mr-2`}>{template.label.split(' ')[0]}</Badge>
                        {template.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="profile-name">Profile Name *</Label>
                    <Input id="profile-name" placeholder="e.g., profile_medium" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-description">Description</Label>
                  <Textarea id="profile-description" placeholder="Profile description or purpose..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Settings</Label>
                    <Button type="button" variant="outline" size="sm" onClick={appendSettingEntry}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                  {renderSettingsEditor()}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sql" className="mt-4 min-w-0 space-y-4">
              <div className="grid min-w-0 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="profile-sql-cluster">Cluster</Label>
	                  {selectedCluster === "all" ? (
	                    <Select value={form.cluster} onValueChange={(value) => setForm({ ...form, cluster: value })}>
                        <SelectTrigger className={getClusterSelectTriggerClass(clusterOptions.find((o) => o.id === form.cluster))}>
                          {form.cluster && form.cluster !== "all" ? (
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
                  <Label htmlFor="profile-sql">SQL Query</Label>
                  <Textarea
                    id="profile-sql"
                    placeholder={"CREATE SETTINGS PROFILE profile_name\nSETTINGS max_memory_usage = 40000000000;"}
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
                  <p className="text-xs text-gray-500">SQL mode executes exactly the statements you enter.</p>
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
              Add Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setSelectedProfile(null);
          resetForm();
        }
      }}>
        <DialogContent
          className="max-h-[90vh] w-auto overflow-hidden overflow-y-auto sm:max-w-none"
          style={{ width: "min(960px, calc(100vw - 2rem))", maxWidth: "min(960px, calc(100vw - 2rem))" }}
        >
          <DialogHeader>
            <DialogTitle>Edit Profile (Resource Constraints)</DialogTitle>
            <DialogDescription>Edit resource constraints</DialogDescription>
          </DialogHeader>
          <Tabs className="min-w-0" value={editTab} onValueChange={(v) => {
            setEditTab(v as "form" | "sql");
            setEditSubmitError("");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="sql">SQL Query</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="mt-4 min-w-0 space-y-4">
              <div className="grid min-w-0 gap-4 max-h-[60vh] overflow-y-auto">
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="edit-profile-cluster">Cluster *</Label>
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-gray-50">
                    {(() => {
                      const opt = clusterOptions.find((o) => o.id === form.cluster);
                      return (
                        <>
                          <Server className="w-4 h-4 text-blue-600" />
                          <span className="text-sm">{opt?.displayName || form.cluster}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-profile-name">Profile Name *</Label>
                    <Input id="edit-profile-name" placeholder="e.g., profile_medium" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-profile-description">Description</Label>
                  <Textarea id="edit-profile-description" placeholder="Profile description or purpose..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Settings</Label>
                    <Button type="button" variant="outline" size="sm" onClick={appendSettingEntry}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                  {renderSettingsEditor()}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sql" className="mt-4 min-w-0 space-y-4">
              <div className="grid min-w-0 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-profile-sql-cluster">Cluster</Label>
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
                  <Label htmlFor="edit-profile-sql">SQL Query (Current DDL)</Label>
                  <Textarea
                    id="edit-profile-sql"
                    placeholder={"ALTER SETTINGS PROFILE IF EXISTS profile_name\nMODIFY SETTINGS max_memory_usage = 40000000000 CONST;"}
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
                    rows={25}
                    className="font-mono text-sm bg-gray-50 border-gray-300 whitespace-pre"
                    style={{ lineHeight: '1.5' }}
                  />
                  {editSubmitError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {editSubmitError}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">SQL mode executes exactly the statements you enter.</p>
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
              Update Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Profile Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>Are you sure you want to delete this profile? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {selectedProfile && (
            <div className="py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Profile Name:</span>
                  <span className="text-sm">{selectedProfile.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Settings Count:</span>
                  <span className="text-sm">{selectedProfile.settings.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Description:</span>
                  <span className="text-sm">{selectedProfile.description}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Profile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
