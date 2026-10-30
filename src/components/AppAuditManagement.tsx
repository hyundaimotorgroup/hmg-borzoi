"use client";

import { logger } from "@/lib/utils/logger";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Shield, Search, Calendar, User, Activity } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { useSettings } from "@/contexts/SettingsContext";
import {
  buildTimeseriesSearchParams,
  getDefaultDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/metrics/timeseries-range";
import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";

interface AppAuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;  // CREATE_CLUSTER, UPDATE_CLUSTER, DELETE_CLUSTER, LOGIN, LOGOUT, etc.
  resourceType: string;  // cluster, user, alert, query
  resourceId?: string;
  resourceName?: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
}

export function AppAuditManagement() {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";
  const [auditLogs, setAuditLogs] = useState<AppAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAction, setSelectedAction] = useState("all");
  const [selectedResource, setSelectedResource] = useState("all");
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>(getDefaultDashboardTimeRange);

  const fetchAuditLogs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = buildTimeseriesSearchParams(timeRange, timezone);
      if (selectedAction !== "all") params.append("action", selectedAction);
      if (selectedResource !== "all") params.append("resourceType", selectedResource);

      const response = await fetch(`/api/audit/app?${params}`, { signal });
      const data = await response.json();
      setAuditLogs(data.logs || []);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      logger.error("Failed to fetch audit logs:", error);
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAction, selectedResource, timeRange, timezone]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAuditLogs(controller.signal);
    return () => controller.abort();
  }, [fetchAuditLogs]);

  const actions = [
    "LOGIN",
    "LOGOUT",
    "CREATE_CLUSTER",
    "UPDATE_CLUSTER",
    "DELETE_CLUSTER",
    "CREATE_USER",
    "UPDATE_USER",
    "DELETE_USER",
    "CREATE_ALERT",
    "UPDATE_ALERT",
    "DELETE_ALERT",
    "EXECUTE_QUERY",
  ];

  const resourceTypes = ["cluster", "user", "alert", "query", "auth"];

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.resourceName?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getActionBadgeColor = (action: string) => {
    if (action.startsWith("CREATE")) {
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    } else if (action.startsWith("DELETE")) {
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    } else if (action.startsWith("UPDATE")) {
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    } else if (action === "LOGIN" || action === "LOGOUT") {
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    } else if (action.startsWith("EXECUTE")) {
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
    }
    return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  };

  const getResourceTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      cluster: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      user: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      alert: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      query: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
      auth: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    };
    return colors[type] || "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  };

  const columns = useMemo<ColumnDef<AppAuditLog>[]>(() => [
    {
      accessorKey: "timestamp",
      header: "Time",
      size: 160,
      cell: ({ getValue }) => (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {formatDateTimeWithTimezone(getValue<string>(), timezone)}
        </div>
      ),
    },
    {
      accessorKey: "userName",
      header: "User",
      size: 120,
      cell: ({ getValue }) => (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-gray-900 dark:text-gray-100">{getValue<string>()}</span>
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      size: 140,
      meta: { truncate: false as const },
      cell: ({ getValue }) => (
        <Badge className={getActionBadgeColor(getValue<string>())}>
          {getValue<string>().replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "resourceType",
      header: "Resource",
      size: 120,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <Badge className={getResourceTypeBadgeColor(row.original.resourceType)}>
            {row.original.resourceType}
          </Badge>
          {row.original.resourceName && (
            <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.resourceName}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "details",
      header: "Details",
      size: 200,
    },
    {
      accessorKey: "ipAddress",
      header: "IP Address",
      size: 110,
    },
    {
      accessorKey: "success",
      header: "Status",
      size: 80,
      meta: { truncate: false as const },
      cell: ({ getValue }) => (
        <Badge className={getValue<boolean>() ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"}>
          {getValue<boolean>() ? "Success" : "Failed"}
        </Badge>
      ),
    },
  ], [timezone]);

  return (
    <div className="p-6 space-y-6">

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Total Activities</span>
          <span className="text-base text-gray-900 dark:text-white">
            {filteredLogs.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Success</span>
          <span className="text-base text-green-600 dark:text-green-400">
            {filteredLogs.filter((log) => log.success).length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Failed</span>
          <span className="text-base text-red-600 dark:text-red-400">
            {filteredLogs.filter((log) => !log.success).length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Users with Activity</span>
          <span className="text-base text-purple-600 dark:text-purple-400">
            {new Set(filteredLogs.map((log) => log.userId)).size}
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search users, actions, resources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Action Filter */}
            <Select value={selectedAction} onValueChange={setSelectedAction}>
              <SelectTrigger>
                <SelectValue placeholder="Select Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Resource Type Filter */}
            <Select value={selectedResource} onValueChange={setSelectedResource}>
              <SelectTrigger>
                <SelectValue placeholder="Select Resource Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {resourceTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DashboardTimeRangePicker
              value={timeRange}
              timezone={timezone}
              onChange={setTimeRange}
              onRefresh={() => void fetchAuditLogs()}
              refreshing={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredLogs}
            isLoading={loading}
            emptyMessage="No audit logs found."
          />
        </CardContent>
      </Card>
    </div>
  );
}
