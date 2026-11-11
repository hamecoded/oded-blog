import { useRef, useState, type CSSProperties } from 'react';
import { GripVertical } from 'lucide-react';
import type { Lang, Todo } from '../../lib/types';
import { useTt } from './strings';
import { TaskRow, type Origin } from './TaskRow';

interface Drag {
  from: number;
  /** Where it would land if dropped now. */
  to: number;
  dy: number;
  /** Height of the dragged row plus the gap: how far the others step aside. */
  step: number;
}
interface Start {
  pointer: number;
  /** Pointer y at the start, relative to the list's top (so scrolling the sheet mid-drag doesn't throw it off). */
  y0: number;
  mids: number[];
  /** Height of the dragged row plus the gap: how far the others step aside. */
  step: number;
  from: number;
}

/**
 * A parent's steps (or a step's actions) in their order, rearranged by dragging the grip on each row. The grip
 * also takes ArrowUp / ArrowDown from the keyboard. While dragging, the other rows slide aside to show where it
 * will land, and the sheet scrolls when the pointer nears its top or bottom edge.
 */
export function StepList({
  kids,
  all,
  byId,
  today,
  lang,
  onToggle,
  onOpen,
  onReorder,
}: {
  kids: Todo[];
  all: Todo[];
  byId: Map<string, Todo>;
  today: string;
  lang: Lang;
  onToggle: (t: Todo, from?: Origin) => void;
  onOpen: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const tt = useTt();
  const listRef = useRef<HTMLOListElement>(null);
  const start = useRef<Start | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const relY = (clientY: number) => clientY - (listRef.current?.getBoundingClientRect().top ?? 0);

  const begin = (e: React.PointerEvent<HTMLButtonElement>, from: number) => {
    if (e.button !== 0 || !listRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const top = listRef.current.getBoundingClientRect().top;
    const rows = [...listRef.current.children].map((li) => li.getBoundingClientRect());
    const gap = rows.length > 1 ? rows[1].top - rows[0].bottom : 7;
    start.current = {
      pointer: e.pointerId,
      y0: e.clientY - top,
      mids: rows.map((r) => r.top - top + r.height / 2),
      step: rows[from].height + gap,
      from,
    };
    setDrag({ from, to: from, dy: 0, step: rows[from].height + gap });
  };

  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s || s.pointer !== e.pointerId) return;
    // Near the sheet's edges, scroll it along.
    const scroller = listRef.current?.closest('.sheet-body');
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (e.clientY < r.top + 48) scroller.scrollTop -= 10;
      else if (e.clientY > r.bottom - 48) scroller.scrollTop += 10;
    }
    const dy = relY(e.clientY) - s.y0;
    const centre = s.mids[s.from] + dy;
    const to = s.mids.filter((m, i) => i !== s.from && m < centre).length;
    setDrag({ from: s.from, to, dy, step: s.step });
  };

  const end = (drop: boolean) => {
    const d = drag;
    start.current = null;
    setDrag(null);
    if (drop && d && d.to !== d.from) onReorder(d.from, d.to);
  };

  /** How far row `i` is shifted while another row is dragged over it. */
  const shift = (i: number): number => {
    if (!drag || i === drag.from) return 0;
    const { from, to, step } = drag;
    if (from < to && i > from && i <= to) return -step;
    if (to < from && i >= to && i < from) return step;
    return 0;
  };

  return (
    <ol ref={listRef} className={`todo-list todo-steps${drag ? ' is-sorting' : ''}`}>
      {kids.map((s, i) => {
        const dragging = drag?.from === i;
        const style: CSSProperties = { transform: `translateY(${dragging ? drag.dy : shift(i)}px)` };
        return (
          <TaskRow
            key={s.id}
            task={s}
            all={all}
            byId={byId}
            today={today}
            lang={lang}
            hideRoot
            className={dragging ? 'is-dragging' : undefined}
            rowStyle={drag ? style : undefined}
            onToggle={onToggle}
            onOpen={() => onOpen(s.id)}
            action={
              <button
                type="button"
                className="icon-btn sm todo-grip"
                aria-label={tt('reorderStep', { n: i + 1, m: kids.length })}
                data-tip={tt('tipGrip')}
                onPointerDown={(e) => begin(e, i)}
                onPointerMove={move}
                onPointerUp={() => end(true)}
                onPointerCancel={() => end(false)}
                onLostPointerCapture={() => drag && end(true)}
                onKeyDown={(e) => {
                  const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
                  if (to < 0 || to >= kids.length) return;
                  e.preventDefault();
                  onReorder(i, to);
                }}
              >
                <GripVertical size={18} />
              </button>
            }
          />
        );
      })}
    </ol>
  );
}
