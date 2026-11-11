import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface MenuOption {
  value: string;
  label: string;
  /** Indent (an outline of tasks: purpose → step → action). */
  level?: number;
  icon?: ReactNode;
  /** A muted second line or tag after the label. */
  note?: string;
}

/**
 * A full-width dropdown field in the app's style, for the task form (what a task waits for, what it's part of).
 * Opens a card under the field; with more than a handful of choices it has a search box. Arrow keys move,
 * Enter picks, Escape or a tap outside closes. `value` null shows the placeholder.
 */
export function SelectMenu({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  empty,
}: {
  label: string;
  value: string | null;
  options: MenuOption[];
  onChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  /** Shown when the search matches nothing. */
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);
  const searchable = options.length > 6;
  const shown = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    const t = setTimeout(() => {
      const el = box.current?.querySelector<HTMLElement>(searchable ? '.todo-menu-search input' : '[aria-selected="true"], [role="option"]');
      el?.focus();
      box.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      // Bring the whole card into view (clear of the sheet's sticky footer, via its scroll-margin).
      box.current?.querySelector('.todo-menu-card')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
    return () => {
      document.removeEventListener('pointerdown', away);
      clearTimeout(t);
    };
  }, [open, searchable]);

  const toggle = () => {
    setQ('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen((o) => !o);
  };
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    box.current?.querySelector<HTMLElement>('.todo-menu-btn')?.focus();
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the menu, not the sheet
      setOpen(false);
      box.current?.querySelector<HTMLElement>('.todo-menu-btn')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = shown.length;
      if (!n) return;
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && shown[active]) {
      e.preventDefault();
      pick(shown[active].value);
    }
  };

  return (
    <div className={`todo-menu${open ? ' is-open' : ''}`} ref={box} onKeyDown={open ? keys : undefined}>
      <button type="button" className="todo-menu-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={label} onClick={toggle}>
        {current?.icon}
        <span className={`todo-menu-val${current ? '' : ' is-empty'}`}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown size={16} aria-hidden className="todo-picker-chev" />
      </button>
      {open && (
        <div className="todo-menu-card">
          {searchable && (
            <label className="todo-menu-search">
              <Search size={15} aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={id}
                dir="auto"
              />
            </label>
          )}
          <ul className="todo-menu-list" role="listbox" id={id} aria-label={label} ref={list}>
            {shown.length === 0 && (
              <li className="todo-menu-empty" role="presentation">
                {empty}
              </li>
            )}
            {shown.map((o, i) => (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`${o.value === value ? 'on' : ''}${i === active ? ' is-active' : ''}`}
                  style={{ paddingInlineStart: 10 + (q ? 0 : (o.level ?? 0) * 16) }}
                  onClick={() => pick(o.value)}
                  onPointerMove={() => setActive(i)}
                  tabIndex={searchable ? -1 : 0}
                >
                  {o.icon}
                  <span className="todo-menu-l">{o.label}</span>
                  {o.note && <span className="todo-menu-note">{o.note}</span>}
                  {o.value === value && <Check size={16} aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
