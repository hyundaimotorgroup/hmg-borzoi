"use client";

import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShieldCheck } from "lucide-react";
import type { ChUser, Role } from "../types";

interface CHGrantsTabProps {
  chUsers: ChUser[];
  roles: Role[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

interface GrantRow {
  id: string;
  target: string;
  cluster: string;
  targetType: "USER" | "ROLE";
  privilege: string;
  database: string;
  table: string;
}

function parseGrant(raw: string): { privilege: string; database: string; table: string } {
  const onIdx = raw.toUpperCase().indexOf(" ON ");
  if (onIdx === -1) return { privilege: raw, database: "*", table: "*" };

  const privilege = raw.slice(0, onIdx).trim();
  const target = raw.slice(onIdx + 4).trim().replace(/\(.*\)$/, "");

  const dotIdx = target.indexOf(".");
  if (dotIdx !== -1) {
    return {
      privilege,
      database: target.slice(0, dotIdx) || "*",
      table: target.slice(dotIdx + 1) || "*",
    };
  }
  return { privilege, database: target || "*", table: "*" };
}

const PRIVILEGE_COLOR: Record<string, string> = {
  SELECT: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  INSERT: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  UPDATE: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  DELETE: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  CREATE: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  DROP: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  ALTER: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  ALL: "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600",
};

function privilegeColor(privilege: string): string {
  const key = privilege.split(" ")[0].toUpperCase();
  return PRIVILEGE_COLOR[key] ?? "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600";
}

export function CHGrantsTab({
  chUsers,
  roles,
  searchQuery,
  onSearchChange,
}: CHGrantsTabProps) {
  const [typeFilter, setTypeFilter] = useState<"all" | "user" | "role">("all");
  const [dbFilter, setDbFilter] = useState<string>("all");

  const allGrants = useMemo<GrantRow[]>(() => {
    const rows: GrantRow[] = [];

    chUsers.forEach((user) => {
      (user.grants ?? []).forEach((raw, i) => {
        rows.push({
          id: `user-${user.id}-${i}`,
          target: user.username,
          cluster: user.cluster,
          targetType: "USER",
          ...parseGrant(raw),
        });
      });
    });

    roles.forEach((role) => {
      (role.grants ?? []).forEach((raw, i) => {
        rows.push({
          id: `role-${role.id}-${i}`,
          target: role.name,
          cluster: role.cluster,
          targetType: "ROLE",
          ...parseGrant(raw),
        });
      });
    });

    return rows;
  }, [chUsers, roles]);

  const databases = useMemo(() => {
    const dbs = new Set(allGrants.map((g) => g.database).filter((d) => d !== "*"));
    return [...dbs].sort((a, b) => a.localeCompare(b));
  }, [allGrants]);

  const filtered = useMemo(() => {
    return allGrants.filter((g) => {
      if (typeFilter === "user" && g.targetType !== "USER") return false;
      if (typeFilter === "role" && g.targetType !== "ROLE") return false;
      if (dbFilter !== "all" && g.database !== dbFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          g.target.toLowerCase().includes(q) ||
          g.privilege.toLowerCase().includes(q) ||
          g.database.toLowerCase().includes(q) ||
          g.table.toLowerCase().includes(q) ||
          g.cluster.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allGrants, typeFilter, dbFilter, searchQuery]);

  const userGrantCount = allGrants.filter((g) => g.targetType === "USER").length;
  const roleGrantCount = allGrants.filter((g) => g.targetType === "ROLE").length;

  const columns = useMemo<ColumnDef<GrantRow>[]>(() => [
    {
      accessorKey: "target",
      header: "Target",
      size: 130,
      cell: ({ row }) => (
        <span className="text-gray-900 dark:text-gray-100 whitespace-nowrap">
          {row.original.target}
        </span>
      ),
    },
    {
      accessorKey: "targetType",
      header: "Type",
      size: 80,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        row.original.targetType === "USER" ? (
          <Badge className="bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700 font-normal text-xs">
            USER
          </Badge>
        ) : (
          <Badge className="bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700 font-normal text-xs">
            ROLE
          </Badge>
        )
      ),
    },
    {
      accessorKey: "cluster",
      header: "Cluster",
      size: 110,
      cell: ({ row }) => (
        <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
          {row.original.cluster}
        </span>
      ),
    },
    {
      accessorKey: "privilege",
      header: "Privilege",
      size: 120,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <Badge className={`font-mono text-xs border ${privilegeColor(row.original.privilege)}`}>
          {row.original.privilege}
        </Badge>
      ),
    },
    {
      accessorKey: "database",
      header: "Database",
      size: 100,
      cell: ({ row }) => (
        row.original.database === "*" ? (
          <span className="font-mono text-xs text-gray-400 dark:text-gray-500">*</span>
        ) : (
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.original.database}</span>
        )
      ),
    },
    {
      accessorKey: "table",
      header: "Table",
      size: 100,
      cell: ({ row }) => (
        row.original.table === "*" ? (
          <span className="font-mono text-xs text-gray-400 dark:text-gray-500">*</span>
        ) : (
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.original.table}</span>
        )
      ),
    },
  ], []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
              Grants
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              All privilege grants on users and roles
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span>
              <span className="text-blue-600 dark:text-blue-400">{userGrantCount}</span> user
            </span>
            <span>·</span>
            <span>
              <span className="text-purple-600 dark:text-purple-400">{roleGrantCount}</span> role
            </span>
            <span>·</span>
            <span>
              <span className="text-gray-900 dark:text-white">{allGrants.length}</span> total
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search target, privilege, database, table..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
            {(["all", "user", "role"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 transition-colors ${
                  typeFilter === t
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {t === "all" ? "All" : t === "user" ? "Users" : "Roles"}
              </button>
            ))}
          </div>

          <Select value={dbFilter} onValueChange={setDbFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Database" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All databases</SelectItem>
              <SelectItem value="*">* (global)</SelectItem>
              {databases.map((db) => (
                <SelectItem key={db} value={db}>{db}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {allGrants.length === 0
                ? "No grants found for the selected cluster."
                : "No results match the current filters."}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage="No results match the current filters."
          />
        )}
      </CardContent>
    </Card>
  );
}
