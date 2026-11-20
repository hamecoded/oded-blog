import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpFromLine, CalendarDays, CalendarPlus, Lightbulb, ListChecks, Plus, Sparkles, Trash2, Users, X } from 'lucide-react';
import type { Lang, Todo, TodoContact, TodoEvent, TodoEventDraft, TodoEventTip } from '../../lib/types';
import { uid } from '../../lib/util';
import { ContactsField } from './fields';
import { dayLabel, daysBetween, isOpen, sameContacts } from './model';
import { useTt } from './strings';

/** The date as a calendar leaf: month above, day below. */
function DateLeaf({ date, lang }: { date: string | null; lang: Lang }) {
  if (!date) {
    return (
      <span className="todo-ev-leaf is-none" aria-hidden>
        <CalendarDays size={22} />
      </span>
    );
  }
  const d = new Date(`${date}T12:00:00`);
  const loc = lang === 'he' ? 'he-IL' : 'en-GB';
  return (
    <span className="todo-ev-leaf" aria-hidden>
      <span className="m">{new Intl.DateTimeFormat(loc, { month: 'short' }).format(d)}</span>
      <span className="d">{d.getDate()}</span>
    </span>
  );
}

/** "In 5 days" / "Tomorrow" / "3 days ago", or the date further out. */
function useWhen(today: string, lang: Lang) {
  const tt = useTt();
  return (date: string | null) => {
    if (!date) return tt('eventsNoDate');
    const n = daysBetween(today, date);
    if (Math.abs(n) <= 1) return dayLabel(date, today, lang, tt);
    if (n > 1 && n <= 60) return tt('eventIn', { n });
    if (n < -1 && n >= -60) return tt('eventAgo', { n: -n });
    return dayLabel(date, today, lang, tt);
  };
}

/**
 * The Events tab's list: a form to add an event (a name and an optional date), then the events sorted by date:
 * coming up (soonest first), not dated yet, and past (latest first).
 */
export function EventsList({
  events,
  all,
  today,
  lang,
  uiDir,
  onOpen,
  onCreate,
}: {
  events: TodoEvent[];
  all: Todo[];
  today: string;
  lang: Lang;
  uiDir: 'rtl' | 'ltr';
  onOpen: (id: string) => void;
  onCreate: (d: TodoEventDraft) => void;
}) {
  const tt = useTt();
  const when = useWhen(today, lang);
  const soon = events.filter((e) => e.date && e.date >= today).sort((a, b) => a.date!.localeCompare(b.date!) || a.position - b.position);
  const undated = events.filter((e) => !e.date).sort((a, b) => a.position - b.position);
  const past = events.filter((e) => e.date && e.date < today).sort((a, b) => b.date!.localeCompare(a.date!));

  const card = (e: TodoEvent) => {
    const tasks = all.filter((t) => t.event_id === e.id && t.status !== 'quit');
    const done = tasks.filter((t) => !isOpen(t)).length;
    const openItems = e.items.filter((i) => !i.done).length;
    const n = e.date ? daysBetween(today, e.date) : null;
    return (
      <li key={e.id}>
        <button
          type="button"
          className={`todo-ev-card${n !== null && n < 0 ? ' is-past' : ''}${n !== null && n >= 0 && n <= 7 ? ' is-near' : ''}`}
          style={{ '--p': tasks.length ? done / tasks.length : 0 } as CSSProperties}
          onClick={() => onOpen(e.id)}
        >
          <DateLeaf date={e.date} lang={lang} />
          <span className="todo-ev-txt">
            <strong dir="auto">{e.title || tt('untitled')}</strong>
            <span className="todo-ev-when">{when(e.date)}</span>
            <span className="todo-ev-counts">
              {tasks.length > 0 && (
                <span>
                  <ListChecks size={13} aria-hidden /> {done}/{tasks.length}
                </span>
              )}
              {openItems > 0 && <span>{tt('nItems', { n: openItems })}</span>}
              {e.tips.length > 0 && (
                <span>
                  <Lightbulb size={13} aria-hidden /> {e.tips.length}
                </span>
              )}
              {e.contacts.length > 0 && (
                <span>
                  <Users size={13} aria-hidden /> {e.contacts.length}
                </span>
              )}
            </span>
            {tasks.length > 0 && <span className="todo-ev-bar" aria-hidden />}
          </span>
        </button>
      </li>
    );
  };
  const section = (title: string, list: TodoEvent[]) =>
    list.length > 0 && (
      <section className="todo-group">
        <h2 className="todo-group-h">
          {title} <span className="muted">{list.length}</span>
        </h2>
        <ul className="todo-ev-list">{list.map(card)}</ul>
      </section>
    );

  return (
    <>
      <form
        className="todo-newquest todo-ev-new"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const title = String(f.get('title') ?? '').trim();
          if (!title) return;
          onCreate({ title, date: String(f.get('date') ?? '') || null });
          e.currentTarget.reset();
        }}
      >
        <CalendarPlus size={18} aria-hidden />
        <input name="title" placeholder={tt('eventNew')} aria-label={tt('eventNew')} dir={uiDir} enterKeyHint="go" maxLength={300} />
        <input name="date" type="date" aria-label={tt('eventDate')} className="todo-ev-date-in" />
        <button type="submit" className="btn primary sm">
          {tt('eventAdd')}
        </button>
      </form>
      {events.length === 0 ? (
        <div className="todo-blank">
          <CalendarDays size={40} strokeWidth={1.5} aria-hidden />
          <p>{tt('eventsEmpty')}</p>
        </div>
      ) : (
        <>
          {section(tt('eventsSoon'), soon)}
          {section(tt('eventsNoDate'), undated)}
          {section(tt('eventsPast'), past)}
        </>
      )}
    </>
  );
}

/** The heading row of an open event, above the game bar: back, the event's date leaf and name, and when it is. */
export function EventHead({ ev, today, lang, back }: { ev: TodoEvent; today: string; lang: Lang; back: ReactNode }) {
  const tt = useTt();
  const when = useWhen(today, lang);
  return (
    <div className="todo-quest-head todo-ev-head">
      {back}
      <DateLeaf date={ev.date} lang={lang} />
      <h2 className="todo-label-title" dir="auto">
        {ev.title || tt('untitled')}
      </h2>
      <span className="muted small">{when(ev.date)}</span>
    </div>
  );
}

/**
 * One event's page: its details (name, date, description), items that aren't tasks yet (tick them off, or make one
 * a task, which then goes to the pool), the tasks already for it, tips, and the people involved.
 */
export function EventPage({
  ev,
  tasks,
  lang,
  uiDir,
  onSave,
  onDelete,
  onPromote,
  onNewTask,
}: {
  ev: TodoEvent;
  /** Its tasks, drawn by the app (rows with their own actions). */
  tasks: ReactNode;
  lang: Lang;
  uiDir: 'rtl' | 'ltr';
  onSave: (patch: TodoEventDraft) => void;
  onDelete: () => void;
  onPromote: (itemId: string) => void;
  onNewTask: () => void;
}) {
  const tt = useTt();
  // Fields edited here are saved when they're left (not on every key); refilled when another event opens.
  const [shownFor, setShownFor] = useState(ev.id);
  const [title, setTitle] = useState(ev.title);
  const [description, setDescription] = useState(ev.description);
  const [contacts, setContacts] = useState<TodoContact[]>(ev.contacts);
  const [sure, setSure] = useState(false);
  /** The kind the next entry in "Insights and tips" is added as. */
  const [newKind, setNewKind] = useState<TodoEventTip['kind']>('tip');
  if (shownFor !== ev.id) {
    setShownFor(ev.id);
    setTitle(ev.title);
    setDescription(ev.description);
    setContacts(ev.contacts);
    setSure(false);
  }
  const now = () => new Date().toISOString();
  const addLine = (e: React.FormEvent<HTMLFormElement>, kind: 'items' | 'tips') => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('text') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (kind === 'items') onSave({ items: [...ev.items, { id: uid(), text, done: false, at: now() }] });
    else onSave({ tips: [...ev.tips, { id: uid(), kind: newKind, text, at: now() }] });
  };

  return (
    <div className="todo-ev-page" dir={uiDir}>
      <section className="todo-sec todo-ev-details">
        <input
          className="todo-ev-title-in"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== ev.title && onSave({ title: title.trim() || ev.title })}
          aria-label={tt('title')}
          dir="auto"
        />
        <label className="todo-ev-date-row">
          <CalendarDays size={16} aria-hidden />
          <span>{tt('eventDate')}</span>
          <input type="date" value={ev.date ?? ''} onChange={(e) => onSave({ date: e.target.value || null })} lang={lang} />
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== ev.description && onSave({ description })}
          placeholder={tt('description')}
          aria-label={tt('description')}
          rows={2}
          dir="auto"
        />
      </section>

      <section className="todo-sec todo-ev-sec">
        <h3>
          <ListChecks size={17} aria-hidden /> {tt('eventItems')}
        </h3>
        <p className="muted small">{tt('eventItemsHint')}</p>
        {ev.items.length > 0 && (
          <ul className="todo-ev-items">
            {ev.items.map((it) => (
              <li key={it.id} className={it.done ? 'is-done' : undefined}>
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={() => onSave({ items: ev.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) })}
                  aria-label={it.text}
                />
                <span dir="auto">{it.text}</span>
                {!it.done && (
                  <button type="button" className="todo-ev-promote" onClick={() => onPromote(it.id)} data-tip={tt('eventPromote')}>
                    <ArrowUpFromLine size={14} aria-hidden /> {tt('eventPromote')}
                  </button>
                )}
                <button type="button" className="icon-btn sm" onClick={() => onSave({ items: ev.items.filter((x) => x.id !== it.id) })} aria-label={tt('delete')}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="todo-ev-addline" onSubmit={(e) => addLine(e, 'items')}>
          <input name="text" placeholder={tt('eventItemAdd')} aria-label={tt('eventItemAdd')} dir={uiDir} enterKeyHint="done" maxLength={300} />
          <button type="submit" className="icon-btn sm" aria-label={tt('eventItemAdd')}>
            <Plus size={18} />
          </button>
        </form>
      </section>

      <section className="todo-sec todo-ev-sec">
        <h3>
          <ListChecks size={17} aria-hidden /> {tt('eventTasks')}
        </h3>
        <p className="muted small">{tt('eventTasksHint')}</p>
        {tasks}
        <button type="button" className="btn ghost sm todo-ev-newtask" onClick={onNewTask}>
          <Plus size={16} aria-hidden /> {tt('eventNewTask')}
        </button>
      </section>

      <section className="todo-sec todo-ev-sec">
        <h3>
          <Lightbulb size={17} aria-hidden /> {tt('eventTips')}
        </h3>
        {ev.tips.length > 0 && (
          <ul className="todo-ev-tips">
            {ev.tips.map((tip) => (
              <li key={tip.id} className={`is-${tip.kind}`}>
                {/* Its kind's icon; tapping it switches between tip and insight. */}
                <button
                  type="button"
                  className="todo-ev-kind"
                  onClick={() => onSave({ tips: ev.tips.map((x) => (x.id === tip.id ? { ...x, kind: x.kind === 'tip' ? 'insight' : 'tip' } : x)) })}
                  aria-label={tt('kindSwitch', { kind: tt(`kind_${tip.kind}`) })}
                  data-tip={tt('kindSwitch', { kind: tt(`kind_${tip.kind}`) })}
                >
                  {tip.kind === 'insight' ? <Sparkles size={15} aria-hidden /> : <Lightbulb size={15} aria-hidden />}
                  <span>{tt(`kind_${tip.kind}`)}</span>
                </button>
                <span dir="auto">{tip.text}</span>
                <button type="button" className="icon-btn sm" onClick={() => onSave({ tips: ev.tips.filter((x) => x.id !== tip.id) })} aria-label={tt('delete')}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="todo-ev-addline" onSubmit={(e) => addLine(e, 'tips')}>
          <span className="todo-ev-kinds" role="radiogroup" aria-label={tt('eventTips')}>
            {(['tip', 'insight'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={newKind === k} className={`is-${k}${newKind === k ? ' on' : ''}`} onClick={() => setNewKind(k)}>
                {k === 'insight' ? <Sparkles size={15} aria-hidden /> : <Lightbulb size={15} aria-hidden />}
                {tt(`kind_${k}`)}
              </button>
            ))}
          </span>
          <input
            name="text"
            placeholder={tt(newKind === 'insight' ? 'eventInsightAdd' : 'eventTipAdd')}
            aria-label={tt(newKind === 'insight' ? 'eventInsightAdd' : 'eventTipAdd')}
            dir={uiDir}
            enterKeyHint="done"
            maxLength={2000}
          />
          <button type="submit" className="icon-btn sm" aria-label={tt(newKind === 'insight' ? 'eventInsightAdd' : 'eventTipAdd')}>
            <Plus size={18} />
          </button>
        </form>
      </section>

      <section
        className="todo-sec todo-ev-sec"
        onBlur={(e) => {
          // Saved when focus leaves the contacts, not on every key.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !sameContacts(contacts, ev.contacts)) onSave({ contacts });
        }}
      >
        <h3>
          <Users size={17} aria-hidden /> {tt('contactsTitle')}
        </h3>
        <ContactsField
          key={ev.id}
          jobTitle={ev.title}
          dirty={!sameContacts(contacts, ev.contacts)}
          onSave={() => onSave({ contacts })}
          rows={contacts}
          onChange={(r) => {
            setContacts(r);
            // Adding or removing a row is saved right away; typing waits for the blur above.
            if (r.length !== contacts.length) onSave({ contacts: r });
          }}
        />
      </section>

      <button type="button" className={`btn ghost danger sm todo-ev-delete${sure ? ' is-sure' : ''}`} onClick={() => (sure ? onDelete() : setSure(true))}>
        <Trash2 size={16} aria-hidden /> {sure ? `${tt('sure')} ${tt('eventDelete')}` : tt('eventDelete')}
      </button>
    </div>
  );
}
