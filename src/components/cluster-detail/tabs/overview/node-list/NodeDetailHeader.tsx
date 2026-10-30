import { Badge } from "@/components/ui/badge";
import type { NodeDisplay } from "@/components/cluster-detail/shared/lib/nodeDisplay";

interface NodeDetailHeaderProps {
  node: NodeDisplay;
}

export function NodeDetailHeader({ node }: NodeDetailHeaderProps) {
  return (
    <div className="flex gap-6 items-center text-xs pb-4 border-b border-gray-300 dark:border-slate-600">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-600 dark:text-gray-400">IP:</span>
        <span className="text-gray-900 dark:text-white">{node.ip}:{node.port}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-600 dark:text-gray-400">Shard:</span>
        <Badge variant="outline" className="text-xs">{node.shard}</Badge>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-600 dark:text-gray-400">Replica:</span>
        <Badge variant="outline" className="text-xs">{node.replica}</Badge>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-600 dark:text-gray-400">Uptime:</span>
        <span className="text-gray-900 dark:text-white">{node.uptime}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-600 dark:text-gray-400">Version:</span>
        <span className="text-gray-900 dark:text-white">{node.version}</span>
      </div>
    </div>
  );
}
