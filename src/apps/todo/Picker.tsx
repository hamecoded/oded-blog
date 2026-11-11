import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * A small dropdown in the app's own style (a chip that opens a card of choices), used for sorting and grouping
 * instead of the browser's native select. Escape or a tap outside closes it; arrow keys move between choices.
 */
export function Picker<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  /** What it chooses ("Sort"), for screen readers and as the menu's heading. */
  label: string;
  icon: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    // Focus the chosen option once the menu shows.
    const t = setTimeout(() => list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(), 0);
    return () => {
      document.removeEventListener('pointerdown', away);
      clearTimeout(t);
    };
  }, [open]);

  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
    box.current?.querySelector<HTMLElement>('.todo-picker-btn')?.focus();
  };

  return (
    <div
      className={`todo-picker${open ? ' is-open' : ''}`}
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          box.current?.querySelector<HTMLElement>('.todo-picker-btn')?.focus();
        }
      }}
    >
      <button
        type="button"
        className="todo-picker-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span className="todo-picker-val">{current.label}</span>
        <ChevronDown size={14} aria-hidden className="todo-picker-chev" />
      </button>
      {open && (
        <ul
          className="todo-picker-menu"
          id={id}
          role="listbox"
          aria-label={label}
          ref={list}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
            const i = items.indexOf(document.activeElement as HTMLElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          <li className="todo-picker-h" role="presentation" aria-hidden>
            {label}
          </li>
          {options.map((o) => (
            <li key={o.value} role="presentation">
              <button type="button" role="option" aria-selected={o.value === value} className={o.value === value ? 'on' : undefined} onClick={() => pick(o.value)}>
                <span>{o.label}</span>
                {o.value === value && <Check size={16} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
