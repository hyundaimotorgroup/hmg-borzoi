import { useCallback, useMemo } from "react";
import { Line } from "recharts";

const nodeColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export interface NodeChartEntry {
  uniqueId: string;
  name: string;
  dataKey: string;
}

export function getNodeSeriesColor(index: number) {
  return nodeColors[index % nodeColors.length];
}

interface UseNodeChartLinesParams {
  nodeChartEntries: NodeChartEntry[];
  focusedNodes: string[];
  onNodeClick?: (name: string) => void;
  onNodeHover?: (name: string | null) => void;
}

export function useNodeChartLines({ nodeChartEntries, focusedNodes, onNodeClick, onNodeHover }: UseNodeChartLinesParams) {
  const isFaded = useCallback(
    (name: string) => focusedNodes.length > 0 && !focusedNodes.includes(name),
    [focusedNodes]
  );

  const nodeSeriesConfigs = useMemo(
    () => nodeChartEntries.map((entry, index) => ({
      entry,
      color: getNodeSeriesColor(index),
      faded: isFaded(entry.name),
    })),
    [isFaded, nodeChartEntries]
  );

  const networkSeriesConfigs = useMemo(
    () => nodeChartEntries.map((entry, index) => ({
      entry,
      color: getNodeSeriesColor(index),
      faded: isFaded(entry.name),
    })),
    [isFaded, nodeChartEntries]
  );

  const hitLine = useCallback((key: string, dataKey: string, nodeName: string, color: string, extra?: Record<string, unknown>) => {
    return (
      <Line
        key={key}
        type="monotone"
        dataKey={dataKey}
        stroke={color}
        strokeWidth={12}
        strokeOpacity={0}
        dot={false}
        activeDot={false}
        legendType="none"
        isAnimationActive={false}
        onClick={() => onNodeClick?.(nodeName)}
        onMouseEnter={() => onNodeHover?.(nodeName)}
        onMouseMove={() => onNodeHover?.(nodeName)}
        onMouseLeave={() => onNodeHover?.(null)}
        style={{ cursor: "pointer" }}
        pointerEvents="stroke"
        {...extra}
      />
    );
  }, [onNodeClick, onNodeHover]);

  const renderNodeLines = useCallback((prefix: string) => {
    return nodeSeriesConfigs.flatMap(({ entry, color, faded }) => {
      return [
        <Line
          key={`${prefix}-${entry.uniqueId}`}
          type="monotone"
          dataKey={entry.dataKey}
          stroke={faded ? "#d1d5db" : color}
          strokeWidth={1.5}
          strokeOpacity={faded ? 0.3 : 1}
          name={entry.name}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          onMouseEnter={() => onNodeHover?.(entry.name)}
          onMouseMove={() => onNodeHover?.(entry.name)}
          onMouseLeave={() => onNodeHover?.(null)}
        />,
        hitLine(`${prefix}-${entry.uniqueId}-hit`, entry.dataKey, entry.name, color),
      ];
    });
  }, [hitLine, nodeSeriesConfigs, onNodeHover]);

  const renderNetworkLines = useCallback((prefix: string, suffix: "receive" | "send") => {
    return networkSeriesConfigs.flatMap(({ entry, color, faded }) => {
      const displayName = `${entry.name} ${suffix === "receive" ? "Receive" : "Send"}`;
      const dataKey = `${entry.dataKey}-${suffix}`;
      return [
        <Line
          key={`${prefix}-${entry.uniqueId}-${suffix}`}
          type="monotone"
          dataKey={dataKey}
          stroke={faded ? "#d1d5db" : color}
          strokeWidth={1.5}
          strokeOpacity={faded ? 0.3 : 1}
          name={displayName}
          dot={false}
          activeDot={false}
          strokeDasharray={suffix === "receive" ? "5 5" : undefined}
          isAnimationActive={false}
          onMouseEnter={() => onNodeHover?.(entry.name)}
          onMouseMove={() => onNodeHover?.(entry.name)}
          onMouseLeave={() => onNodeHover?.(null)}
        />,
        hitLine(
          `${prefix}-${entry.uniqueId}-${suffix}-hit`,
          dataKey,
          entry.name,
          color,
          suffix === "receive" ? { strokeDasharray: "5 5" } : {}
        ),
      ];
    });
  }, [hitLine, networkSeriesConfigs, onNodeHover]);

  return { renderNodeLines, renderNetworkLines };
}
