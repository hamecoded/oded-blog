import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  ListTree,
  Database,
  History,
  Lock,
  MessageSquare,
  Plus,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import type { Lang, Todo, TodoComment, TodoContact, TodoDatum, TodoDraft, TodoLogEntry, TodoStatus, TodoType } from '../../lib/types';
import { CommentsField, ContactsField, DataField, Fold, LabelField, LogField, StageTrack, TypePicker } from './fields';
import { blockers, childTier, dayLabel, depthOf, descendants, heightOf, isOpen, labelsIn, levelKeys, nestTasks, SIZES, stepsOf, tierOf, xpFor } from './model';
import { TYPE_ICON } from './look';
import { RemindField } from './RemindField';
import { Segmented } from './Segmented';
import { useTt } from './strings';
import { SelectMenu, type MenuOption } from './SelectMenu';
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
  lists: string[];
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
  lists: t.lists ?? [],
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
  description: f.description.trim(),
  data: f.data.filter((d) => d.key.trim() || d.value.trim()),
  contacts: f.contacts.filter((c) => c.name.trim() || c.phone.trim() || c.email.trim()),
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
 * (today, the pool, a reminder), levels, dates, tags and lists, what it waits for, the steps or actions derived
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
  onPlayQuest: (id: string) => void;
}) {
  const tt = useTt();
  const key = task?.id ?? (draft ? 'new' : null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => formOf({}));
  const [armed, setArmed] = useState(false);
  const [stepText, setStepText] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Refill the form when a different task opens (compared during render, not in an effect).
  if (key !== shownFor) {
    setShownFor(key);
    setForm(formOf(task ?? draft ?? {}));
    setArmed(false);
    setStepText('');
  }
  // A new task starts with the cursor in its title (after the dialog has opened and taken focus).
  useEffect(() => {
    if (key !== 'new') return;
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [key]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const commit = () => {
    const f = tidy(form);
    if (!task) {
      if (f.title) onCreate({ ...draft, ...f });
      return;
    }
    const patch = diff(formOf(task), { ...f, title: f.title || task.title });
    // A task that gained subtasks while open has handed its place on a day list over to them: keep it off.
    if (all.some((k) => k.root_id === task.id)) delete patch.day;
    if (Object.keys(patch).length) onSave(task.id, patch);
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

  const parentId = task?.root_id ?? draft?.root_id ?? null;
  const parent = parentId ? byId.get(parentId) : undefined;
  const siblings = parent ? stepsOf(parent.id, all) : [];
  const at = task ? siblings.findIndex((s) => s.id === task.id) : -1;
  const depth = task ? depthOf(task, byId) : parent ? depthOf(parent, byId) + 1 : 0;
  const tier = tierOf(depth);
  const kidTier = childTier(depth);
  const kids = task ? stepsOf(task.id, all) : [];
  const family = new Set(task ? [task.id, ...descendants(task.id, all).map((d) => d.id)] : []);
  const depCandidates = all
    .filter((o) => isOpen(o) && !family.has(o.id) && !form.depends_on.includes(o.id) && !o.depends_on.includes(task?.id ?? '-'))
    .sort((a, b) => a.title.localeCompare(b.title, lang));
  const waitFor = task && isOpen(task) ? blockers({ ...task, depends_on: form.depends_on }, byId) : [];
  const dayOptions = [
    { value: today, label: tt('today') },
    { value: '', label: tt('pool') },
    ...(form.day && form.day !== today ? [{ value: form.day, label: tt('onDay', { day: dayLabel(form.day, today, lang, tt) }) }] : []),
  ];
  const level = (k: keyof typeof levelKeys, short?: boolean) =>
    levelKeys[k].map((lk, i) => ({ value: i, label: short && k === 'complexity' ? SIZES[i] : tt(lk), title: tt(lk) }));
  // Parents it could move under: not itself or anything under it, and deep enough room for what hangs below it
  // (purpose → step → action is three levels at most).
  const below = task ? heightOf(task.id, all) : 0;
  const parentOptions = task
    ? all
        .filter((o) => isOpen(o) && !family.has(o.id) && o.id !== task.root_id && depthOf(o, byId) + 1 + below <= 2)
        .sort((a, b) => a.title.localeCompare(b.title, lang))
    : [];
  /** A task as a dropdown choice: its type icon, its title, indented by depth, and its tier as a note. */
  const taskOption = (o: Todo): MenuOption => {
    const Icon = TYPE_ICON[o.type];
    const d = depthOf(o, byId);
    return {
      value: o.id,
      label: o.title || tt('untitled'),
      level: d,
      icon: <Icon size={15} aria-hidden className={`todo-menu-ic ty-${o.type}`} />,
      // The tier only where it says something: a step or action, or a task that has steps (a purpose).
      note: d > 0 || all.some((k) => k.root_id === o.id) ? tt(`tier_${tierOf(d)}`) : undefined,
    };
  };
  /** Tasks as dropdown choices in outline order: each step right under its purpose, each action under its step. */
  const outlineOptions = (list: Todo[]) => nestTasks(list, all).map(({ task: t }) => taskOption(t));
  const nKids = task ? descendants(task.id, all).length : 0;
  const dayName = (iso: string | null) => (iso ? dayLabel(iso, today, lang, tt) : tt('pool'));
  const title = task ? (depth === 0 && !kids.length ? tt('editTask') : tt(`tier_${tier}`)) : tt(depth ? `new_${tier as 'step' | 'action'}` : 'newTask');

  return (
    <Sheet open onClose={close} title={title} wide>
      <div className={`todo-sheet ty-${form.type}`}>
        <div className="todo-sheet-top">
          {parent && (
            <nav className="todo-crumb">
              <button type="button" className="todo-crumb-root" onClick={() => go(parent.id)} title={tt('openRoot')}>
                <CornerDownRight size={14} aria-hidden />
                <span className="lbl">{tt('partOf')}</span>
                <span dir="auto">{parent.title || tt('untitled')}</span>
              </button>
              {task && (
                <>
                  <span className="todo-crumb-n">{tt('nOfTier', { tier: tt(`tier_${tier}`), n: at + 1, m: siblings.length })}</span>
                  <button type="button" className="icon-btn sm" disabled={at <= 0} onClick={() => go(siblings[at - 1].id)} aria-label={tt('prevStep')} title={tt('prevStep')}>
                    <ChevronUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn sm"
                    disabled={at < 0 || at >= siblings.length - 1}
                    onClick={() => go(siblings[at + 1].id)}
                    aria-label={tt('nextStep')}
                    title={tt('nextStep')}
                  >
                    <ChevronDown size={18} />
                  </button>
                </>
              )}
            </nav>
          )}

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
            <span className="todo-xp" title={tt('xpWorth')} dir="ltr">
              +{xpFor(form)} XP
            </span>
          </div>
        </div>

        {/* Most important first: where it sits, how much it matters, when it's due, its stage, what it is. */}
        <div className="todo-grid">
          <div className="todo-field wide">
            <span className="todo-field-l">{tt('where')}</span>
            {kids.length > 0 ? (
              <p className="muted small todo-note">{tt('parentOffToday')}</p>
            ) : (
              <Segmented label={tt('where')} value={form.day ?? ''} onChange={(v) => set('day', v || null)} options={dayOptions} />
            )}
          </div>
          <div className="todo-field">
            <span className="todo-field-l">{tt('priority')}</span>
            <Segmented label={tt('priority')} value={form.priority} onChange={(v) => set('priority', v)} options={level('priority')} tone="level" />
          </div>
          <div className="todo-field">
            <span className="todo-field-l">{tt('urgency')}</span>
            <Segmented label={tt('urgency')} value={form.urgency} onChange={(v) => set('urgency', v)} options={level('urgency')} tone="level" />
          </div>
          <div className="todo-dates wide">
            <label className="todo-field">
              <span className="todo-field-l">{tt('deadline')}</span>
              <input type="date" value={form.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || null)} dir="ltr" />
            </label>
            <label className="todo-field">
              <span className="todo-field-l">{tt('dueDate')}</span>
              <input type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} dir="ltr" />
            </label>
          </div>
        </div>

        <StageTrack value={form.status} onChange={(v) => set('status', v)} />
        {waitFor.length > 0 && (
          <p className="todo-wait">
            <Lock size={14} aria-hidden /> {tt('blockedBy', { list: waitFor.map((w) => w.title || tt('untitled')).join(', ') })}
          </p>
        )}

        <textarea
          className="todo-desc"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={tt('description')}
          aria-label={tt('description')}
          rows={2}
          dir="auto"
        />

        {task && (
          <section className="todo-sec">
            <h3>
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
              <input value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder={tt(`add_${kidTier as 'step' | 'action'}`)} dir={lang === 'he' ? 'rtl' : 'ltr'} enterKeyHint="send" />
              <button type="submit" className="icon-btn accent" aria-label={tt(`add_${kidTier as 'step' | 'action'}`)} disabled={!stepText.trim()}>
                <Plus size={20} />
              </button>
            </form>
          </section>
        )}

        <div className="todo-field">
          <span className="todo-field-l">{tt('type')}</span>
          <TypePicker value={form.type} onChange={(v) => set('type', v)} />
        </div>

        <LabelField
          label={tt('listsField')}
          values={form.lists}
          onChange={(v) => set('lists', v)}
          suggest={labelsIn(all, 'lists').map((l) => l.name)}
          prefix="@"
          placeholder={tt('addList')}
          hint={tt('listsHint')}
        />
        <LabelField
          label={tt('tags')}
          values={form.tags}
          onChange={(v) => set('tags', v)}
          suggest={labelsIn(all, 'tags').map((l) => l.name)}
          prefix="#"
          placeholder={tt('addTag')}
          hint={tt('tagsHint')}
        />

        <div className="todo-grid">
          <div className="todo-field wide">
            <RemindField label={tt('remindOn')} value={form.remind_on} onChange={(v) => set('remind_on', v)} today={today} />
          </div>
          <div className="todo-field wide">
            <span className="todo-field-l">{tt('complexity')}</span>
            <Segmented label={tt('complexity')} value={form.complexity} onChange={(v) => set('complexity', v)} options={level('complexity', true)} />
          </div>
          <div className="todo-dates wide">
            <label className="todo-field">
              <span className="todo-field-l">{tt('estimateDate')}</span>
              <input type="date" value={form.estimate_date ?? ''} onChange={(e) => set('estimate_date', e.target.value || null)} dir="ltr" />
            </label>
          </div>
        </div>

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

        {task && parentOptions.length + (parent ? 1 : 0) > 0 && (
          <div className="todo-sec todo-parent">
            <h3>
              <ListTree size={16} aria-hidden /> {tt('partOfField')}
            </h3>
            <SelectMenu
              label={tt('partOfField')}
              value={task.root_id ?? ''}
              placeholder={tt('standalone')}
              searchPlaceholder={tt('searchTasks')}
              empty={tt('noMatches')}
              options={[{ value: '', label: tt('standalone') }, ...outlineOptions((parent ? [parent] : []).concat(parentOptions))]}
              onChange={(v) => {
                commit();
                onMoveUnder(task, v || null);
              }}
            />
            <span className="muted small">{tt('partOfHint')}</span>
          </div>
        )}

        <div className="todo-folds">
          <Fold title={tt('dataTitle')} count={form.data.length} icon={<Database size={16} aria-hidden />}>
            <DataField rows={form.data} onChange={(v) => set('data', v)} />
          </Fold>
          <Fold title={tt('contactsTitle')} count={form.contacts.length} icon={<Users size={16} aria-hidden />}>
            <ContactsField rows={form.contacts} onChange={(v) => set('contacts', v)} />
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
          <button type="button" className="btn primary" onClick={close} disabled={!task && !form.title.trim()}>
            {task ? tt('save') : tt('create')}
          </button>
        </footer>
      </div>
    </Sheet>
  );
}
