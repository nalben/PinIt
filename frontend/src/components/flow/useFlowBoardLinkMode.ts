import { useCallback, useEffect, useRef, useState } from 'react';

export const useFlowBoardLinkMode = (params: {
  onCancel?: () => void;
}) => {
  const { onCancel } = params;

  const [linkModeStep, setLinkModeStep] = useState<'off' | 'first' | 'second'>('off');
  const linkModeFirstNodeIdRef = useRef<string | null>(null);

  const cancelLinkMode = useCallback(() => {
    setLinkModeStep('off');
    linkModeFirstNodeIdRef.current = null;
    onCancel?.();
  }, [onCancel]);

  const startLinkMode = useCallback(() => {
    linkModeFirstNodeIdRef.current = null;
    setLinkModeStep('first');
  }, []);

  useEffect(() => {
    if (linkModeStep === 'off') return;

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancelLinkMode();
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [cancelLinkMode, linkModeStep]);

  const handleNodeClickInLinkMode = useCallback(
    async <T,>(clickedId: string, deps: {
      setSelectedNodeOnly: (nodeId: string | null) => void;
      persistLinkCreate: (fromId: string, toId: string) => Promise<T | null>;
      onLinkCreated: (link: T) => void;
    }) => {
      if (linkModeStep === 'off') return false;

      const id = String(clickedId);
      if (!id) return true;

      if (linkModeStep === 'first') {
        linkModeFirstNodeIdRef.current = id;
        deps.setSelectedNodeOnly(id);
        setLinkModeStep('second');
        return true;
      }

      const firstId = linkModeFirstNodeIdRef.current;
      if (!firstId) {
        setLinkModeStep('first');
        return true;
      }

      if (String(firstId) === id) return true;

      const link = await deps.persistLinkCreate(firstId, id);
      if (!link) return true;

      deps.onLinkCreated(link);
      deps.setSelectedNodeOnly(id);
      cancelLinkMode();
      return true;
    },
    [cancelLinkMode, linkModeStep]
  );

  return { linkModeStep, startLinkMode, cancelLinkMode, handleNodeClickInLinkMode };
};
