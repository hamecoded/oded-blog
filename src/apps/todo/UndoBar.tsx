import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Undo2, X } from 'lucide-react';
import { useTt } from './strings';

const SHOW_MS = 5000;

/** Shows a manual popover as soon as it's in the page (each time it's mounted in a new place). */
const showOnMount = (node: HTMLDivElement | null) => {
  try {
    if (node && !node.matches(':popover-open')) node.showPopover?.();
  } catch {
    /* no popover support: it's still shown as a fixed bar */
  }
};

/**
 * "Done: …  [Undo]" for a few seconds after a task is completed (or quit), in case it was a slip. A draining bar
 * shows the time left; Undo puts the task back as it was. It's a manual popover (top layer, above everything),
 * and while a task sheet is open it's placed inside that sheet's dialog: a modal dialog makes everything outside
 * it inert, so a bar outside couldn't be tapped.
 */
export function UndoBar({ undo, onUndo, onClose }: { undo: { key: number; text: string } | null; onUndo: () => void; onClose: () => void }) {
  const tt = useTt();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => close.current(), SHOW_MS);
    return () => clearTimeout(t);
  }, [undo]);

  if (!undo) return null;
  const bar = (
    <div ref={showOnMount} popover="manual" className="todo-undo" role="status" key={undo.key}>
      <span className="todo-undo-txt" dir="auto">
        {undo.text}
      </span>
      <button type="button" className="todo-undo-btn" onClick={onUndo}>
        <Undo2 size={16} aria-hidden /> {tt('undo')}
      </button>
      <button type="button" className="todo-undo-x" onClick={onClose} aria-label={tt('closeIt')}>
        <X size={16} />
      </button>
      <span className="todo-undo-time" style={{ animationDuration: `${SHOW_MS}ms` }} aria-hidden />
    </div>
  );
  const sheet = typeof document !== 'undefined' ? document.querySelector('.todo dialog[open]') : null;
  return sheet ? createPortal(bar, sheet) : bar;
}
