"use client";

import { XOctagon, FileText, Shield, AlertOctagon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useLogData } from "./ch-logs/hooks/useLogData";
import { CrashLogTab } from "./ch-logs/tabs/CrashLogTab";
import { ExecutionErrorsTab } from "./ch-logs/tabs/ExecutionErrorsTab";
import { SessionLogTab } from "./ch-logs/tabs/SessionLogTab";
import { TextLogTab } from "./ch-logs/tabs/TextLogTab";

export function ChLogManagement() {
  const data = useLogData();

  return (
    <div className="p-6 space-y-6">

      <Tabs value={data.activeTab} onValueChange={data.setActiveTab}>
        <TabsList className="grid grid-cols-4 w-auto">
          <TabsTrigger value="errors">
            <XOctagon className="w-4 h-4 mr-2" />
            Execution Errors
          </TabsTrigger>
          <TabsTrigger value="text">
            <FileText className="w-4 h-4 mr-2" />
            Server Log
          </TabsTrigger>
          <TabsTrigger value="session">
            <Shield className="w-4 h-4 mr-2" />
            Session Log
          </TabsTrigger>
          <TabsTrigger value="crash">
            <AlertOctagon className="w-4 h-4 mr-2" />
            Crash Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-6">
          <ExecutionErrorsTab
            clusters={data.clusters}
            selectedClusterId={data.selectedClusterId}
            onClusterChange={data.handleClusterIdChange}
            errorsSearch={data.errorsSearch}
            setErrorsSearch={data.setErrorsSearch}
            errorsLoading={data.errorsLoading}
            errorsError={data.errorsError}
            executionErrors={data.executionErrors}
            filteredExecutionErrors={data.filteredExecutionErrors}
            errorsTimeRange={data.errorsTimeRange}
            setErrorsTimeRange={data.setErrorsTimeRange}
            fetchExecutionErrors={data.fetchExecutionErrors}
          />
        </TabsContent>

        <TabsContent value="text" className="mt-6">
          <TextLogTab
            clusters={data.clusters}
            selectedClusterId={data.selectedClusterId}
            onClusterChange={data.handleClusterIdChange}
            textLogLoading={data.textLogLoading}
            textLogError={data.textLogError}
            textLogs={data.textLogs}
            textLogTotal={data.textLogTotal}
            textLogPage={data.textLogPage}
            setTextLogPage={data.setTextLogPage}
            textLogPageSize={data.textLogPageSize}
            setTextLogPageSize={data.setTextLogPageSize}
            textLogSearch={data.textLogSearch}
            setTextLogSearch={data.setTextLogSearch}
            textLogComponent={data.textLogComponent}
            setTextLogComponent={data.setTextLogComponent}
            textLogLevels={data.textLogLevels}
            setTextLogLevels={data.setTextLogLevels}
            textLogTimeRange={data.textLogTimeRange}
            setTextLogTimeRange={data.setTextLogTimeRange}
            fetchTextLogs={data.fetchTextLogs}
          />
        </TabsContent>

        <TabsContent value="session" className="mt-6">
          <SessionLogTab
            clusters={data.clusters}
            selectedClusterId={data.selectedClusterId}
            onClusterChange={data.handleClusterIdChange}
            sessionLogLoading={data.sessionLogLoading}
            sessionLogError={data.sessionLogError}
            sessionLogs={data.sessionLogs}
            sessionLogTotal={data.sessionLogTotal}
            sessionLogPage={data.sessionLogPage}
            setSessionLogPage={data.setSessionLogPage}
            sessionLogPageSize={data.sessionLogPageSize}
            setSessionLogPageSize={data.setSessionLogPageSize}
            sessionLogUser={data.sessionLogUser}
            setSessionLogUser={data.setSessionLogUser}
            sessionLogTypes={data.sessionLogTypes}
            setSessionLogTypes={data.setSessionLogTypes}
            sessionLogTimeRange={data.sessionLogTimeRange}
            setSessionLogTimeRange={data.setSessionLogTimeRange}
            fetchSessionLogs={data.fetchSessionLogs}
          />
        </TabsContent>

        <TabsContent value="crash" className="mt-6">
          <CrashLogTab
            clusters={data.clusters}
            selectedClusterId={data.selectedClusterId}
            onClusterChange={data.handleClusterIdChange}
            crashLoading={data.crashLoading}
            crashError={data.crashError}
            crashLogs={data.crashLogs}
            crashTimeRange={data.crashTimeRange}
            setCrashTimeRange={data.setCrashTimeRange}
            fetchCrashLogs={data.fetchCrashLogs}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
