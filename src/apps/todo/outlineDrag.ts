import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

/** One drag in progress, as rendering needs it. */
export interface OutlineDrag {
  /** The rows that move with the pointer: the dragged task and what's shown under it. */
  moving: Set<string>;
  dy: number;
  /** The row the drop line is drawn on, and on which side. */
  mark: { id: string; side: 'before' | 'after' } | null;
}

interface Geometry {
  pointer: number;
  id: string;
  /** Pointer y at the start, relative to the list (so scrolling mid-drag is harmless). */
  y0: number;
  centre: number;
  /** The other siblings, each as a block: its own row plus the rows shown under it. */
  others: { id: string; mid: number; lastId: string }[];
  from: number;
  list: HTMLElement;
}

const levelOf = (li: Element) => Number(getComputedStyle(li).getPropertyValue('--lvl')) || 0;

/**
 * Dragging a task among its siblings in an outline (the pool): rows carry `data-id` and a `--lvl` level, and a
 * task's block is its row plus the deeper rows right after it. `siblingsOf(id)` gives the ids of the shown tasks
 * with the same parent, in order; `onMove(id, place)` is called with the sibling it now goes before or after.
 */
export type Place = { before: string } | { after: string };

export function useOutlineDrag(siblingsOf: (id: string) => string[], onMove: (id: string, place: Place) => void) {
  const geo = useRef<Geometry | null>(null);
  const [drag, setDrag] = useState<OutlineDrag | null>(null);

  const blockOf = (rows: Element[], i: number) => {
    const lvl = levelOf(rows[i]);
    let j = i;
    while (j + 1 < rows.length && levelOf(rows[j + 1]) > lvl) j++;
    return rows.slice(i, j + 1);
  };

  const begin = (e: PointerEvent<HTMLElement>, id: string) => {
    const list = e.currentTarget.closest('ul, ol') as HTMLElement | null;
    if (e.button !== 0 || !list) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rows = [...list.children];
    const index = (rid: string) => rows.findIndex((r) => (r as HTMLElement).dataset.id === rid);
    const top = list.getBoundingClientRect().top;
    const mid = (els: Element[]) => {
      const a = els[0].getBoundingClientRect();
      const b = els[els.length - 1].getBoundingClientRect();
      return (a.top + b.bottom) / 2 - top;
    };
    const sibs = siblingsOf(id).filter((s) => index(s) >= 0);
    if (sibs.length < 2) return;
    const mine = blockOf(rows, index(id));
    const others = sibs
      .filter((s) => s !== id && index(s) >= 0)
      .map((s) => {
        const block = blockOf(rows, index(s));
        return { id: s, mid: mid(block), lastId: (block[block.length - 1] as HTMLElement).dataset.id! };
      });
    geo.current = { pointer: e.pointerId, id, y0: e.clientY - top, centre: mid(mine), others, from: sibs.indexOf(id), list };
    setDrag({ moving: new Set(mine.map((r) => (r as HTMLElement).dataset.id!)), dy: 0, mark: null });
  };

  const target = (g: Geometry, dy: number) => g.others.filter((o) => o.mid < g.centre + dy).length;

  const move = (e: PointerEvent<HTMLElement>) => {
    const g = geo.current;
    if (!g || g.pointer !== e.pointerId) return;
    // Near the top (under the sticky bar) or bottom (over the tab bar) of the window, scroll along.
    if (e.clientY < 170) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 110) window.scrollBy(0, 12);
    const dy = e.clientY - g.list.getBoundingClientRect().top - g.y0;
    const to = target(g, dy);
    const mark: OutlineDrag['mark'] =
      to === g.from ? null : to < g.others.length ? { id: g.others[to].id, side: 'before' } : { id: g.others[to - 1].lastId, side: 'after' };
    setDrag((d) => (d ? { ...d, dy, mark } : d));
  };

  const end = (drop: boolean) => {
    const g = geo.current;
    const d = drag;
    geo.current = null;
    setDrag(null);
    if (drop && g && d) {
      const to = target(g, d.dy);
      if (to !== g.from) onMove(g.id, to < g.others.length ? { before: g.others[to].id } : { after: g.others[to - 1].id });
    }
  };

  /** Props for a task's grip button. */
  const grip = (id: string) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => begin(e, id),
    onPointerMove: move,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const sibs = siblingsOf(id);
      const i = sibs.indexOf(id);
      const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
      if (to < 0 || to >= sibs.length) return;
      e.preventDefault();
      onMove(id, to < i ? { before: sibs[to] } : { after: sibs[to] });
    },
  });

  /** Class and style for a row while something is dragged. */
  const rowLook = (id: string): { className?: string; rowStyle?: CSSProperties } => {
    if (!drag) return {};
    if (drag.moving.has(id)) return { className: 'is-dragging', rowStyle: { transform: `translateY(${drag.dy}px)` } };
    if (drag.mark?.id === id) return { className: `drop-${drag.mark.side}` };
    return {};
  };

  return { dragging: !!drag, grip, rowLook };
}
