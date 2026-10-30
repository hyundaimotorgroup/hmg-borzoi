export interface DatabaseInfo {
  name: string;
  engine: string;
  tablesCount: number;
  totalSize: string;
}

export type TableType =
  | "MergeTree"
  | "ReplicatedMergeTree"
  | "Distributed"
  | "View"
  | "MaterializedView"
  | "ReplacingMergeTree"
  | "AggregatingMergeTree"
  | "SummingMergeTree";

export type TableTypeFilter =
  | "all"
  | "local"
  | "distributed"
  | "materializedView"
  | "view";

export interface TableDependency {
  database: string;
  table: string;
  type: "source" | "target";
  relationshipType: "distributed_to_local" | "view_to_table" | "materialized_view_to_table";
}

export interface TablePlacement {
  hostName: string;
  hostAddress: string;
  port: number;
  shardNum: number;
  replicaNum: number;
  rows: number;
  totalBytes: number;
  size: string;
  parts: number;
  partitions: number;
}

export interface TableColumn {
  name: string;
  type: string;
  position: number;
  defaultKind?: string;
  defaultExpression?: string;
  comment?: string;
  dataCompressedBytes?: number;
  dataUncompressedBytes?: number;
}

export interface TableInfo {
  name: string;
  engine: string;
  tableType: TableType;
  rows: string;
  rowsRaw: number;
  size: string;
  parts: number;
  partitions: number;
  totalBytes: number;
  shardCount: number;
  replicaCount: number;
  nodeCount: number;
  placements: TablePlacement[];
  columns: TableColumn[];
  dependencies?: TableDependency[];
  description?: string;
  ddl?: string;
  partitionKey?: string;
  sortingKey?: string;
  primaryKey?: string;
  projects?: string[];
}

export interface DatabaseTableManagementProps {
  clusterId: string;
  clusterName: string;
  /** actual ClickHouse cluster name (for logical clusters, used with clusterAllReplicas) */
  actualClusterName?: string;
  /** database name to auto-expand on initial load */
  initialDatabase?: string;
  /** when set, navigates to the specified table; nonce must change to trigger re-navigation */
  externalNavigateTo?: { database: string; table: string; nonce: number } | null;
}
