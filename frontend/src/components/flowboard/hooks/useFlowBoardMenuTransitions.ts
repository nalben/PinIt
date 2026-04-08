import { useCallback } from 'react';
import type React from 'react';
import type { Edge, Node as RFNode } from 'reactflow';
import { BOARD_MENU_WIDE_MIN_WIDTH, type BoardMenuView, type SelectedLinkSnapshot } from '@/store/uiStore';
import type { FlowNodeData } from '@/components/flow/flowBoardModel';
import { parseFlowEdgeData } from '@/components/flowboard/utils/flowEdgeData';

type UseFlowBoardMenuTransitionsParams = {
  activeNodeId: string | null;
  boardMenuView: BoardMenuView;
  canEditCards: boolean;
  closeCardDetails: () => void;
  closeContextMenu: () => void;
  flowDragHandleClassName: string;
  flowCardSettingsOpen: boolean;
  hasToken: boolean;
  nodeRectangleClassName: string;
  nodes: RFNode<FlowNodeData>[];
  numericBoardId: number;
  openCardDetailsFromNode: (snapshot: { cardId: number; boardId: number; title: string }, options?: { openMenu?: boolean }) => void;
  openLinkInspector: (snapshot: SelectedLinkSnapshot) => void;
  openSettingsForNode: (node: RFNode<FlowNodeData>) => void;
  selectedLink: SelectedLinkSnapshot | null;
  selectEdgeAndNodes: (params: { edgeId: string; fromNodeId: string; toNodeId: string }) => void;
  setEdgeHighlightBySelectedNodes: (selectedNodeIds: Set<string>) => void;
  setLinkSourceNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setNodes: React.Dispatch<React.SetStateAction<RFNode<FlowNodeData>[]>>;
  setSelectedNodeOnly: (nodeId: string | null) => void;
  clearSelectedEdges: () => void;
  defaultLinkColor: string;
  requestImplicitFlowCardSettingsClose: () => boolean;
  requestImplicitLinkInspectorClose: () => boolean;
};

export const useFlowBoardMenuTransitions = (params: UseFlowBoardMenuTransitionsParams) => {
  const {
    activeNodeId,
    boardMenuView,
    canEditCards,
    closeCardDetails,
    closeContextMenu,
    flowDragHandleClassName,
    flowCardSettingsOpen,
    hasToken,
    nodeRectangleClassName,
    nodes,
    numericBoardId,
    openCardDetailsFromNode,
    openLinkInspector,
    openSettingsForNode,
    selectedLink,
    selectEdgeAndNodes,
    setEdgeHighlightBySelectedNodes,
    setLinkSourceNodeId,
    setNodes,
    setSelectedNodeOnly,
    clearSelectedEdges,
    defaultLinkColor,
    requestImplicitFlowCardSettingsClose,
    requestImplicitLinkInspectorClose,
  } = params;

  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (!canEditCards || !hasToken) return;

      event.preventDefault();
      event.stopPropagation();

      const parsed = parseFlowEdgeData({ edge, defaultColor: defaultLinkColor });
      if (!parsed) return;

      const { linkId, fromCardId, toCardId, style, color, label, isLabelVisible } = parsed;
      const fromTitle = nodes.find((n) => String(n.id) === String(edge.source))?.data?.title ?? null;
      const toTitle = nodes.find((n) => String(n.id) === String(edge.target))?.data?.title ?? null;

      if (flowCardSettingsOpen && requestImplicitFlowCardSettingsClose()) return;
      if (boardMenuView === 'link' && requestImplicitLinkInspectorClose()) return;
      if (boardMenuView === 'card') closeCardDetails();

      selectEdgeAndNodes({
        edgeId: `link-${linkId}`,
        fromNodeId: String(fromCardId),
        toNodeId: String(toCardId),
      });

      openLinkInspector({
        linkId,
        boardId: numericBoardId,
        fromCardId,
        toCardId,
        style,
        color,
        label,
        isLabelVisible,
        fromTitle,
        toTitle,
      });
    },
    [
      boardMenuView,
      canEditCards,
      closeCardDetails,
      defaultLinkColor,
      flowCardSettingsOpen,
      hasToken,
      nodes,
      numericBoardId,
      openLinkInspector,
      requestImplicitFlowCardSettingsClose,
      requestImplicitLinkInspectorClose,
      selectEdgeAndNodes,
    ]
  );

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: RFNode<FlowNodeData>) => {
      const clickedId = String(node.id);

      if ((event.ctrlKey || event.metaKey)) return;
      const targetEl = event.target as Element | null;
      if (targetEl?.closest?.('.react-flow__handle')) return;

      const clickedShape =
        Boolean(targetEl?.closest(`.${flowDragHandleClassName}`)) ||
        (String(node.type) === 'rectangle' && Boolean(targetEl?.closest(`.${nodeRectangleClassName}`)));
      if (!clickedShape) return;

      const wideBoardMenu = typeof window !== 'undefined' && window.innerWidth >= BOARD_MENU_WIDE_MIN_WIDTH;
      if (boardMenuView === 'link' && selectedLink && !clickedId.startsWith('draft-')) {
        if (requestImplicitLinkInspectorClose()) return;
      }

      if (flowCardSettingsOpen && activeNodeId && clickedId !== String(activeNodeId)) {
        if (requestImplicitFlowCardSettingsClose()) return;
      }

      setSelectedNodeOnly(clickedId);

      if (boardMenuView === 'link' && selectedLink && !clickedId.startsWith('draft-')) {
        clearSelectedEdges();
        setNodes((prev) => prev.map((n) => ({ ...n, selected: String(n.id) === clickedId })));
        setEdgeHighlightBySelectedNodes(new Set([clickedId]));
      }

      if (!wideBoardMenu && boardMenuView === 'card') {
        closeCardDetails();
      }

      setLinkSourceNodeId(clickedId);

      const cardDetailsSnapshot = (() => {
        if (clickedId.startsWith('draft-')) return null;
        const cardId = Number(clickedId);
        if (!Number.isFinite(cardId) || cardId <= 0) return null;
        if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return null;
        return {
          cardId,
          boardId: numericBoardId,
          title: node.data.title,
        };
      })();
      const shouldOpenDetailsMenu = !canEditCards;

      if (flowCardSettingsOpen && activeNodeId && clickedId === String(activeNodeId)) {
        if (cardDetailsSnapshot) openCardDetailsFromNode(cardDetailsSnapshot, { openMenu: shouldOpenDetailsMenu });
        closeContextMenu();
        return;
      }

      openSettingsForNode(node);
      if (cardDetailsSnapshot) openCardDetailsFromNode(cardDetailsSnapshot, { openMenu: shouldOpenDetailsMenu });

      if (wideBoardMenu && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          setSelectedNodeOnly(clickedId);
        });
      }

      closeContextMenu();
    },
    [
      activeNodeId,
      boardMenuView,
      canEditCards,
      clearSelectedEdges,
      closeCardDetails,
      closeContextMenu,
      flowCardSettingsOpen,
      flowDragHandleClassName,
      nodeRectangleClassName,
      numericBoardId,
      openCardDetailsFromNode,
      openSettingsForNode,
      requestImplicitFlowCardSettingsClose,
      requestImplicitLinkInspectorClose,
      selectedLink,
      setEdgeHighlightBySelectedNodes,
      setLinkSourceNodeId,
      setNodes,
      setSelectedNodeOnly,
    ]
  );

  return {
    handleEdgeClick,
    handleNodeClick,
  };
};
