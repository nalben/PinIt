import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';

type UseEscapeHandlerArgs = {
  id: string;
  priority: number;
  isOpen: boolean;
  onEscape: () => void;
};

export const useEscapeHandler = ({ id, priority, isOpen, onEscape }: UseEscapeHandlerArgs) => {
  const isOpenRef = useRef(isOpen);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const { registerEscapeHandler, unregisterEscapeHandler } = useUIStore.getState();

    registerEscapeHandler(id, {
      priority,
      isOpen: () => isOpenRef.current,
      onEscape: () => onEscapeRef.current(),
    });

    return () => unregisterEscapeHandler(id);
  }, [id, priority]);
};

