"use client";

import { useRef, useState } from "react";
import { DatabaseTableManagement } from "@/components/DatabaseTableManagement";
import { ClusterExplorerLayout } from "@/components/ClusterExplorerLayout";

interface DatabasesPageProps {
  currentUser: string;
}

export function DatabasesPage({ currentUser: _currentUser }: DatabasesPageProps) {
  const [explorerNav, setExplorerNav] = useState<{
    database: string;
    table: string;
    nonce: number;
    mountKey: string;
  } | null>(null);
  const currentMountKeyRef = useRef("");

  return (
    <ClusterExplorerLayout
      requireDatabase
      showExplorer
      onTableSelect={(database, table) => {
        setExplorerNav((prev) => ({
          database,
          table,
          nonce: (prev?.nonce ?? 0) + 1,
          mountKey: currentMountKeyRef.current,
        }));
      }}
    >
      {({ clusterId, clusterName, selectedDatabase, selectedOptionId, resolvedOption, refreshNonce }) => {
        const mountKey = selectedOptionId + selectedDatabase;
        currentMountKeyRef.current = mountKey;
        const nav = explorerNav?.mountKey === mountKey ? explorerNav : null;
        return (
          <DatabaseTableManagement
            key={mountKey + refreshNonce}
            clusterId={clusterId}
            clusterName={resolvedOption?.displayName ?? ""}
            actualClusterName={clusterName}
            initialDatabase={selectedDatabase || undefined}
            externalNavigateTo={nav}
          />
        );
      }}
    </ClusterExplorerLayout>
  );
}
