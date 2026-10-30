export interface CHSystemUser {
  name: string;
  id: string;
  storage: string;
  auth_type: string;
  host_ip: string[];
  host_names: string[];
  host_names_regexp: string[];
  host_names_like: string[];
  default_roles_all: number;
  default_roles_list: string[];
  default_roles_except: string[];
  grantees_any: number;
  grantees_list: string[];
  grantees_except: string[];
}

export interface CHRoleGrant {
  user_name: string;
  role_name: string;
  granted_role_name: string;
  granted_role_is_default: number;
  with_admin_option: number;
}

export interface CHProfileElement {
  user_name: string | null;
  role_name: string | null;
  profile_name: string;
  setting_name: string;
  value: string | null;
  min: string | null;
  max: string | null;
  writability?: string | null;
  inherit_profile: string | null;
}

export interface CHSystemRole {
  name: string;
  id: string;
  storage: string;
}

export interface CHGrant {
  role_name: string | null;
  access_type: string;
  database: string | null;
  table: string | null;
  column: string | null;
  is_partial_revoke: number;
  grant_option: number;
}

export interface CHSystemProfile {
  name: string;
  id: string;
  storage: string;
  num_elements: number;
  apply_to_all: number;
  apply_to_list: string[];
  apply_to_except: string[];
}
