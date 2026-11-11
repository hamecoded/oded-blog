import { useState, type ReactNode } from 'react';
import { Mail, Phone, Plus, Send, X } from 'lucide-react';
import type { Lang, TodoComment, TodoContact, TodoDatum, TodoLogEntry, TodoStatus, TodoType } from '../../lib/types';
import { TODO_TYPES } from '../../lib/util';
import { STATUS_ICON, TYPE_ICON } from './look';
import { SIDE_STATES, STAGES } from './model';
import { useTt, type TKey } from './strings';

/**
 * The stage a task is at, as a road: discovered → researched → defined → in progress → completed, each stop a
 * button, the stops behind the current one lit. Blocked, on hold and quit sit apart as side exits.
 */
export function StageTrack({ value, onChange }: { value: TodoStatus; onChange: (s: TodoStatus) => void }) {
  const tt = useTt();
  const at = STAGES.indexOf(value);
  const side = SIDE_STATES.includes(value);
  return (
    <div className="todo-stage">
      <ol className={`todo-stage-road${side ? ' is-off' : ''}`} role="radiogroup" aria-label={tt('status')}>
        {STAGES.map((s, i) => {
          const Icon = STATUS_ICON[s];
          return (
            <li key={s} className={`st-${s}${i < at ? ' passed' : ''}${i === at ? ' on' : ''}`}>
              <button type="button" role="radio" aria-checked={i === at} onClick={() => onChange(s)} title={tt(`st_${s}`)}>
                <span className="dot">
                  <Icon size={16} strokeWidth={2.4} />
                </span>
                <span className="lbl">{tt(`st_${s}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="todo-stage-side" role="radiogroup" aria-label={tt('pauses')}>
        {SIDE_STATES.map((s) => {
          const Icon = STATUS_ICON[s];
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={value === s}
              className={`chip sm st-${s}${value === s ? ' on' : ''}`}
              onClick={() => onChange(value === s ? 'defined' : s)}
            >
              <Icon size={14} /> {tt(`st_${s}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The eight kinds of task as a row of tiles to pick from (scrolls sideways on phones). */
export function TypePicker({ value, onChange }: { value: TodoType; onChange: (t: TodoType) => void }) {
  const tt = useTt();
  return (
    <div className="todo-types" role="radiogroup" aria-label={tt('type')}>
      {TODO_TYPES.map((ty) => {
        const Icon = TYPE_ICON[ty];
        return (
          <button
            key={ty}
            type="button"
            role="radio"
            aria-checked={value === ty}
            className={`ty-${ty}${value === ty ? ' on' : ''}`}
            onClick={() => onChange(ty)}
            title={tt(`tyHint_${ty}`)}
          >
            <Icon size={18} aria-hidden />
            <span>{tt(`ty_${ty}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Tags or list names as removable chips, with a field that adds one on Enter or comma (suggesting those in use). */
export function LabelField({
  label,
  values,
  onChange,
  suggest,
  prefix,
  placeholder,
  hint,
}: {
  /** One line under the field saying what it's for. */
  hint?: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggest: string[];
  prefix: string;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  /** The highlighted suggestion while typing (-1: none, Enter adds the typed text). */
  const [active, setActive] = useState(-1);
  const id = `todo-sug-${prefix === '#' ? 'tags' : 'lists'}`;
  const add = (raw: string) => {
    const v = raw.replace(/^[#@]+/, '').trim();
    setText('');
    setActive(-1);
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
  };
  const unused = suggest.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
  const free = unused.slice(0, 8);
  // While typing: the names in use that contain what's typed, in the app's own dropdown (not the browser's).
  const typed = text.replace(/^[#@]+/, '').trim().toLowerCase();
  const matches = typed ? unused.filter((s) => s.toLowerCase().includes(typed)).slice(0, 6) : [];
  return (
    <div className="todo-labels">
      <span className="todo-field-l">{label}</span>
      <div className="todo-labels-box">
        {values.map((v) => (
          <span key={v} className="todo-label-chip" dir="auto">
            {prefix}
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`× ${v}`}>
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          value={text}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            setActive(-1);
            if (/[,\n]$/.test(v)) add(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && matches.length) {
              e.preventDefault();
              const n = matches.length;
              setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
            } else if (e.key === 'Escape' && matches.length) {
              e.preventDefault();
              e.stopPropagation(); // clear the suggestions, don't close the sheet
              setText('');
            } else if (e.key === 'Enter') {
              e.preventDefault();
              add(active >= 0 && matches[active] ? matches[active] : text);
            } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={placeholder}
          aria-label={placeholder}
          dir="auto"
          enterKeyHint="enter"
        />
        {matches.length > 0 && (
          <ul className="todo-ac" role="listbox" id={id}>
            {matches.map((s, i) => (
              <li key={s} id={`${id}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={i === active ? 'is-active' : undefined}
                  onPointerDown={(e) => e.preventDefault()} // keep focus in the field, so its blur doesn't add the half-typed text
                  onClick={() => add(s)}
                  dir="auto"
                >
                  <span className="muted">{prefix}</span>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && <span className="muted small">{hint}</span>}
      {free.length > 0 && (
        <div className="todo-sugs">
          {free.map((s) => (
            <button key={s} type="button" className="chip sm" onClick={() => add(s)} dir="auto">
              + {prefix}
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A folding section with a count in its heading. */
export function Fold({ title, count, icon, children, open }: { title: string; count: number; icon: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="todo-fold" open={open}>
      <summary>
        {icon}
        <span>{title}</span>
        {count > 0 && <span className="todo-count">{count}</span>}
      </summary>
      <div className="todo-fold-body">{children}</div>
    </details>
  );
}

/** Named values: rows of name + value, edited in place. */
export function DataField({ rows, onChange }: { rows: TodoDatum[]; onChange: (r: TodoDatum[]) => void }) {
  const tt = useTt();
  const set = (i: number, k: keyof TodoDatum, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="todo-data">
      {rows.map((r, i) => (
        <div key={i} className="todo-data-row">
          <input value={r.key} onChange={(e) => set(i, 'key', e.target.value)} placeholder={tt('dataKey')} aria-label={tt('dataKey')} dir="auto" />
          <input value={r.value} onChange={(e) => set(i, 'value', e.target.value)} placeholder={tt('dataValue')} aria-label={tt('dataValue')} dir="auto" />
          <button type="button" className="icon-btn sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={tt('delete')}>
            <X size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        <Plus size={16} /> {tt('addData')}
      </button>
    </div>
  );
}

/** People involved: name, phone, email and a note, with call and mail links. */
export function ContactsField({ rows, onChange }: { rows: TodoContact[]; onChange: (r: TodoContact[]) => void }) {
  const tt = useTt();
  const set = (i: number, k: keyof TodoContact, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="todo-contacts">
      {rows.map((c, i) => (
        <div key={i} className="todo-contact">
          <div className="todo-contact-top">
            <input value={c.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder={tt('contactName')} aria-label={tt('contactName')} dir="auto" />
            {c.phone && (
              <a className="icon-btn sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label={tt('call')} title={tt('call')}>
                <Phone size={16} />
              </a>
            )}
            {c.email && (
              <a className="icon-btn sm" href={`mailto:${c.email}`} aria-label={tt('sendMail')} title={tt('sendMail')}>
                <Mail size={16} />
              </a>
            )}
            <button type="button" className="icon-btn sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={tt('delete')}>
              <X size={16} />
            </button>
          </div>
          <div className="todo-contact-row">
            <input type="tel" value={c.phone} onChange={(e) => set(i, 'phone', e.target.value)} placeholder={tt('phone')} aria-label={tt('phone')} dir="ltr" />
            <input type="email" value={c.email} onChange={(e) => set(i, 'email', e.target.value)} placeholder={tt('email')} aria-label={tt('email')} dir="ltr" />
          </div>
          <input value={c.note} onChange={(e) => set(i, 'note', e.target.value)} placeholder={tt('contactNote')} aria-label={tt('contactNote')} dir="auto" />
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => onChange([...rows, { name: '', phone: '', email: '', note: '' }])}>
        <Plus size={16} /> {tt('addContact')}
      </button>
    </div>
  );
}

const when = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** A message thread: oldest first, a field to add one, × to remove one. */
export function CommentsField({ rows, onChange, lang }: { rows: TodoComment[]; onChange: (r: TodoComment[]) => void; lang: Lang }) {
  const tt = useTt();
  const [text, setText] = useState('');
  const send = () => {
    const v = text.trim();
    if (!v) return;
    onChange([...rows, { at: new Date().toISOString(), text: v }]);
    setText('');
  };
  return (
    <div className="todo-comments">
      {rows.length > 0 && (
        <ul>
          {rows.map((c, i) => (
            <li key={`${c.at}${i}`}>
              <p dir="auto">{c.text}</p>
              <span className="muted small">{when(c.at, lang)}</span>
              <button type="button" className="icon-btn sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={tt('delete')}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="todo-send">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tt('addComment')} aria-label={tt('addComment')} rows={1} dir="auto" />
        <button type="button" className="icon-btn accent" onClick={send} disabled={!text.trim()} aria-label={tt('addComment')}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

/** The task's history, newest first, with a field to log a note of progress ("called them, waiting for a quote"). */
export function LogField({
  rows,
  onChange,
  lang,
  dayName,
}: {
  rows: TodoLogEntry[];
  onChange: (r: TodoLogEntry[]) => void;
  lang: Lang;
  dayName: (iso: string | null) => string;
}) {
  const tt = useTt();
  const [text, setText] = useState('');
  const line = (e: TodoLogEntry): string => {
    if (e.kind === 'created') return tt('log_created');
    if (e.kind === 'note') return e.text ?? '';
    if (e.kind === 'status') {
      const name = (s: string | null | undefined) => (s ? tt(`st_${s}` as TKey) : '–');
      return tt('log_status', { from: name(e.from), to: name(e.to) });
    }
    return tt('log_day', { from: dayName(e.from ?? null), to: dayName(e.to ?? null) });
  };
  const add = () => {
    const v = text.trim();
    if (!v) return;
    onChange([...rows, { at: new Date().toISOString(), kind: 'note', text: v }]);
    setText('');
  };
  return (
    <div className="todo-log">
      <div className="todo-send">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tt('addLog')} aria-label={tt('addLog')} rows={1} dir="auto" />
        <button type="button" className="icon-btn accent" onClick={add} disabled={!text.trim()} aria-label={tt('addLog')}>
          <Plus size={18} />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">{tt('logEmpty')}</p>
      ) : (
        <ol>
          {[...rows].reverse().map((e, i) => (
            <li key={`${e.at}${i}`} className={`k-${e.kind}`}>
              <span className="muted small">{when(e.at, lang)}</span>
              <span dir="auto">{line(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
