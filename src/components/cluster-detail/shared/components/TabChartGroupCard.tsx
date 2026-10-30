import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import { NodeSelectionChips, type NodeSelectionItem } from "@/components/cluster-detail/shared/components/NodeSelectionChips";
import type { NodeDisplay } from "@/components/cluster-detail/shared/lib/nodeDisplay";
import { NodeDetailHeader } from "@/components/cluster-detail/tabs/overview/node-list/NodeDetailHeader";

interface TabChartGroupCardProps {
  title: string;
  icon: React.ReactNode;
  timeRange: DashboardTimeRange;
  timezone: string;
  onTimeRangeChange: (range: DashboardTimeRange) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  selectedNodes: string[];
  onNodesChange: (nodes: string[]) => void;
  nodes: string[];
  nodeItems?: NodeSelectionItem[];
  focusedNodes?: string[];
  children: React.ReactNode;
  singleNodeData?: NodeDisplay | null;
  headerExtra?: React.ReactNode;
}

function getGroupTitle(baseTitle: string, selectedNodes: string[], singleNodeData?: NodeDisplay | null) {
  if (selectedNodes.length === 0) {
    return `All Nodes - ${baseTitle}`;
  }

  if (selectedNodes.length === 1) {
    return `${singleNodeData?.name ?? selectedNodes[0]} - ${baseTitle}`;
  }

  return `Selected Nodes (${selectedNodes.length}) - ${baseTitle}`;
}

export function TabChartGroupCard({
  title,
  icon,
  timeRange,
  timezone,
  onTimeRangeChange,
  onRefresh,
  refreshing = false,
  selectedNodes,
  onNodesChange,
  nodes,
  nodeItems,
  focusedNodes = [],
  children,
  singleNodeData,
  headerExtra,
}: TabChartGroupCardProps) {
  function toggleNode(node: string) {
    if (selectedNodes.includes(node)) {
      onNodesChange(selectedNodes.filter((n) => n !== node));
      return;
    }

    onNodesChange([...selectedNodes, node]);
  }

  return (
    <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            {icon}
            {getGroupTitle(title, selectedNodes, singleNodeData)}
          </CardTitle>
          <div className="flex items-center gap-3">
            {headerExtra}
            <DashboardTimeRangePicker
              value={timeRange}
              timezone={timezone}
              onChange={onTimeRangeChange}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-4">
        <div className="mb-4">
          <NodeSelectionChips
            items={nodeItems ?? nodes.map((node) => ({ id: node, label: node }))}
            selectedIds={selectedNodes}
            focusedIds={focusedNodes}
            onSelectAll={() => onNodesChange([])}
            onToggle={toggleNode}
          />
        </div>

        {singleNodeData && selectedNodes.length === 1 && (
          <div className="mb-4">
            <NodeDetailHeader node={singleNodeData} />
          </div>
        )}

        {children}
      </CardContent>
    </Card>
  );
}
