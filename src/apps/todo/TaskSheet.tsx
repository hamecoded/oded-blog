import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  EyeOff,
  SlidersHorizontal,
  CalendarDays,
  CalendarOff,
  ExternalLink,
  FlagOff,
  Link2,
  ListTree,
  Database,
  History,
  Inbox,
  Lock,
  MessageSquare,
  Plus,
  Sun,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { cleanLink } from '../../lib/util';
import type { Lang, Todo, TodoComment, TodoContact, TodoDatum, TodoDraft, TodoEvent, TodoLogEntry, TodoStatus, TodoType } from '../../lib/types';
import { CommentsField, ContactsField, DataField, Fold, LabelField, LogField, StageTrack, TypePicker } from './fields';
import { blockers, childTier, dayLabel, depthOf, descendants, heightOf, hostOf, isGoal, isOpen, levelKeys, sameContacts, tagsIn, nestTasks, SIZES, stepsOf, tierOf, xpFor } from './model';
import { TYPE_ICON, VEIL } from './look';
import { RemindField } from './RemindField';
import { Segmented } from './Segmented';
import { useTt } from './strings';
import { SelectMenu, type MenuOption } from './SelectMenu';
import { DrillBar } from './DrillBar';
import { StepList } from './StepList';
import { type Origin } from './TaskRow';

interface Form {
  title: string;
  description: string;
  type: TodoType;
  status: TodoStatus;
  priority: number;
  urgency: number;
  complexity: number;
  due_date: string | null;
  estimate_date: string | null;
  deadline: string | null;
  remind_on: string | null;
  day: string | null;
  tags: string[];
  link: string;
  event_id: string | null;
  event_only: boolean;
  depends_on: string[];
  data: TodoDatum[];
  contacts: TodoContact[];
  comments: TodoComment[];
  log: TodoLogEntry[];
}

const formOf = (t: TodoDraft): Form => ({
  title: t.title ?? '',
  description: t.description ?? '',
  type: t.type ?? 'achieving',
  status: t.status ?? 'discovered',
  priority: t.priority ?? 0,
  urgency: t.urgency ?? 0,
  complexity: t.complexity ?? 0,
  due_date: t.due_date ?? null,
  estimate_date: t.estimate_date ?? null,
  deadline: t.deadline ?? null,
  remind_on: t.remind_on ?? null,
  day: t.day ?? null,
  tags: t.tags ?? [],
  link: t.link ?? '',
  event_id: t.event_id ?? null,
  event_only: t.event_only ?? false,
  depends_on: t.depends_on ?? [],
  data: t.data ?? [],
  contacts: t.contacts ?? [],
  comments: t.comments ?? [],
  log: t.log ?? [],
});

/** Drops the empty rows a form leaves behind (an added contact never filled in). */
const tidy = (f: Form): Form => ({
  ...f,
  title: f.title.trim(),
  link: f.link.trim(),
  description: f.description.trim(),
  data: f.data.filter((d) => d.key.trim() || d.value.trim()),
  contacts: f.contacts.filter((c) => c.first.trim() || c.last.trim() || c.phone.trim() || c.email.trim()),
});

/** What changed between two forms, as a patch. */
function diff(a: Form, b: Form): Partial<Form> {
  const out: Record<string, unknown> = {};
  (Object.keys(b) as (keyof Form)[]).forEach((k) => {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k];
  });
  return out as Partial<Form>;
}

/**
 * One task, every field (a bottom sheet on phones): title and kind, its stage on the road, where it sits
 * (today, the pool, a reminder), levels, dates, tags, what it waits for, the steps or actions derived
 * from it, and folding sections for data, people, comments and history. Closing it saves what changed; a new
 * task is created only once it has a title.
 */
export function TaskSheet({
  task,
  draft,
  all,
  byId,
  today,
  lang,
  onClose,
  onSave,
  onCreate,
  onDelete,
  onOpen,
  onToggle,
  onAddChild,
  onReorder,
  onMoveUnder,
  onSetGoal,
  onMoved,
  events,
  veil,
  veilEvent,
  onSensitive,
  onPlayQuest,
}: {
  /** The task open in the sheet; null with a draft for a new one, null without a draft when closed. */
  task: Todo | null;
  draft: TodoDraft | null;
  all: Todo[];
  byId: Map<string, Todo>;
  today: string;
  lang: Lang;
  onClose: () => void;
  onSave: (id: string, patch: TodoDraft) => void;
  onCreate: (d: TodoDraft) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onToggle: (t: Todo, from?: Origin) => void;
  onAddChild: (parent: Todo, title: string) => void;
  /** Moves the step at `from` to index `to` among `root`'s steps. */
  onReorder: (root: Todo, from: number, to: number) => void;
  /** Moves a task (and what hangs under it) under another parent, or out on its own (null). */
  onMoveUnder: (task: Todo, parentId: string | null) => void;
  /** Makes a task a goal (out of its parent, off the day lists), or takes the mark off. */
  onSetGoal: (task: Todo, on: boolean) => void;
  /** After the sheet's "to today" / "to the pool" button moved the task (for a toast). */
  onMoved?: (task: Todo, toToday: boolean) => void;
  /** The user's events, for the "Event" field. */
  events: TodoEvent[];
  /** Sensitive and locked right now: its name is blurred in this form's menus. */
  veil: (t: Todo) => boolean;
  veilEvent: (e: TodoEvent) => boolean;
  /** Marks a top-level task sensitive (blurred until the PIN), or takes the mark off. */
  onSensitive: (task: Todo, on: boolean) => void;
  onPlayQuest: (id: string) => void;
}) {
  const tt = useTt();
  const key = task?.id ?? (draft ? 'new' : null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => formOf({}));
  const [armed, setArmed] = useState(false);
  const [stepText, setStepText] = useState('');
  /** For a new task: the goal (or step) it will belong to, chosen in "Part of"; null = no goal. */
  const [draftParent, setDraftParent] = useState<string | null>(null);
  const stepRef = useRef<HTMLInputElement>(null);
  /** From the navigation bar: to the field that adds a subtask, ready to type. */
  const focusAddStep = () => {
    stepRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    stepRef.current?.focus({ preventScroll: true });
  };
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Refill the form when a different task opens (compared during render, not in an effect).
  if (key !== shownFor) {
    setShownFor(key);
    setForm(formOf(task ?? draft ?? {}));
    setArmed(false);
    setStepText('');
    setDraftParent(draft?.root_id ?? null);
  }
  // A new task starts with the cursor in its title (after the dialog has opened and taken focus).
  useEffect(() => {
    if (key !== 'new') return;
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [key]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const commit = (cur: Form = form) => {
    const f = tidy(cur);
    if (!task) {
      if (f.title) onCreate({ ...draft, ...f, link: cleanLink(f.link), root_id: draftParent });
      return;
    }
    const patch = diff(formOf(task), { ...f, title: f.title || task.title, link: cleanLink(f.link) ?? '' });
    // A task that gained subtasks while open has handed its place on a day list over to them: keep it off.
    if (all.some((k) => k.root_id === task.id)) delete patch.day;
    if (Object.keys(patch).length) onSave(task.id, { ...patch, ...('link' in patch ? { link: patch.link || null } : {}) });
  };
  const close = () => {
    commit();
    onClose();
  };
  /** Opens another task in the sheet, keeping this one's changes. */
  const go = (id: string) => {
    commit();
    onOpen(id);
  };

  if (key === null) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        {null}
      </Sheet>
    );
  }

  const parentId = task ? task.root_id : draft ? draftParent : null;
  const parent = parentId ? byId.get(parentId) : undefined;
  const depth = task ? depthOf(task, byId) : parent ? depthOf(parent, byId) + 1 : 0;
  const tier = tierOf(depth);
  const kidTier = childTier(depth);
  const kids = task ? stepsOf(task.id, all) : [];
  const family = new Set(task ? [task.id, ...descendants(task.id, all).map((d) => d.id)] : []);
  const depCandidates = all
    .filter((o) => isOpen(o) && !family.has(o.id) && !form.depends_on.includes(o.id) && !o.depends_on.includes(task?.id ?? '-'))
    .sort((a, b) => a.title.localeCompare(b.title, lang));
  const waitFor = task && isOpen(task) ? blockers({ ...task, depends_on: form.depends_on }, byId) : [];
  const level = (k: keyof typeof levelKeys, short?: boolean) =>
    levelKeys[k].map((lk, i) => ({ value: i, label: short && k === 'complexity' ? SIZES[i] : tt(lk), title: tt(lk) }));
  // Parents it could move under: not itself or anything under it, and deep enough room for what hangs below it
  // (purpose → step → action is three levels at most).
  const below = task ? heightOf(task.id, all) : 0;
  const parentOptions = (
    task
      ? all.filter((o) => isOpen(o) && !family.has(o.id) && o.id !== task.root_id && depthOf(o, byId) + 1 + below <= 2)
      : all.filter((o) => isOpen(o) && o.id !== draftParent && depthOf(o, byId) <= 1)
  ).sort((a, b) => a.title.localeCompare(b.title, lang));
  /** A task as a dropdown choice: its type icon, its title, indented by depth, and its tier as a note. */
  const taskOption = (o: Todo): MenuOption => {
    const Icon = TYPE_ICON[o.type];
    const d = depthOf(o, byId);
    return {
      value: o.id,
      label: veil(o) ? `${VEIL} (${tt('veiled')})` : o.title || tt('untitled'),
      level: d,
      icon: <Icon size={15} aria-hidden className={`todo-menu-ic ty-${o.type}`} />,
      // The tier only where it says something: a step or action, or a task that has steps (a purpose).
      note: d > 0 || all.some((k) => k.root_id === o.id) ? tt(`tier_${tierOf(d)}`) : undefined,
    };
  };
  /** Tasks as dropdown choices in outline order: each step right under its purpose, each action under its step. */
  const outlineOptions = (list: Todo[]) => nestTasks(list, all).map(({ task: t }) => taskOption(t));
  /** The link as it will be saved (https:// added), or null while what's typed isn't a web address. */
  const openable = cleanLink(form.link);
  const nKids = task ? descendants(task.id, all).length : 0;
  const dayName = (iso: string | null) => (iso ? dayLabel(iso, today, lang, tt) : tt('pool'));
  const title = task ? (depth === 0 && !isGoal(task, all) ? tt('editTask') : tt(`tier_${tier}`)) : tt(depth ? `new_${tier as 'step' | 'action'}` : 'newTask');

  return (
    <Sheet open onClose={close} title={title} wide>
      <div className={`todo-sheet ty-${form.type}`}>
        <div className="todo-sheet-top">
          {/* The title first, then the drill-down bar with its quick actions. */}
          <div className="todo-title-row">
            <textarea
              ref={titleRef}
              className="todo-title-input"
              value={form.title}
              onChange={(e) => set('title', e.target.value.replace(/\n/g, ' '))}
              placeholder={tt('title')}
              aria-label={tt('title')}
              rows={1}
              dir="auto"
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  close();
                }
              }}
            />
            {openable && (
              <a className="icon-btn sm todo-open-link" href={openable} target="_blank" rel="noopener noreferrer" aria-label={tt('openLink')} data-tip={tt('openLinkTo', { host: hostOf(openable) })}>
                <ExternalLink size={18} />
              </a>
            )}
            <span className="todo-xp" title={tt('xpWorth')} dir="ltr">
              +{xpFor(form)} XP
            </span>
          </div>
          <DrillBar
            task={task}
            parentId={parentId}
            all={all}
            byId={byId}
            lang={lang}
            onOpen={go}
            veil={veil}
            onAddKid={focusAddStep}
            onGoal={(on) => {
              if (!task) return;
              commit();
              onSetGoal(task, on);
            }}
          />
        </div>

        {/* The task's flow comes first: its stage and its subtasks. Then its details and main link, and three sections:
            what it's tied to (depends on, part of, event, tags), its options (type, levels, size, sensitive) and its
            dates (deadline, due, estimate, reminder). Where it is (Today or the pool) is the move button in the footer. */}
        <h2 className="todo-flow-h">{tt('flowTitle')}</h2>
        <StageTrack value={form.status} onChange={(v) => set('status', v)} />
        {waitFor.length > 0 && (
          <p className="todo-wait">
            <Lock size={14} aria-hidden /> {tt('blockedBy', { list: waitFor.map((w) => w.title || tt('untitled')).join(', ') })}
          </p>
        )}

        {task && (
          <section className="todo-sec todo-kids">
            <h3>
              <ListTree size={18} aria-hidden />
              {tt(`kids_${kidTier as 'step' | 'action'}`)}
              {kids.length > 0 && (
                <span className="muted">
                  {' '}
                  · {kids.filter((s) => !isOpen(s)).length}/{kids.length}
                </span>
              )}
              {depth === 0 && kids.length > 0 && (
                <button type="button" className="todo-link" onClick={() => {
                    commit();
                    onPlayQuest(task.id);
                  }}>
                  <Swords size={14} /> {tt('playQuest')}
                </button>
              )}
            </h3>
            {kids.length > 0 && (
              <span className="todo-kids-bar" style={{ '--p': kids.filter((s) => !isOpen(s)).length / kids.length } as React.CSSProperties} />
            )}
            {kids.length === 0 && <p className="muted small">{tt(depth === 0 ? 'deriveHint_step' : 'deriveHint_action')}</p>}
            {kids.length > 0 && (
              <StepList kids={kids} all={all} byId={byId} today={today} lang={lang} onToggle={onToggle} onOpen={go} onReorder={(from, to) => onReorder(task, from, to)} />
            )}
            <form
              className="todo-add-step"
              onSubmit={(e) => {
                e.preventDefault();
                const v = stepText.trim();
                if (!v) return;
                onAddChild(task, v);
                setStepText('');
              }}
            >
              <input ref={stepRef} value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder={tt(`add_${kidTier as 'step' | 'action'}`)} dir={lang === 'he' ? 'rtl' : 'ltr'} enterKeyHint="send" />
              <button type="submit" className="icon-btn accent" aria-label={tt(`add_${kidTier as 'step' | 'action'}`)} disabled={!stepText.trim()}>
                <Plus size={20} />
              </button>
            </form>
          </section>
        )}

        {/* What it is: details and its main link. */}
        <textarea
          className="todo-desc"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={tt('description')}
          aria-label={tt('description')}
          rows={2}
          dir="auto"
        />

        <div className="todo-field todo-mainlink">
          <span className="todo-field-l">{tt('mainLink')}</span>
          <div className="todo-mainlink-row">
            <Link2 size={18} aria-hidden className="muted" />
            <input
              type="url"
              inputMode="url"
              value={form.link}
              onChange={(e) => set('link', e.target.value)}
              placeholder={tt('mainLinkPh')}
              aria-label={tt('mainLink')}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {openable && (
              <a className="btn sm primary" href={openable} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} aria-hidden /> {tt('openShort')}
              </a>
            )}
          </div>
          {form.link.trim() && !openable && <span className="muted small">{tt('linkInvalid')}</span>}
        </div>

        {/* Three sections: what it's tied to, its options, its dates. */}
        <section className="todo-part">
          <h3 className="todo-part-h">
            <Link2 size={17} aria-hidden /> {tt('partLinks')}
          </h3>
          <section className="todo-sec">
            <h3>{tt('dependsOn')}</h3>
            {form.depends_on.length === 0 && <p className="muted small">{tt('noDeps')}</p>}
            {form.depends_on.length > 0 && (
              <ul className="todo-deps">
                {form.depends_on.map((id) => {
                  const d = byId.get(id);
                  if (!d) return null;
                  return (
                    <li key={id} className={isOpen(d) ? undefined : 'is-done'}>
                      <button type="button" className="todo-dep-name" onClick={() => go(id)} dir="auto">
                        {d.title || tt('untitled')}
                      </button>
                      <button type="button" className="icon-btn sm" onClick={() => set('depends_on', form.depends_on.filter((x) => x !== id))} aria-label={tt('delete')}>
                        <X size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {depCandidates.length > 0 && (
              <SelectMenu
                label={tt('addDependency')}
                value={null}
                placeholder={tt('addDependency')}
                searchPlaceholder={tt('searchTasks')}
                empty={tt('noMatches')}
                options={outlineOptions(depCandidates)}
                onChange={(id) => set('depends_on', [...form.depends_on, id])}
              />
            )}
          </section>
          {parentOptions.length + (parent ? 1 : 0) > 0 && (
            <div className="todo-sec todo-parent">
              <h3>
                <ListTree size={16} aria-hidden /> {tt('partOfField')}
              </h3>
              <SelectMenu
                label={tt('partOfField')}
                value={parentId ?? ''}
                placeholder={tt('standalone')}
                searchPlaceholder={tt('searchTasks')}
                empty={tt('noMatches')}
                options={[
                  { value: '', label: tt('standalone'), icon: <FlagOff size={15} aria-hidden className="todo-menu-ic is-none" />, note: tt('standaloneNote') },
                  ...outlineOptions((parent ? [parent] : []).concat(parentOptions)),
                ]}
                onChange={(v) => {
                  if (!task) return setDraftParent(v || null);
                  commit();
                  onMoveUnder(task, v || null);
                }}
              />
              <span className="muted small">{tt(task ? 'partOfHint' : 'partOfHintNew')}</span>
            </div>
          )}
          {(events.length > 0 || form.event_id) && (
            <div className="todo-field">
              <span className="todo-field-l">
                <CalendarDays size={15} aria-hidden /> {tt('eventField')}
              </span>
              <SelectMenu
                label={tt('eventField')}
                value={form.event_id ?? ''}
                placeholder={tt('eventNone')}
                searchPlaceholder={tt('searchTasks')}
                empty={tt('noMatches')}
                options={[
                  { value: '', label: tt('eventNone'), icon: <CalendarOff size={15} aria-hidden className="todo-menu-ic is-none" />, note: tt('eventNoneNote') },
                  ...[...events]
                    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
                    .map((e) => ({
                      value: e.id,
                      label: veilEvent(e) ? `${VEIL} (${tt('veiled')})` : e.title || tt('untitled'),
                      icon: <CalendarDays size={15} aria-hidden className="todo-menu-ic" />,
                      note: e.date ? dayLabel(e.date, today, lang, tt) : undefined,
                    })),
                ]}
                onChange={(v) => set('event_id', v || null)}
              />
              <span className="muted small">{tt('eventHint')}</span>
              {form.event_id && (
                <label className="todo-sensitive-row todo-eventonly">
                  <CalendarDays size={17} aria-hidden />
                  <span>
                    <strong>{tt('eventOnly')}</strong>
                    <span className="muted small">{tt('eventOnlyHint')}</span>
                  </span>
                  <input type="checkbox" role="switch" checked={form.event_only} onChange={(e) => set('event_only', e.target.checked)} />
                </label>
              )}
            </div>
          )}
          <LabelField
            label={tt('tags')}
            values={form.tags}
            onChange={(v) => set('tags', v)}
            suggest={tagsIn(all).map((l) => l.name)}
            prefix="#"
            placeholder={tt('addTag')}
            hint={tt('tagsHint')}
          />
        </section>

        <section className="todo-part">
          <h3 className="todo-part-h">
            <SlidersHorizontal size={17} aria-hidden /> {tt('partOptions')}
          </h3>
          <div className="todo-field">
            <span className="todo-field-l">{tt('type')}</span>
            <TypePicker value={form.type} onChange={(v) => set('type', v)} />
          </div>
          <div className="todo-grid">
            <div className="todo-field">
              <span className="todo-field-l">{tt('priority')}</span>
              <Segmented label={tt('priority')} value={form.priority} onChange={(v) => set('priority', v)} options={level('priority')} tone="level" />
            </div>
            <div className="todo-field">
              <span className="todo-field-l">{tt('urgency')}</span>
              <Segmented label={tt('urgency')} value={form.urgency} onChange={(v) => set('urgency', v)} options={level('urgency')} tone="level" />
            </div>
          </div>
          <div className="todo-field todo-cx">
            <span className="todo-field-l">{tt('complexity')}</span>
            <Segmented label={tt('complexity')} value={form.complexity} onChange={(v) => set('complexity', v)} options={level('complexity', true)} />
          </div>
          {/* Sensitive: top-level tasks only (it covers everything under them). */}
          {task && !task.root_id && (
            <label className="todo-sensitive-row">
              <EyeOff size={17} aria-hidden />
              <span>
                <strong>{tt('sensitive')}</strong>
                <span className="muted small">{tt('sensitiveHint')}</span>
              </span>
              <input type="checkbox" role="switch" checked={task.sensitive} onChange={(e) => onSensitive(task, e.target.checked)} />
            </label>
          )}
        </section>

        <section className="todo-part">
          <h3 className="todo-part-h">
            <CalendarClock size={17} aria-hidden /> {tt('partDates')}
          </h3>
          <div className="todo-grid">
            <div className="todo-dates wide">
              <label className="todo-field">
                <span className="todo-field-l">{tt('deadline')}</span>
                <input type="date" value={form.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || null)} dir="ltr" />
              </label>
              <label className="todo-field">
                <span className="todo-field-l">{tt('dueDate')}</span>
                <input type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} dir="ltr" />
              </label>
              <label className="todo-field">
                <span className="todo-field-l">{tt('estimateDate')}</span>
                <input type="date" value={form.estimate_date ?? ''} onChange={(e) => set('estimate_date', e.target.value || null)} dir="ltr" />
              </label>
            </div>
            <div className="todo-field wide">
              <RemindField label={tt('remindOn')} value={form.remind_on} onChange={(v) => set('remind_on', v)} today={today} />
            </div>
          </div>
        </section>

        <div className="todo-folds">
          <Fold title={tt('dataTitle')} count={form.data.length} icon={<Database size={16} aria-hidden />}>
            <DataField rows={form.data} onChange={(v) => set('data', v)} />
          </Fold>
          <Fold title={tt('contactsTitle')} count={form.contacts.length} icon={<Users size={16} aria-hidden />}>
            <ContactsField
              key={task?.id ?? 'new'}
              rows={form.contacts}
              onChange={(v) => set('contacts', v)}
              jobTitle={events.find((e) => e.id === form.event_id)?.title || undefined}
              // A new task is saved with its own Save button; an open one can store its contacts right here.
              dirty={!!task && !sameContacts(form.contacts, task.contacts)}
              onSave={task ? () => commit() : undefined}
            />
          </Fold>
          <Fold title={tt('commentsTitle')} count={form.comments.length} icon={<MessageSquare size={16} aria-hidden />}>
            <CommentsField rows={form.comments} onChange={(v) => set('comments', v)} lang={lang} />
          </Fold>
          <Fold title={tt('logTitle')} count={form.log.length} icon={<History size={16} aria-hidden />}>
            <LogField rows={form.log} onChange={(v) => set('log', v)} lang={lang} dayName={dayName} />
          </Fold>
        </div>

        <footer className="todo-sheet-foot">
          {task ? (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                if (!armed) return setArmed(true);
                onDelete(task.id);
                onClose();
              }}
            >
              <Trash2 size={16} />
              {armed ? tt('sure') : nKids ? tt('deleteWithSteps', { n: nKids }) : tt('delete')}
            </button>
          ) : (
            <span />
          )}
          {/* Where the task is now decides the move: from Today back to the pool, or from the pool (or a later day)
              onto Today. Saves and closes. Not for a task with subtasks: those go to Today through their next step. */}
          {task && isOpen(task) && kids.length === 0 && !isGoal(task, all) && (
            <button
              type="button"
              className={`btn ghost todo-move-btn${form.day === today ? ' to-pool' : ''}`}
              onClick={() => {
                const toToday = form.day !== today;
                commit({ ...form, day: toToday ? today : null, ...(toToday ? { event_only: false } : {}) });
                onMoved?.(task, toToday);
                onClose();
              }}
            >
              {form.day === today ? <Inbox size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
              {form.day === today ? tt('toPoolShort') : tt('toTodayShort')}
            </button>
          )}
          <button type="button" className="btn primary" onClick={close} disabled={!task && !form.title.trim()}>
            {task ? tt('save') : tt('create')}
          </button>
        </footer>
      </div>
    </Sheet>
  );
}
