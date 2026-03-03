import { useCallback } from 'react';
import type React from 'react';
import type { Edge, Node as RFNode } from 'reactflow';

const SELECTED_EDGE_CLASS = 'flow_edge_highlight';

export const useFlowSelection = <TNodeData,>(params: {
  setNodes: React.Dispatch<React.SetStateAction<RFNode<TNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
}) => {
  const { setNodes, setEdges } = params;

  const clearSelectedElements = useCallback(() => {
    setNodes((prev) =>
      prev.some((n) => Boolean((n as unknown as { selected?: boolean }).selected))
        ? prev.map((n) => (Boolean((n as unknown as { selected?: boolean }).selected) ? { ...n, selected: false } : n))
        : prev
    );
    setEdges((prev) =>
      prev.some((e) => Boolean((e as unknown as { selected?: boolean }).selected))
        ? prev.map((e) => (Boolean((e as unknown as { selected?: boolean }).selected) ? { ...e, selected: false } : e))
        : prev
    );
  }, [setEdges, setNodes]);

  const clearSelectedEdges = useCallback(() => {
    setEdges((prev) => prev.map((e) => ((e as unknown as { selected?: boolean }).selected ? { ...e, selected: false } : e)));
  }, [setEdges]);

  const setSelectedNodeOnly = useCallback(
    (nodeId: string | null) => {
      setNodes((prev) =>
        prev.map((n) => {
          const isSelected = nodeId ? String(n.id) === String(nodeId) : false;
          if (Boolean((n as RFNode<TNodeData>).selected) === isSelected) return n;
          return { ...n, selected: isSelected };
        })
      );
    },
    [setNodes]
  );

  const selectEdgeAndNodes = useCallback(
    (params: { edgeId: string; fromNodeId: string; toNodeId: string }) => {
      const { edgeId, fromNodeId, toNodeId } = params;
      setEdges((prev) =>
        prev.map((e) =>
          String(e.id) === edgeId
            ? { ...e, selected: true }
            : (e as unknown as { selected?: boolean }).selected
              ? { ...e, selected: false }
              : e
        )
      );

      setNodes((prev) => prev.map((n) => ({ ...n, selected: String(n.id) === fromNodeId || String(n.id) === toNodeId })));
    },
    [setEdges, setNodes]
  );

  const setEdgeHighlightBySelectedNodes = useCallback(
    (selectedNodeIds: Set<string>) => {
      setEdges((prev) =>
        prev.map((e) => {
          const isConnected = selectedNodeIds.has(String(e.source)) || selectedNodeIds.has(String(e.target));
          const prevClass = typeof e.className === 'string' ? e.className : '';
          const hasFlag = prevClass.split(/\s+/).includes(SELECTED_EDGE_CLASS);
          if (isConnected === hasFlag) return e;
          const cleaned = prevClass
            .split(/\s+/)
            .filter(Boolean)
            .filter((c) => c !== SELECTED_EDGE_CLASS)
            .join(' ')
            .trim();
          const nextClass = `${cleaned} ${isConnected ? SELECTED_EDGE_CLASS : ''}`.trim();
          return { ...e, className: nextClass };
        })
      );
    },
    [setEdges]
  );

  return {
    clearSelectedElements,
    clearSelectedEdges,
    setSelectedNodeOnly,
    selectEdgeAndNodes,
    setEdgeHighlightBySelectedNodes,
  };
};

