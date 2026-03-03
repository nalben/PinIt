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

    const update = () => {
      const next = hasVerticalOverflow(listRef.current);
      setHasScroll((prev) => (prev === next ? prev : next));
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      window.addEventListener('resize', update);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', update);
      };
    }

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, [listRef, watchKey]);

  return hasScroll;
};

