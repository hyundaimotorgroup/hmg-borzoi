"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

import type { AlertRule } from "./types";
import { severityConfig } from "./utils";

type AlertRulesTabProps = {
  selectedCluster: string;
  alertRules: AlertRule[];
  rulesPage: number;
  RULES_PER_PAGE: number;
  setRulesPage: Dispatch<SetStateAction<number>>;
  toggleRuleEnabled: (ruleId: string) => void;
  openEditDialog: (rule: AlertRule) => void;
  openDeleteDialog: (rule: AlertRule) => void;
};

export function AlertRulesTab({
  selectedCluster,
  alertRules,
  rulesPage,
  RULES_PER_PAGE,
  setRulesPage,
  toggleRuleEnabled,
  openEditDialog,
  openDeleteDialog,
}: AlertRulesTabProps) {
  const filteredRules = alertRules.filter(
    (rule) => selectedCluster === "all" || rule.cluster === selectedCluster || rule.cluster === "all"
  );
  const totalPages = Math.ceil(filteredRules.length / RULES_PER_PAGE);
  const paginatedRules = filteredRules.slice((rulesPage - 1) * RULES_PER_PAGE, rulesPage * RULES_PER_PAGE);

  return (
    <div className="grid grid-cols-1 gap-4">
      {paginatedRules.map((rule) => {
        const config = severityConfig[rule.severity];
        const Icon = config.icon;
        const hasMultipleThresholds = (rule.thresholds?.length ?? 0) > 1;

        return (
          <Card key={rule.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex flex-1 items-start gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.bg}`}>
                    <Icon className={`h-5 w-5 ${config.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-lg dark:text-white">{rule.name}</h3>
                      <Badge
                        className={
                          hasMultipleThresholds
                            ? "border border-slate-200 bg-slate-100 text-slate-700"
                            : `${config.bg} ${config.text}`
                        }
                      >
                        {hasMultipleThresholds ? "multi" : rule.severity}
                      </Badge>
                      <Badge variant="outline">{rule.cluster}</Badge>
                      {!rule.enabled && <Badge variant="secondary">Disabled</Badge>}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      {rule.thresholds && rule.thresholds.length > 0 ? (
                        <div>
                          <span className="font-medium">Thresholds:</span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {rule.thresholds.map((threshold) => (
                              <Badge
                                key={`${rule.id}-${threshold.severity}-${threshold.value}`}
                                variant="outline"
                                className="font-mono"
                              >
                                {threshold.severity} {threshold.operator} {threshold.value}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-1">
                            Column: <span className="font-mono">{rule.thresholdColumnName || "value"}</span>
                            {" "}· Check every {rule.duration} min
                          </p>
                        </div>
                      ) : (
                        <p>
                          <span className="font-medium">Condition:</span>{" "}
                          <span className="font-mono">{rule.thresholdColumnName || "value"}</span>{" "}
                          {rule.condition} {rule.threshold} · Check every {rule.duration} min
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Notifications:</span>{" "}
                        {rule.notificationChannels.length > 0 ? rule.notificationChannels.join(", ") : "None"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={rule.enabled} onCheckedChange={() => toggleRuleEnabled(rule.id)} />
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(rule)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => openDeleteDialog(rule)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRulesPage((page) => Math.max(1, page - 1))}
            disabled={rulesPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">
            Page {rulesPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRulesPage((page) => Math.min(totalPages, page + 1))}
            disabled={rulesPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
