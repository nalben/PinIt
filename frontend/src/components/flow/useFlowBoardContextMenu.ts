import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export type FlowBoardContextMenuState = {
  isOpen: boolean;
  x: number; // viewport (fixed) coordinates
  y: number; // viewport (fixed) coordinates
  anchorX: number; // container-local (scaled) coordinates
  anchorY: number; // container-local (scaled) coordinates
};

const getContainerScale = (containerEl: HTMLDivElement | null) => {
  if (!containerEl) return { scaleX: 1, scaleY: 1, rect: null as DOMRect | null };
  const rect = containerEl.getBoundingClientRect();
  const scaleX = containerEl.offsetWidth ? rect.width / containerEl.offsetWidth : 1;
  const scaleY = containerEl.offsetHeight ? rect.height / containerEl.offsetHeight : 1;
  return {
    scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
    scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
    rect,
  };
};

const clampToViewport = (x: number, y: number, menuWidth: number, menuHeight: number) => {
  const margin = 16;
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;

  let nextX = x;
  let nextY = y;

  const maxX = viewportWidth - menuWidth - margin;
  const maxY = viewportHeight - menuHeight - margin;

  if (nextX > maxX) nextX = maxX;
  if (nextY > maxY) nextY = maxY;
  if (nextX < margin) nextX = margin;
  if (nextY < margin) nextY = margin;

  return { x: nextX, y: nextY };
};

export const useFlowBoardContextMenu = (params: {
  canEditCards: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const { canEditCards, containerRef, contextMenuRef } = params;
  const [contextMenu, setContextMenu] = useState<FlowBoardContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    anchorX: 0,
    anchorY: 0
  });

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  useEffect(() => {
    if (canEditCards) return;
    closeContextMenu();
  }, [canEditCards, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu.isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };

    const onResize = () => closeContextMenu();

    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      const target = e.target as globalThis.Node | null;
      const menuEl = contextMenuRef.current;
      if (menuEl && target && menuEl.contains(target)) return;
      closeContextMenu();
    };

    const onContextMenuCapture = (e: MouseEvent) => {
      const target = e.target as globalThis.Node | null;
      const menuEl = contextMenuRef.current;
      if (menuEl && target && menuEl.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const containerEl = containerRef.current;
      if (containerEl && target && containerEl.contains(target)) return;

      closeContextMenu();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', onPointerDownCapture, true);
    window.addEventListener('contextmenu', onContextMenuCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('contextmenu', onContextMenuCapture, true);
    };
  }, [closeContextMenu, contextMenu.isOpen, containerRef, contextMenuRef]);

  useLayoutEffect(() => {
    if (!contextMenu.isOpen) return;
    const el = contextMenuRef.current;
    if (!el) return;

    const menuWidth = el.offsetWidth;
    const menuHeight = el.offsetHeight;
    if (!menuWidth || !menuHeight) return;

    setContextMenu((prev) => {
      if (!prev.isOpen) return prev;
      const { x, y } = clampToViewport(prev.x, prev.y, menuWidth, menuHeight);
      if (x === prev.x && y === prev.y) return prev;
      return { ...prev, x, y };
    });
  }, [contextMenu.isOpen, contextMenuRef]);


  const openContextMenuAt = useCallback(
    (clientX: number, clientY: number) => {
      const { scaleX, scaleY, rect } = getContainerScale(containerRef.current);
      const anchorX = rect ? (clientX - rect.left) / scaleX : clientX;
      const anchorY = rect ? (clientY - rect.top) / scaleY : clientY;
      setContextMenu({ isOpen: true, x: clientX, y: clientY, anchorX, anchorY });
    },
    [containerRef]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canEditCards) {
        closeContextMenu();
        return;
      }
      openContextMenuAt(e.clientX, e.clientY);
    },
    [canEditCards, closeContextMenu, openContextMenuAt]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!contextMenu.isOpen) return;
      if (e.button !== 0) return;
      const target = e.target as globalThis.Node | null;
      const menuEl = contextMenuRef.current;
      if (menuEl && target && menuEl.contains(target)) return;
      closeContextMenu();
    },
    [closeContextMenu, contextMenu.isOpen, contextMenuRef]
  );

  return { contextMenu, closeContextMenu, openContextMenuAt, handleContextMenu, handleMouseDown };
};
