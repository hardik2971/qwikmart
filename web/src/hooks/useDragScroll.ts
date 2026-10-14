'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Click-and-drag horizontal scrolling for an overflow-x row (touch devices already swipe natively).
 * A drag of more than a few pixels suppresses the click that follows, so links inside the row don't open on release.
 * Also reports whether the row can scroll left/right for optional arrow buttons.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.down) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 5) {
        d.moved = true;
        el.style.cursor = 'grabbing';
        el.style.scrollBehavior = 'auto';
      }
      if (d.moved) el.scrollLeft = d.startLeft - dx;
    };
    const onUp = () => {
      drag.current.down = false;
      el.style.cursor = '';
      el.style.scrollBehavior = '';
    };
    const onClick = (e: MouseEvent) => {
      if (drag.current.moved) {
        e.preventDefault();
        e.stopPropagation();
        drag.current.moved = false;
      }
    };
    const onDragStart = (e: DragEvent) => e.preventDefault(); // stop native image/link dragging
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  return { ref, edges, scrollBy };
}
