"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Server, Network, UserCircle, KeyRound, Settings, ShieldCheck } from "lucide-react";
import { useClusters } from "./user-management/hooks/useClusters";
import { useCHData } from "./user-management/hooks/useCHData";
import { CHUsersTab } from "./user-management/tabs/CHUsersTab";
import { CHRolesTab } from "./user-management/tabs/CHRolesTab";
import { CHProfilesTab } from "./user-management/tabs/CHProfilesTab";
import { CHGrantsTab } from "./user-management/tabs/CHGrantsTab";

export function UserManagement() {
  const [mounted, setMounted] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<string>("all");
  const [mainTab, setMainTab] = useState<"users" | "roles" | "profiles" | "grants">("users");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const { clusterOptions } = useClusters();
  const {
    chUsers,
    roles,
    setRoles,
    profiles,
    setProfiles,
    refreshData,
  } = useCHData(selectedCluster, clusterOptions);
  const selectedOption = clusterOptions.find((option) => option.id === selectedCluster) ?? null;

  if (!mounted) {
    return (
      <div className="p-8 space-y-6">
        <Card>
          <CardContent className="p-4">
            <div className="h-9 rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="h-6 rounded bg-gray-100 dark:bg-slate-800" />
          <div className="h-6 rounded bg-gray-100 dark:bg-slate-800" />
          <div className="h-6 rounded bg-gray-100 dark:bg-slate-800" />
        </div>

        <div className="h-10 rounded-xl bg-gray-100 dark:bg-slate-800" />
        <Card>
          <CardContent className="p-6">
            <div className="h-64 rounded bg-gray-50 dark:bg-slate-900" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select value={selectedCluster} onValueChange={setSelectedCluster}>
                <SelectTrigger
                  className={`${
                    selectedCluster === "all"
                      ? "bg-white dark:bg-slate-800 border-gray-200 text-gray-900 dark:text-gray-100"
                      : selectedOption?.isLogical
                        ? "border-purple-200 bg-purple-50/60 text-purple-900 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-100"
                        : "border-blue-200 bg-blue-50/60 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
                  }`}
                >
                  {selectedCluster === "all" ? (
                    <div className="flex items-center gap-2 truncate">
                      <Database className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                      <span className="truncate">All Clusters</span>
                    </div>
                  ) : selectedOption ? (
                    <div className="flex items-center gap-2 truncate">
                      {selectedOption.isLogical ? (
                        <Network className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                      ) : (
                        <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                      <span className="truncate">{selectedOption.displayName}</span>
                    </div>
                  ) : (
                    <SelectValue placeholder="Please select a cluster to view and manage ClickHouse users, roles, and profiles" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-gray-600" />
                      <span>All Clusters</span>
                    </div>
                  </SelectItem>
                  {clusterOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <div className="flex items-center gap-2">
                        {option.isLogical ? (
                          <Network className="w-3.5 h-3.5 text-purple-600" />
                        ) : (
                          <Server className="w-3.5 h-3.5 text-blue-600" />
                        )}
                        <span>{option.displayName}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Users</span>
          <span className="text-base text-gray-900 dark:text-white">{chUsers.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Roles</span>
          <span className="text-base text-gray-900 dark:text-white">{roles.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-green-600 dark:text-green-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Profiles</span>
          <span className="text-base text-gray-900 dark:text-white">{profiles.length}</span>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "users" | "roles" | "profiles" | "grants")}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">
            <UserCircle className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles">
            <KeyRound className="w-4 h-4 mr-2" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="profiles">
            <Settings className="w-4 h-4 mr-2" />
            Profiles
          </TabsTrigger>
          <TabsTrigger value="grants">
            <ShieldCheck className="w-4 h-4 mr-2" />
            Grants
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <CHUsersTab
            chUsers={chUsers}
            roles={roles}
            profiles={profiles}
            setProfiles={setProfiles}
            selectedCluster={selectedCluster}
            clusterOptions={clusterOptions}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRefresh={refreshData}
          />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <CHRolesTab
            roles={roles}
            setRoles={setRoles}
            profiles={profiles}
            setProfiles={setProfiles}
            selectedCluster={selectedCluster}
            clusterOptions={clusterOptions}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRefresh={refreshData}
          />
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <CHProfilesTab
            profiles={profiles}
            setProfiles={setProfiles}
            selectedCluster={selectedCluster}
            clusterOptions={clusterOptions}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRefresh={refreshData}
          />
        </TabsContent>

        <TabsContent value="grants" className="space-y-4">
          <CHGrantsTab
            chUsers={chUsers}
            roles={roles}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
