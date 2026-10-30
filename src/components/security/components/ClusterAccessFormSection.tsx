"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertCircle } from "lucide-react";
import type { ClusterBasic, ChUser, UserFormState, ConnectionTestStatus } from "../types";

interface ClusterAccessFormSectionProps {
  clusters: ClusterBasic[];
  userForm: UserFormState;
  chUsers: Record<string, ChUser[]>;
  isLoadingChUsers?: boolean;
  connectionTestStatus: ConnectionTestStatus;
  lockSharedCredentials?: boolean;
  onClusterToggle: (clusterId: string) => void;
  onChUsernameChange: (clusterId: string, value: string) => void;
  onPasswordChange: (clusterId: string, password: string) => void;
  onTestConnection: (clusterId: string, username: string, password: string) => void;
  labelPrefix: string;
}

export function ClusterAccessFormSection({
  clusters,
  userForm,
  chUsers,
  isLoadingChUsers,
  connectionTestStatus,
  lockSharedCredentials = false,
  onClusterToggle,
  onChUsernameChange,
  onPasswordChange,
  onTestConnection,
  labelPrefix,
}: ClusterAccessFormSectionProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto space-y-3">
      {clusters.length > 0 ? (
        clusters.map((cluster) => {
          const access = userForm.clusterAccess.find(a => a.clusterId === cluster.id);
          const hasAccess = !!access;
          return (
            <div key={cluster.id} className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`${labelPrefix}-cluster-${cluster.id}`}
                  checked={hasAccess}
                  onCheckedChange={() => onClusterToggle(cluster.id)}
                />
                <label
                  htmlFor={`${labelPrefix}-cluster-${cluster.id}`}
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                >
                  {cluster.name}
                  <span className="ml-2 text-xs text-gray-500">({cluster.environment})</span>
                </label>
              </div>
              {hasAccess && access && (
                <div className="ml-6 space-y-3 border-l-2 border-gray-200 pl-3">
                  {lockSharedCredentials ? (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      <p className="">Shared ClickHouse account</p>
                      <p className="mt-1 font-mono">{cluster.username || "Not configured"}</p>
                      <p className="mt-1">
                        Admin users automatically use the cluster credentials stored in Cluster.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-2">
                        <Label className="text-xs text-gray-700">ClickHouse User</Label>
                        <Select
                          value={access.chUsername ?? undefined}
                          onValueChange={(value) => onChUsernameChange(cluster.id, value)}
                          disabled={isLoadingChUsers && !chUsers[cluster.id]}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder={isLoadingChUsers && !chUsers[cluster.id] ? "Loading users..." : "Select ClickHouse user"} />
                          </SelectTrigger>
                          <SelectContent>
                            {isLoadingChUsers && !chUsers[cluster.id] ? (
                              <div className="flex items-center gap-2 px-2 py-3 text-xs text-gray-500">
                                <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                Loading ClickHouse users...
                              </div>
                            ) : (chUsers[cluster.id] || []).length === 0 ? (
                              <div className="px-2 py-3 text-xs text-gray-500">
                                No ClickHouse users found. Create users in ClickHouse first.
                              </div>
                            ) : (
                              (chUsers[cluster.id] || []).map((chUser) => (
                                <SelectItem key={chUser.username} value={chUser.username}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{chUser.username}</span>
                                    {chUser.roles && chUser.roles.length > 0 && (
                                      <span className="text-xs text-gray-500">Roles: {chUser.roles.join(', ')}</span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 italic">
                          Permissions are controlled by ClickHouse roles assigned to this user
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs text-gray-700">Password</Label>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="Enter ClickHouse user password"
                            className="h-9 text-sm flex-1"
                            value={access.chPassword || ''}
                            onChange={(e) => onPasswordChange(cluster.id, e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9"
                            disabled={!access.chUsername || !access.chPassword || connectionTestStatus[cluster.id]?.testing}
                            onClick={() => onTestConnection(cluster.id, access.chUsername!, access.chPassword!)}
                          >
                            {connectionTestStatus[cluster.id]?.testing ? (
                              <>
                                <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-1" />
                                Testing
                              </>
                            ) : (
                              'Test'
                            )}
                          </Button>
                        </div>
                        {connectionTestStatus[cluster.id]?.success === true && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3 h-3" />
                            <span>Connection successful!</span>
                          </div>
                        )}
                        {connectionTestStatus[cluster.id]?.success === false && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <AlertCircle className="w-3 h-3" />
                            <span>{connectionTestStatus[cluster.id]?.error || 'Connection failed'}</span>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 italic">Password will be encrypted before storage</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">No clusters available</p>
      )}
    </div>
  );
}
