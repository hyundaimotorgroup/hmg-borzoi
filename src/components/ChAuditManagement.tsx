"use client";

import { Shield, Terminal, History, Clock } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useAuditData } from "./ch-audit/hooks/useAuditData";
import { DDLAuditTab } from "./ch-audit/tabs/DDLAuditTab";
import { LongRunningTab } from "./ch-audit/tabs/LongRunningTab";
import { QueryHistoryTab } from "./ch-audit/tabs/QueryHistoryTab";
import { RunningQueriesTab } from "./ch-audit/tabs/RunningQueriesTab";

export function ChAuditManagement() {
  const data = useAuditData();

  return (
    <div className="p-6 space-y-6">

      <Tabs value={data.activeMainTab} onValueChange={data.setActiveMainTab}>
        <TabsList className="grid grid-cols-4 w-auto">
          <TabsTrigger value="ddl-audit">
            <Shield className="w-4 h-4 mr-2" />
            DDL Audit
          </TabsTrigger>
          <TabsTrigger value="running">
            <Terminal className="w-4 h-4 mr-2" />
            Running Queries
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Query History
          </TabsTrigger>
          <TabsTrigger value="long-running">
            <Clock className="w-4 h-4 mr-2" />
            Long Running
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ddl-audit" className="mt-6">
          <DDLAuditTab
            clusters={data.clusters}
            selectedCluster={data.selectedCluster}
            setSelectedCluster={data.setSelectedCluster}
            searchTerm={data.searchTerm}
            setSearchTerm={data.setSearchTerm}
            selectedType={data.selectedType}
            setSelectedType={data.setSelectedType}
            timeRange={data.timeRange}
            setTimeRange={data.setTimeRange}
            auditPage={data.auditPage}
            setAuditPage={data.setAuditPage}
            auditPageSize={data.auditPageSize}
            setAuditPageSize={data.setAuditPageSize}
            auditLogTotal={data.auditLogTotal}
            auditSummary={data.auditSummary}
            loading={data.loading}
            auditLogs={data.auditLogs}
            fetchAuditLogs={data.fetchAuditLogs}
          />
        </TabsContent>

        <TabsContent value="running" className="mt-6">
          <RunningQueriesTab
            clusters={data.clusters}
            selectedClusterId={data.selectedClusterId}
            onClusterChange={(val) => data.handleClusterIdChange(val, data.fetchRunningQueries)}
            querySearchTerm={data.querySearchTerm}
            setQuerySearchTerm={data.setQuerySearchTerm}
            runningLoading={data.runningLoading}
            runningError={data.runningError}
            filteredRunningQueries={data.filteredRunningQueries}
            runningQueries={data.runningQueries}
            killQuery={data.killQuery}
            fetchRunningQueries={data.fetchRunningQueries}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <QueryHistoryTab
            clusters={data.clusters}
            selectedClusterId={data.selectedClusterId}
            onClusterChange={(val) => data.handleClusterIdChange(val, data.fetchQueryHistory)}
            querySearchTerm={data.querySearchTerm}
            setQuerySearchTerm={data.setQuerySearchTerm}
            queryTimeRange={data.queryTimeRange}
            setQueryTimeRange={data.setQueryTimeRange}
            historyLoading={data.historyLoading}
            historyError={data.historyError}
            queryHistory={data.queryHistory}
            queryHistoryTotal={data.queryHistoryTotal}
            historyPage={data.historyPage}
            setHistoryPage={data.setHistoryPage}
            historyPageSize={data.historyPageSize}
            setHistoryPageSize={data.setHistoryPageSize}
            fetchQueryHistory={data.fetchQueryHistory}
          />
        </TabsContent>

        <TabsContent value="long-running" className="mt-6">
          <LongRunningTab
            clusters={data.clusters}
            selectedClusterId={data.selectedClusterId}
            onClusterChange={(val) => data.handleClusterIdChange(val, data.fetchRunningQueries)}
            querySearchTerm={data.querySearchTerm}
            setQuerySearchTerm={data.setQuerySearchTerm}
            runningLoading={data.runningLoading}
            runningError={data.runningError}
            filteredLongRunningQueries={data.filteredLongRunningQueries}
            longRunningQueries={data.longRunningQueries}
            killQuery={data.killQuery}
            fetchRunningQueries={data.fetchRunningQueries}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
