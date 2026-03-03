import { useCallback, useEffect, useRef } from 'react';
import type { ReactFlowInstance } from 'reactflow';

export const useFlowBoardPointerGestures = (params: {
  canEditCards: boolean;
  reactFlow: ReactFlowInstance | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  createPanelRef: React.RefObject<HTMLDivElement | null>;
  closeContextMenu: () => void;
  openContextMenuAt: (clientX: number, clientY: number) => void;
  flowCardSettingsOpen: boolean;
  cancelCardSettings: () => void;
  nodeRectangleSelector: string;
  dragHandleSelector: string;
}) => {
  const {
    canEditCards,
    reactFlow,
    containerRef,
    contextMenuRef,
    createPanelRef,
    closeContextMenu,
    openContextMenuAt,
    flowCardSettingsOpen,
    cancelCardSettings,
    nodeRectangleSelector,
    dragHandleSelector,
  } = params;

  const longPressTimeoutRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const suppressClickRef = useRef(false);

  const manualPanRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    viewport: { x: number; y: number; zoom: number };
    moved: boolean;
  } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  useEffect(() => () => cancelLongPress(), [cancelLongPress]);

  const handlePointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!reactFlow) return;
      if (!e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.ctrlKey || e.metaKey) return;

      const targetEl = e.target as Element | null;
      if (targetEl?.closest?.('.react-flow__handle')) return;
      const panelEl = createPanelRef.current;
      const menuEl = contextMenuRef.current;
      if (panelEl && targetEl && panelEl.contains(targetEl)) return;
      if (menuEl && targetEl && menuEl.contains(targetEl)) return;

      const nodeEl = targetEl?.closest('.react-flow__node.flow_node_wrapper');
      if (!nodeEl) return;
      if (targetEl?.closest(nodeRectangleSelector)) return;
      if (targetEl?.closest(dragHandleSelector)) return;

      manualPanRef.current = {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        viewport: reactFlow.getViewport(),
        moved: false,
      };
      containerRef.current?.setPointerCapture(e.pointerId);

      closeContextMenu();
      e.preventDefault();
      e.stopPropagation();
    },
    [closeContextMenu, containerRef, contextMenuRef, createPanelRef, dragHandleSelector, nodeRectangleSelector, reactFlow]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'touch') return;
      if (!e.isPrimary) return;
      if (!canEditCards) return;

      const target = e.target as globalThis.Node | null;
      const panelEl = createPanelRef.current;
      const menuEl = contextMenuRef.current;
      if (panelEl && target && panelEl.contains(target)) return;
      if (menuEl && target && menuEl.contains(target)) return;

      cancelLongPress();

      longPressStartRef.current = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
      longPressTimeoutRef.current = window.setTimeout(() => {
        const start = longPressStartRef.current;
        if (!start) return;
        longPressTimeoutRef.current = null;
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 1000);
        openContextMenuAt(start.clientX, start.clientY);
      }, 450);
    },
    [canEditCards, cancelLongPress, contextMenuRef, createPanelRef, openContextMenuAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pan = manualPanRef.current;
      if (pan && e.pointerId === pan.pointerId) {
        const dx = e.clientX - pan.clientX;
        const dy = e.clientY - pan.clientY;
        if (!pan.moved && Math.hypot(dx, dy) > 2) pan.moved = true;
        reactFlow?.setViewport({ x: pan.viewport.x + dx, y: pan.viewport.y + dy, zoom: pan.viewport.zoom }, { duration: 0 });
        e.preventDefault();
        return;
      }

      const start = longPressStartRef.current;
      if (!start) return;
      if (e.pointerId !== start.pointerId) return;
      if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 10) cancelLongPress();
    },
    [cancelLongPress, reactFlow]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pan = manualPanRef.current;
      if (pan && e.pointerId === pan.pointerId) {
        manualPanRef.current = null;
        try {
          containerRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }

        if (!pan.moved) {
          closeContextMenu();
          if (flowCardSettingsOpen) cancelCardSettings();
        }

        e.preventDefault();
        return;
      }

      const start = longPressStartRef.current;
      if (!start) return;
      if (e.pointerId !== start.pointerId) return;
      cancelLongPress();
    },
    [cancelCardSettings, cancelLongPress, closeContextMenu, containerRef, flowCardSettingsOpen]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pan = manualPanRef.current;
      if (pan && e.pointerId === pan.pointerId) {
        manualPanRef.current = null;
        try {
          containerRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        e.preventDefault();
      }
      cancelLongPress();
    },
    [cancelLongPress, containerRef]
  );

  const handleClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!suppressClickRef.current) return;

      const target = e.target as globalThis.Node | null;
      const menuEl = contextMenuRef.current;
      const panelEl = createPanelRef.current;
      if (menuEl && target && menuEl.contains(target)) return;
      if (panelEl && target && panelEl.contains(target)) return;

      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    [contextMenuRef, createPanelRef]
  );

  return {
    handlePointerDownCapture,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClickCapture,
  };
};

