import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, History, Plus } from 'lucide-react';
import type { FieldKind } from './fields';
import { parseMoney } from './fields';
import { usePt } from './strings';

/**
 * A table cell that shows its value and turns into an input when clicked (or focused and Enter pressed).
 * Enter or leaving the cell saves; Escape cancels. `raw` is what the input starts with, `shown` what's displayed.
 * With `options`, the input is a combo box: type anything, or pick one of the values used before.
 * `onPick` sees clicks first: when it returns true (a ⌘/Ctrl/Shift-click that selects cells), the cell doesn't open.
 */
export function Cell({
  raw,
  shown,
  kind,
  onSave,
  options,
  autoEdit,
  label,
  ltr,
  onPick,
  picked,
}: {
  raw: string;
  shown?: string;
  kind: Exclude<FieldKind, 'image'>;
  onSave: (value: string | number | null) => void;
  /** Earlier values to pick from (a dropdown under the input); typing something new is fine too. */
  options?: string[];
  autoEdit?: boolean;
  /** Column name, for screen readers. */
  label: string;
  ltr?: boolean;
  onPick?: (e: MouseEvent) => boolean;
  /** Part of a multi-cell selection. */
  picked?: boolean;
}) {
  const [editing, setEditing] = useState(!!autoEdit);
  // An edit ends once: Enter, a picked option and the blur that follows must not save twice.
  const ended = useRef(false);
  const numeric = kind === 'number' || kind === 'money';

  const open = () => {
    ended.current = false;
    setEditing(true);
  };
  const cancel = () => {
    ended.current = true;
    setEditing(false);
  };
  const commit = (text: string) => {
    if (ended.current) return;
    ended.current = true;
    setEditing(false);
    let next: string | number | null = text.trim();
    if (numeric) next = next === '' ? null : parseMoney(next);
    else if (kind === 'date') next = next || null;
    const before = numeric ? (raw === '' ? null : Number(raw)) : kind === 'date' ? raw || null : raw;
    // In a multi-cell selection the value goes to every picked cell, even where this one already has it.
    if (next !== before || picked) onSave(next);
  };

  if (editing && options) {
    return <Combo raw={raw} options={options} label={label} onDone={(text) => (text === null ? cancel() : commit(text))} />;
  }

  if (editing) {
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && !(kind === 'long' && e.shiftKey)) {
        e.preventDefault();
        commit(e.currentTarget.value);
      }
    };
    if (kind === 'long') {
      return (
        <textarea
          className="pc-input"
          defaultValue={raw}
          autoFocus
          rows={3}
          dir="auto"
          aria-label={label}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      );
    }
    return (
      <input
        className={`pc-input${numeric ? ' num' : ''}`}
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        defaultValue={raw}
        autoFocus
        dir={numeric || kind === 'date' || ltr ? 'ltr' : 'auto'}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
    );
  }

  const text = shown ?? raw;
  return (
    <button
      type="button"
      className={`pc-cell${numeric ? ' num' : ''}${kind === 'long' ? ' long' : ''}${text ? '' : ' blank'}`}
      onClick={(e) => {
        if (onPick?.(e)) return;
        open();
      }}
      aria-label={`${label}: ${text}`}
      aria-pressed={picked || undefined}
      title={kind === 'long' && text ? text : undefined}
    >
      {/* Money is formatted for the interface language ("₪ 60" in Hebrew), so it keeps the page's direction. */}
      <span dir={kind === 'number' ? 'ltr' : kind === 'money' ? undefined : 'auto'}>{text}</span>
    </button>
  );
}

/**
 * Free text with a dropdown of earlier values, filtered by what's typed. It's drawn as a floating card (labelled,
 * accent border, shadow), not as more table rows, and what's typed is offered first as "Use …". Arrow keys move,
 * Enter takes the highlighted choice, Escape cancels. Rendered outside the table (into the page, or the dialog the
 * table is in) and fixed-positioned: pinned columns are layers of their own that would otherwise paint over it, and
 * the table's scrolling box would clip it. It follows the input when the page or table scrolls.
 */
function Combo({
  raw,
  options,
  label,
  onDone,
}: {
  raw: string;
  options: string[];
  label: string;
  /** The chosen text, or null to cancel. */
  onDone: (text: string | null) => void;
}) {
  const pt = usePt();
  const [text, setText] = useState(raw);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  /** Where the card is drawn: the open dialog the table sits in (dialogs are a layer above the page), or the page. */
  const [host, setHost] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const typed = text.trim();
  const q = typed.toLowerCase();
  // Until something is typed, show every earlier value; then only the ones that match.
  const matches = (text === raw ? options : options.filter((o) => o.toLowerCase().includes(q))).filter((o) => o !== text).slice(0, 50);
  const offerTyped = typed !== '' && typed !== raw && !options.some((o) => o === typed);
  const choices = [...(offerTyped ? [typed] : []), ...matches];

  const place = () => {
    const el = input.current;
    if (!el) return;
    const container = el.closest('dialog') ?? document.body;
    if (container !== host) setHost(container);
    const r = el.getBoundingClientRect();
    // The visible part of the page around the input: the table's scrolling box, below the sticky site header
    // and the table's own header row. When the input has scrolled out of it, the card hides rather than float
    // over the toolbar or the header; it comes back when the input does.
    const box = el.closest('.pt-wrap')?.getBoundingClientRect();
    const siteBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const headBottom = el.closest('.pt-wrap')?.querySelector('thead')?.getBoundingClientRect().bottom ?? 0;
    const top = Math.max(siteBottom, headBottom, box?.top ?? 0);
    const bottom = Math.min(window.innerHeight, box?.bottom ?? window.innerHeight);
    const left = Math.max(0, box?.left ?? 0);
    const right = Math.min(window.innerWidth, box?.right ?? window.innerWidth);
    if (r.bottom <= top + 4 || r.top >= bottom - 4 || r.right <= left + 4 || r.left >= right - 4) {
      setPos(null);
      return;
    }
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - siteBottom - 12;
    const up = spaceBelow < 240 && spaceAbove > spaceBelow;
    setPos({
      position: 'fixed',
      ...(getComputedStyle(el).direction === 'rtl' ? { right: window.innerWidth - r.right } : { left: r.left }),
      minWidth: Math.max(r.width, 220),
      ...(up ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }),
      // The list scrolls inside the card, so the card never runs off the screen or under the site header.
      ['--pc-avail' as string]: `${Math.max(120, (up ? spaceAbove : spaceBelow) - 50)}px`,
    });
  };

  // Keep the card next to the input while anything scrolls. Also measure again on the next frame: focusing the
  // input can scroll it into view, and a measurement taken at focus time would be stale.
  useEffect(() => {
    const frame = requestAnimationFrame(() => place());
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // Set up once per open dropdown; place() reads the input's position fresh every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pc-combo">
      <input
        ref={input}
        className="pc-input"
        value={text}
        autoFocus
        dir="auto"
        role="combobox"
        aria-label={label}
        aria-expanded={choices.length > 0}
        aria-autocomplete="list"
        onFocus={(e) => {
          e.currentTarget.select();
          place();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setActive(-1);
          place();
        }}
        onBlur={() => onDone(text)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = choices.length;
            if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onDone(active >= 0 ? choices[active] : text);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onDone(null);
          }
        }}
      />
      {pos &&
        host &&
        choices.length > 0 &&
        createPortal(
        <div className="pc-options" style={pos}>
          <div className="pc-options-head" aria-hidden>
            <History size={13} /> {pt('comboHead')}
          </div>
          <ul role="listbox" aria-label={label}>
            {choices.map((o, i) => {
              const isTyped = offerTyped && i === 0;
              return (
                <li
                  key={(isTyped ? '+' : '') + o}
                  role="option"
                  aria-selected={i === active}
                  className={`${i === active ? 'active' : ''}${isTyped ? ' typed' : ''}`}
                  dir="auto"
                  // Keep focus in the input on press (so its blur doesn't save first), then choose on click, so the
                  // click can't fall through to the table cell under the card once it closes.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onDone(o)}
                >
                  {isTyped ? <Plus size={14} aria-hidden /> : <CornerDownLeft size={14} aria-hidden />}
                  <span>{isTyped ? pt('comboUse', { value: o }) : o}</span>
                </li>
              );
            })}
          </ul>
        </div>,
          host,
        )}
    </div>
  );
}
