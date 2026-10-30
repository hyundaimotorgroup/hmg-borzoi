import { format } from "date-fns";
import type { AppUserFormValues } from "@/lib/validation";

export interface ApiUserClusterAccess {
  clusterId: string;
  chUsername: string | null;
  cluster: { id: string; name: string } | null;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  clusterAccess: ApiUserClusterAccess[];
}

export interface PlatformUser {
  id: string;
  username: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  createdAt: string;
  lastLogin: string;
  clusterAccess?: Array<{
    clusterId: string;
    clusterName: string;
    chUsername?: string;
  }>;
}

export interface ClusterBasic {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  environment: string;
}

export interface ChUser {
  id: string;
  username: string;
  authType: string;
  roles: string[];
  profile: string;
  profiles: string[];
  storage: string;
  status: string;
}

export interface ClusterAccessResponse {
  clusterId: string;
  chUsername: string | null;
}

export type UserFormState = AppUserFormValues;

export type ConnectionTestStatus = Record<string, {
  testing: boolean;
  success?: boolean;
  error?: string;
}>;

export const availableRoles = ["admin", "developer", "viewer"];

export function buildPlatformUsers(data: ApiUser[]): PlatformUser[] {
  return data.map((user) => ({
    id: user.id,
    username: user.name,
    email: user.email,
    role: user.role,
    status: 'active' as const,
    lastLogin: format(new Date(), 'yyyy-MM-dd'),
    createdAt: format(new Date(), 'yyyy-MM-dd'),
    clusterAccess: user.clusterAccess.map((a) => ({
      clusterId: a.clusterId,
      clusterName: a.cluster?.name || 'Unknown',
      chUsername: a.chUsername ?? undefined,
    })),
  }));
}
