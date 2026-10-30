"use client";

import { Server, HardDrive } from "lucide-react";
import { PanelLoader } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NodeInfo, DetailData } from "./hooks/useClusterManagement";
import type { Cluster } from "@/lib/services/cluster.service";

const statusConfig = {
  healthy: { bg: "bg-green-100", text: "text-green-800", label: "Healthy" },
  warning: { bg: "bg-orange-100", text: "text-orange-800", label: "Warning" },
  critical: { bg: "bg-red-100", text: "text-red-800", label: "Critical" },
} as const;

function getDiskUsageColor(percentage: number): string {
  if (percentage >= 90) return "text-red-600 bg-red-50";
  if (percentage >= 80) return "text-orange-600 bg-orange-50";
  return "text-green-600 bg-green-50";
}

function NodeCard({ node }: { node: NodeInfo }) {
  return (
    <Card key={node.hostname}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-sm">{node.hostname}</h4>
              <Badge variant="outline" className="text-xs">
                Shard {node.shard} / Replica {node.replica}
              </Badge>
              <Badge
                className={`${statusConfig[node.status].bg} ${statusConfig[node.status].text} text-xs`}
              >
                {statusConfig[node.status].label}
              </Badge>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {node.address}:{node.port}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Version: {node.version} | Uptime: {node.uptime}
            </p>
          </div>
          {node.diskUsagePercent > 0 && (
            <div className="text-right">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg ${getDiskUsageColor(node.diskUsagePercent)}`}
              >
                <HardDrive className="w-4 h-4" />
                <div>
                  <div className="text-sm">{node.diskUsagePercent}%</div>
                  <div className="text-xs">
                    {node.diskUsed}GB / {node.diskTotal}GB
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ClusterNodePanelProps {
  isOpen: boolean;
  cluster: Cluster | null;
  detailData: DetailData;
  onClose: (open: boolean) => void;
}

export function ClusterNodePanel({
  isOpen,
  cluster,
  detailData,
  onClose,
}: ClusterNodePanelProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5 text-green-600" />
            {cluster?.name}
          </DialogTitle>
          <DialogDescription>Cluster details and management</DialogDescription>
        </DialogHeader>

        {detailData.loading ? (
          <PanelLoader label="Loading cluster details..." className="py-12" />
        ) : detailData.nodes.length === 0 ? (
          <div className="py-12 text-center">
            <Server className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No node information available.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {detailData.nodes.map((node) => (
              <NodeCard key={node.hostname} node={node} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
