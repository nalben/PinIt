import { useEffect, useLayoutEffect, useState } from 'react';
import type React from 'react';

const hasVerticalOverflow = (el: HTMLDivElement | null) => {
  if (!el) return false;
  return el.scrollHeight > el.clientHeight + 1;
};

export const useParticipantsListScroll = (params: {
  listRef: React.RefObject<HTMLDivElement | null>;
  watchKey: string;
}) => {
  const { listRef, watchKey } = params;
  const [hasScroll, setHasScroll] = useState(false);

  useLayoutEffect(() => {
    const next = hasVerticalOverflow(listRef.current);
    setHasScroll((prev) => (prev === next ? prev : next));
  }, [listRef, watchKey]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    let frameId: number | null = null;
    const update = () => {
      const next = hasVerticalOverflow(listRef.current);
      setHasScroll((prev) => (prev === next ? prev : next));
    };
    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        update();
      });
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(scheduleUpdate);
      ro.observe(el);
      window.addEventListener('resize', scheduleUpdate);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', scheduleUpdate);
        if (frameId !== null) window.cancelAnimationFrame(frameId);
      };
    }

    window.addEventListener('resize', scheduleUpdate);
    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [listRef, watchKey]);

  return hasScroll;
};

