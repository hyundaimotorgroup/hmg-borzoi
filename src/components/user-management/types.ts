export interface ChUser {
  id: string;
  username: string;
  cluster: string;
  clusterId?: string;
  /** Original selected cluster id (logical/physical distinction) */
  selectedClusterId?: string;
  authType: string;
  /** Role names (from API) or role ids (from UI selection) depending on context */
  roles: string[];
  /** Legacy single profile (backward compat) */
  profile?: string;
  /** Profile names (from API) or profile ids (from UI selection) depending on context */
  profiles: string[];
  grants?: string[];
  /** Whether all granted roles are default (system.users.default_roles_all) */
  defaultRolesAll?: boolean;
  /** List of default role names (system.users.default_roles_list) */
  defaultRolesList?: string[];
  status: "active" | "inactive";
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  cluster: string;
  clusterId?: string;
  /** Original selected cluster id (logical/physical distinction) */
  selectedClusterId?: string;
  description: string;
  grants?: string[];
  /** Array of profile names */
  profiles?: string[];
  createdAt: string;
}

export type ProfileSettingMode =
  | "NONE"
  | "READONLY"
  | "WRITABLE"
  | "CONST"
  | "CHANGEABLE_IN_READONLY";

export interface ProfileSetting {
  name: string;
  value?: string | number;
  min?: string | number;
  max?: string | number;
  mode?: Exclude<ProfileSettingMode, "NONE">;
}

export interface Profile {
  id: string;
  name: string;
  cluster: string;
  clusterId?: string;
  /** Original selected cluster id (logical/physical distinction) */
  selectedClusterId?: string;
  description: string;
  settings: ProfileSetting[];
  createdAt: string;
}

export interface ClusterOption {
  id: string;
  name: string;
  displayName: string;
  isLogical: boolean;
  environment?: string;
  /** Only for logical clusters */
  physicalClusterId?: string;
  /** Actual ClickHouse cluster name (for ON CLUSTER) */
  actualClusterName?: string;
}
