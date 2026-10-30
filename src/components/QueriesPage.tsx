"use client";

import { useRef, useState } from "react";
import { QueryEditor, type QueryEditorHandle } from "@/components/QueryEditor";
import { ClusterExplorerLayout } from "@/components/ClusterExplorerLayout";

interface QueriesPageProps {
  currentUser: string;
}

export function QueriesPage({ currentUser }: QueriesPageProps) {
  const editorRef = useRef<QueryEditorHandle>(null);
  const [selectedTable, setSelectedTable] = useState<{ database: string; table: string } | undefined>();
  const [queryNonce, setQueryNonce] = useState(0);

  const handleReset = () => setQueryNonce((n) => n + 1);

  return (
    <ClusterExplorerLayout
      showExplorer
      onTableSelect={(database, table) => {
        setSelectedTable({ database, table });
        editorRef.current?.executeWithQuery(`SELECT * FROM ${database}.${table} LIMIT 100`);
      }}
    >
      {({ clusterId, clusterName }) => (
        <QueryEditor
          ref={editorRef}
          currentUser={currentUser}
          clusterId={clusterId}
          clusterName={clusterName}
          selectedTable={selectedTable}
          onReset={handleReset}
          key={queryNonce || undefined}
        />
      )}
    </ClusterExplorerLayout>
  );
}
