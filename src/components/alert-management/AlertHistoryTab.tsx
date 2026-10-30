"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";

import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";

import type { AlertHistory } from "./types";
import { severityConfig, statusConfig } from "./utils";

type AlertHistoryTabProps = {
  selectedCluster: string;
  alertHistory: AlertHistory[];
  historyPage: number;
  historyTotalCount: number;
  HISTORY_PER_PAGE: number;
  timezone: string;
  setHistoryPage: Dispatch<SetStateAction<number>>;
  handleResolveAlert: (logId: string, resolved: boolean) => void;
};

export function AlertHistoryTab({
  selectedCluster,
  alertHistory,
  historyPage,
  historyTotalCount,
  HISTORY_PER_PAGE,
  timezone,
  setHistoryPage,
  handleResolveAlert,
}: AlertHistoryTabProps) {
  const filteredHistory = alertHistory.filter(
    (alert) => selectedCluster === "all" || alert.cluster === selectedCluster
  );
  const totalPages = Math.ceil(historyTotalCount / HISTORY_PER_PAGE);

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        {filteredHistory.map((alert) => {
          const severityConf = severityConfig[alert.severity];
          const statusConf = statusConfig[alert.status];
          const Icon = severityConf.icon;
          const isResolved = !!alert.resolvedAt;

          return (
            <Card key={alert.id}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${severityConf.bg}`}>
                    <Icon className={`h-5 w-5 ${severityConf.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="">{alert.ruleName}</h3>
                      <Badge className={`${severityConf.bg} ${severityConf.text}`}>{alert.severity}</Badge>
                      <Badge className={`${statusConf.bg} ${statusConf.text}`}>{statusConf.label}</Badge>
                    </div>
                    <p className="mb-1 text-sm text-gray-600">{alert.message}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTimeWithTimezone(alert.triggeredAt, timezone)}
                      </span>
                      <span>Cluster: {alert.cluster}</span>
                    </div>
                  </div>
                  <label className="flex shrink-0 cursor-pointer select-none items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isResolved}
                      onChange={() => handleResolveAlert(alert.id, !isResolved)}
                      className="h-4 w-4 cursor-pointer accent-green-600"
                    />
                    <span className={`text-xs ${isResolved ? "text-green-600" : "text-gray-500"}`}>
                      {isResolved ? "Resolved" : "Resolve"}
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {historyTotalCount > 0 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
            disabled={historyPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {historyPage} of {totalPages} ({historyTotalCount} total)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryPage((page) => Math.min(totalPages, page + 1))}
            disabled={historyPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}
