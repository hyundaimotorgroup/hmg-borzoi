import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

interface UseNodeSelectionFocusResult {
  selectedNodes: string[];
  focusedNodes: string[];
  setSelectedNodes: Dispatch<SetStateAction<string[]>>;
  setFocusedNodes: Dispatch<SetStateAction<string[]>>;
  handleLegendClick: (dataKey: string) => void;
  handleNodesChange: (nextNodes: string[]) => void;
  handleNodeToggle: (node: string) => void;
}

export function useNodeSelectionFocus(): UseNodeSelectionFocusResult {
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [focusedNodes, setFocusedNodes] = useState<string[]>([]);

  const handleLegendClick = useCallback((dataKey: string) => {
    setFocusedNodes((prev) =>
      prev.includes(dataKey) ? prev.filter((n) => n !== dataKey) : [...prev, dataKey]
    );
  }, []);

  const handleNodesChange = useCallback((nextNodes: string[]) => {
    setSelectedNodes(nextNodes);
    setFocusedNodes([]);
  }, []);

  const handleNodeToggle = useCallback((node: string) => {
    setSelectedNodes((prev) =>
      prev.includes(node) ? prev.filter((item) => item !== node) : [...prev, node]
    );
    setFocusedNodes([]);
  }, []);

  return {
    selectedNodes,
    focusedNodes,
    setSelectedNodes,
    setFocusedNodes,
    handleLegendClick,
    handleNodesChange,
    handleNodeToggle,
  };
}
