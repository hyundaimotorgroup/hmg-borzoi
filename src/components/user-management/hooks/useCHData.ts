import { logger } from "@/lib/utils/logger";
import { format } from "date-fns";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ChUser, Role, Profile, ProfileSetting, ClusterOption } from "../types";

interface ApiUser {
  id: string;
  username: string;
  authType: string | string[];
  roles?: string[];
  profile?: string;
  profiles?: string[];
  grants?: string[];
  defaultRolesAll?: boolean;
  defaultRolesList?: string[];
  status?: string;
  createdAt?: string;
}

interface ApiRole {
  id: string;
  name: string;
  description?: string;
  grants?: string[];
  profiles?: string[];
}

interface ApiProfile {
  id?: string;
  name: string;
  description?: string;
  settings?: Record<string, string | number> | ProfileSetting[];
  cluster?: string;
  createdAt?: string;
}

function parseSettings(settings: ApiProfile["settings"]): ProfileSetting[] {
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

function parseAuthType(authType: string | string[]): string {
  return Array.isArray(authType) ? authType[0] || "password" : (authType || "password");
}

export function useCHData(selectedCluster: string, clusterOptions: ClusterOption[]) {
  const [chUsers, setClickhouseUsers] = useState<ChUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  // The initial mount always fetches "all" clusters, which fans out across every
  // registered cluster and can take far longer than a single-cluster fetch. If
  // the user picks a specific cluster before that initial fetch resolves, the
  // fast single-cluster response could land first and then get silently
  // clobbered when the slower "all" response finally arrives — showing every
  // cluster's users under what looks like a single selected cluster. Only the
  // response matching the most recently started request is applied to state.
  const latestRequestIdRef = useRef(0);

  const fetchAll = useCallback(async (cluster: string, opts: ClusterOption[], signal?: AbortSignal) => {
    if (!cluster || opts.length === 0) return;

    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    try {
      if (cluster === "all") {
        const physicalClusters = opts.filter((opt) => !opt.isLogical);

        const results = await Promise.all(
          physicalClusters.map(async (clusterOpt) => {
            try {
              const physicalId = clusterOpt.id.replace(/^physical:/, '');
              const [usersRes, rolesRes, profilesRes] = await Promise.all([
                fetch(`/api/clusters/${physicalId}/ch-users`, { signal }),
                fetch(`/api/clusters/${physicalId}/ch-roles`, { signal }),
                fetch(`/api/clusters/${physicalId}/ch-profiles`, { signal }),
              ]);

              const users: ChUser[] = [];
              const roleList: Role[] = [];
              const profileList: Profile[] = [];

              if (usersRes.ok) {
                const usersData: ApiUser[] = await usersRes.json();
                users.push(
                  ...usersData.map((user) => ({
                    id: `${physicalId}-${user.id}`,
                    username: user.username,
                    cluster: clusterOpt.name,
                    clusterId: physicalId,
                    authType: parseAuthType(user.authType),
                    roles: user.roles || [],
                    profile: user.profile || '',
                    profiles: user.profiles || [],
                    grants: user.grants || [],
                    defaultRolesAll: user.defaultRolesAll ?? false,
                    defaultRolesList: user.defaultRolesList || [],
                    status: (user.status as "active" | "inactive") || 'active',
                    createdAt: user.createdAt || format(new Date(), 'yyyy-MM-dd'),
                  }))
                );
              }

              if (rolesRes.ok) {
                const rolesData: ApiRole[] = await rolesRes.json();
                roleList.push(
                  ...rolesData.map((role) => ({
                    id: `${physicalId}-${role.id}`,
                    name: role.name,
                    cluster: clusterOpt.name,
                    clusterId: physicalId,
                    description: role.description || '',
                    grants: role.grants || [],
                    profiles: role.profiles || [],
                    createdAt: format(new Date(), 'yyyy-MM-dd'),
                  }))
                );
              }

              if (profilesRes.ok) {
                const profilesData: ApiProfile[] = await profilesRes.json();
                profileList.push(
                  ...profilesData.map((profile) => ({
                    id: `${physicalId}-${profile.id || profile.name}`,
                    name: profile.name,
                    cluster: clusterOpt.name,
                    clusterId: physicalId,
                    description: profile.description || '',
                    settings: parseSettings(profile.settings),
                    createdAt: format(new Date(), 'yyyy-MM-dd'),
                  }))
                );
              }

              return { users, roles: roleList, profiles: profileList };
            } catch (error) {
              if ((error as Error).name === 'AbortError') throw error;
              logger.error(`Error fetching data for cluster ${clusterOpt.name}:`, error);
              return { users: [], roles: [], profiles: [] };
            }
          })
        );

        if (requestId !== latestRequestIdRef.current) return; // superseded by a newer request

        setClickhouseUsers(results.flatMap((r) => r.users));
        setRoles(results.flatMap((r) => r.roles));
        setProfiles(results.flatMap((r) => r.profiles));
      } else {
        const selectedOption = opts.find((opt) => opt.id === cluster);
        const physicalClusterId = selectedOption?.isLogical
          ? selectedOption.physicalClusterId!
          : cluster.replace(/^physical:/, '');
        const clusterName = selectedOption?.name || '';
        const logicalClusterName = selectedOption?.isLogical ? selectedOption.name : null;
        const queryParams = logicalClusterName
          ? `?logicalCluster=${encodeURIComponent(logicalClusterName)}`
          : '';

        const [usersRes, rolesRes, profilesRes] = await Promise.all([
          fetch(`/api/clusters/${physicalClusterId}/ch-users${queryParams}`, { signal }),
          fetch(`/api/clusters/${physicalClusterId}/ch-roles${queryParams}`, { signal }),
          fetch(`/api/clusters/${physicalClusterId}/ch-profiles${queryParams}`, { signal }),
        ]);

        if (requestId !== latestRequestIdRef.current) return; // superseded by a newer request

        if (usersRes.ok) {
          const usersData: ApiUser[] = await usersRes.json();
          setClickhouseUsers(
            usersData.map((user) => ({
              id: `${clusterName}-${user.id}`,
              username: user.username,
              cluster: clusterName,
              clusterId: physicalClusterId,
              selectedClusterId: cluster,
              authType: parseAuthType(user.authType),
              roles: user.roles || [],
              profile: user.profile || '',
              profiles: user.profiles || [],
              grants: user.grants || [],
              defaultRolesAll: user.defaultRolesAll ?? false,
              defaultRolesList: user.defaultRolesList || [],
              status: (user.status as "active" | "inactive") || 'active',
              createdAt: user.createdAt || format(new Date(), 'yyyy-MM-dd'),
            }))
          );
        }

        if (rolesRes.ok) {
          const rolesData: ApiRole[] = await rolesRes.json();
          setRoles(
            rolesData.map((role) => ({
              id: `${clusterName}-${role.id}`,
              name: role.name,
              cluster: clusterName,
              clusterId: physicalClusterId,
              selectedClusterId: cluster,
              description: role.description || '',
              grants: role.grants || [],
              profiles: role.profiles || [],
              createdAt: format(new Date(), 'yyyy-MM-dd'),
            }))
          );
        }

        if (profilesRes.ok) {
          const profilesData: ApiProfile[] = await profilesRes.json();
          setProfiles(
            profilesData.map((profile) => ({
              id: `${clusterName}-${profile.id || profile.name}`,
              name: profile.name,
              cluster: clusterName,
              clusterId: physicalClusterId,
              selectedClusterId: cluster,
              description: profile.description || '',
              settings: parseSettings(profile.settings),
              createdAt: format(new Date(), 'yyyy-MM-dd'),
            }))
          );
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        logger.error('Error fetching ClickHouse data:', error);
      }
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedCluster || clusterOptions.length === 0) return;
    const controller = new AbortController();
    void fetchAll(selectedCluster, clusterOptions, controller.signal);
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [selectedCluster, clusterOptions, fetchAll]);

  const refreshData = useCallback(async () => {
    await fetchAll(selectedCluster, clusterOptions);
  }, [selectedCluster, clusterOptions, fetchAll]);

  return {
    chUsers,
    setClickhouseUsers,
    roles,
    setRoles,
    profiles,
    setProfiles,
    loading,
    refreshData,
  };
}
