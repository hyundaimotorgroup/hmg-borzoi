import { AlertCircle, CheckCircle, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type NodeStatus = "healthy" | "warning" | "critical";

export interface NodeSelectionItem {
  id: string;
  label: string;
  status?: NodeStatus;
  issueReasons?: string[];
}

interface NodeSelectionChipsProps {
  items: NodeSelectionItem[];
  selectedIds: string[];
  focusedIds?: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}

const chipBaseClass = "h-8 px-3 text-xs border transition-[background-color,border-color,color,box-shadow] shadow-sm";
const selectedChipClass = "!border-blue-300 !bg-blue-50 !text-blue-900 hover:!bg-blue-100 dark:!border-blue-400/80 dark:!bg-blue-500/18 dark:!text-blue-100 dark:hover:!bg-blue-500/24 dark:shadow-[0_0_0_1px_rgba(96,165,250,0.12)]";
const unselectedChipClass = "bg-white text-gray-700 hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-500/80";

function getStatusClass(status?: NodeStatus) {
  switch (status) {
    case "critical":
      return "border-red-400 text-red-700 hover:bg-red-50 dark:border-red-400 dark:text-red-200 dark:hover:bg-red-500/15";
    case "warning":
      return "border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-200 dark:hover:bg-amber-500/15";
    case "healthy":
      return "border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-200 dark:hover:bg-emerald-500/15";
    default:
      return unselectedChipClass;
  }
}

function StatusIcon({ status, selected }: { status?: NodeStatus; selected: boolean }) {
  const className = selected
    ? "text-blue-700 dark:text-blue-50"
    : status === "critical"
      ? "text-red-600 dark:text-red-300"
      : status === "warning"
        ? "text-amber-600 dark:text-amber-300"
        : "text-emerald-600 dark:text-emerald-300";

  return status === "critical" || status === "warning"
    ? <AlertCircle className={`h-3 w-3 ${className}`} />
    : <CheckCircle className={`h-3 w-3 ${className}`} />;
}

export function NodeSelectionChips({
  items,
  selectedIds,
  focusedIds = [],
  onToggle,
  onSelectAll,
}: NodeSelectionChipsProps) {
  const isAll = selectedIds.length === 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Server className="w-3.5 h-3.5 text-gray-600 dark:text-slate-100 flex-shrink-0" aria-hidden="true" />
      <span className="text-sm text-gray-700 dark:text-slate-50 flex-shrink-0">Select Node:</span>
        <Button
        variant="outline"
        size="sm"
        onClick={onSelectAll}
        className={`${chipBaseClass} ${isAll ? selectedChipClass : unselectedChipClass}`}
      >
        All Nodes
      </Button>
      {items.map((item) => {
        const selected = selectedIds.includes(item.id);
        const focused = focusedIds.includes(item.id);
        const hasIssueTooltip = (item.issueReasons?.length || 0) > 0 && item.status && item.status !== "healthy";
        const chip = (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggle(item.id)}
             className={`${chipBaseClass} flex items-center gap-1.5 ${selected ? selectedChipClass : getStatusClass(item.status)} ${focused ? "ring-2 ring-blue-400 dark:ring-blue-300 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
          >
            <StatusIcon status={item.status} selected={selected} />
            {item.label}
          </Button>
        );

        return (
          <div key={item.id} className="relative">
            {hasIssueTooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {chip}
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" sideOffset={6} className="z-[9999] max-w-72 border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 shadow-lg">
                  <div className="space-y-1">
                    <div className="text-[11px]">
                      {item.status === "critical" ? "Critical issues" : "Warning issues"}
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-200">
                      {item.issueReasons?.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : chip}
            {focused ? (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full pointer-events-none" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
