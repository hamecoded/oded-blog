import { useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { Possession } from '../../lib/types';

export interface RowDragState {
  id: string;
  over: string | null;
  after: boolean;
}

/**
 * Dragging rows (table rows or cards) by a grip to a new place within their item type, with mouse or touch
 * (pointer events), or one step with ↑/↓ on the focused grip. Items are the elements inside `container` that
 * carry `data-id`. Near the edge of the view it scrolls: the container when it scrolls itself, else the page.
 */
export function useRowDrag(
  rows: Possession[],
  container: RefObject<HTMLElement | null>,
  onMoveRow: ((id: string, targetId: string, after: boolean) => void) | undefined,
  enabled: boolean,
) {
  const [drag, setDrag] = useState<RowDragState | null>(null);
  const canDrag = !!onMoveRow && enabled;

  const keyMove = (p: Possession, dir: -1 | 1) => {
    const same = rows.filter((r) => r.item_type === p.item_type);
    const target = same[same.findIndex((r) => r.id === p.id) + dir];
    if (target && canDrag) onMoveRow!(p.id, target.id, dir === 1);
  };

  const gripProps = (p: Possession) => ({
    'aria-disabled': !canDrag,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!canDrag || e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ id: p.id, over: null, after: false });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!drag || drag.id !== p.id) return;
      const box = container.current;
      if (!box) return;
      const scrolls = box.scrollHeight > box.clientHeight + 2 && getComputedStyle(box).overflowY !== 'visible';
      const r = scrolls ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      if (e.clientY < r.top + 60) (scrolls ? box : window).scrollBy(0, -14);
      else if (e.clientY > r.bottom - 40) (scrolls ? box : window).scrollBy(0, 14);
      let over: string | null = null;
      let after = false;
      for (const el of box.querySelectorAll<HTMLElement>('[data-id]')) {
        const b = el.getBoundingClientRect();
        if (e.clientY >= b.top && e.clientY < b.bottom) {
          const target = rows.find((x) => x.id === el.dataset.id);
          // Only within the same item type.
          if (target && target.id !== p.id && target.item_type === p.item_type) {
            over = target.id;
            after = e.clientY > b.top + b.height / 2;
          }
          break;
        }
      }
      if (over !== drag.over || after !== drag.after) setDrag({ id: p.id, over, after });
    },
    onPointerUp: () => {
      if (drag?.over) onMoveRow!(drag.id, drag.over, drag.after);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        keyMove(p, e.key === 'ArrowUp' ? -1 : 1);
      }
    },
  });

  /** Class names for an item while dragging: the one being moved, and the one it would land next to. */
  const itemClass = (id: string) =>
    [drag?.id === id && 'is-dragged', drag?.over === id && (drag.after ? 'drop-below' : 'drop-above')].filter(Boolean).join(' ');

  return { drag, canDrag, gripProps, itemClass };
}
