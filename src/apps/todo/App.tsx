import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  ArrowUpToLine,
  Bell,
  CheckCheck,
  Flag,
  Hash,
  Inbox,
  LayoutList,
  ListTodo,
  Plus,
  SlidersHorizontal,
  Sun,
  Swords,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { errorText, useApp } from '../../lib/app';
import type { Todo, TodoDraft } from '../../lib/types';
import { todoFields } from '../../lib/util';
import { FxLayer } from './FxLayer';
import { Fx } from './fx';
import { Hud } from './Hud';
import { useAppChrome, usePalette, useReducedMotion, useToday } from './hooks';
import {
  addDays,
  blockers,
  dayLabel,
  descendants,
  groupTasks,
  hasLabel,
  isLeftover,
  isOpen,
  isoDay,
  isReminded,
  labelsIn,
  logFor,
  parseQuick,
  progressOf,
  recall,
  relink,
  remember,
  sortTasks,
  statsOf,
  stepsOf,
  xpFor,
  type GroupKey,
  type SortKey,
} from './model';
import { QuestMap } from './QuestMap';
import { ReviewSheet, type Decision } from './ReviewSheet';
import { useTt, type TKey } from './strings';
import { TaskRow, type Origin } from './TaskRow';
import { TaskSheet } from './TaskSheet';

type Tab = 'today' | 'pool' | 'quests' | 'lists' | 'done';
type PoolFilter = 'all' | 'reminded' | 'due' | 'blocked';
type Patch = TodoDraft & { id: string };
type Label = { kind: 'lists' | 'tags'; name: string };

/** Several patches to the same task become one. */
function merge(list: Patch[]): Patch[] {
  const m = new Map<string, Patch>();
  list.forEach((p) => m.set(p.id, { ...m.get(p.id), ...p }));
  return [...m.values()];
}

const TABS: Tab[] = ['today', 'pool', 'quests', 'lists', 'done'];

/**
 * To-do, played as a game: a fresh list every day, XP and levels for finished tasks, and purposes played as
 * quests (steps along a road on a canvas, actions around each step). Tasks left open on an earlier day wait
 * for the morning debrief (keep today, or save to the pool after refining priority and setting a reminder);
 * pooled tasks come back on their reminder date. Lists are tasks naming the same list; tags group them.
 */
export default function TodoApp() {
  const { user, prefs, toast, t } = useApp();
  const lang = prefs.uiLang;
  const tt = useTt();
  const today = useToday();
  useAppChrome();
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const pal = usePalette(rootEl);
  const reduced = useReducedMotion();
  const [fx] = useState(() => new Fx());

  const [rows, setRows] = useState<Todo[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTabState] = useState<Tab>(() => {
    const v = recall('tab') as Tab | null;
    return v && TABS.includes(v) ? v : 'today';
  });
  const [sort, setSortState] = useState<SortKey>(() => (recall('sort') as SortKey | null) ?? 'smart');
  const [group, setGroupState] = useState<GroupKey>(() => (recall('group') as GroupKey | null) ?? 'none');
  const [filter, setFilter] = useState<PoolFilter>('all');
  const [text, setText] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TodoDraft | null>(null);
  const [questId, setQuestId] = useState<string | null>(() => recall('quest'));
  const [label, setLabel] = useState<Label | null>(null);
  /** null: the review opens by itself once a day when there are leftovers. */
  const [reviewChoice, setReviewChoice] = useState<boolean | null>(null);
  const [promptedOn, setPromptedOn] = useState(() => recall('reviewed'));

  const fail = (e: unknown) => {
    toast(errorText(e, t));
    void reload();
  };
  const reload = () =>
    api
      .listTodos()
      .then((r) => {
        setMissing(false);
        setRows(r);
      })
      .catch((e) => {
        if (e instanceof Error && e.message === 'todos/missing') setMissing(true);
        else toast(errorText(e, t));
        setRows((r) => r ?? []);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), [user?.id]);

  const all = useMemo(() => rows ?? [], [rows]);
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all]);
  const stats = useMemo(() => statsOf(all, today), [all, today]);
  const leftovers = useMemo(
    () => all.filter((r) => isLeftover(r, today)).sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || b.priority - a.priority),
    [all, today],
  );
  const todayAll = useMemo(() => all.filter((r) => r.day === today && r.status !== 'quit'), [all, today]);
  const todayList = useMemo(() => sortTasks(todayAll, sort, today, byId), [todayAll, sort, today, byId]);
  const reminded = useMemo(() => sortTasks(all.filter((r) => isReminded(r, today)), 'smart', today, byId), [all, today, byId]);
  const pool = useMemo(() => all.filter((r) => !r.day && isOpen(r)), [all]);
  const poolShown = useMemo(() => {
    const f = pool.filter((r) =>
      filter === 'reminded' ? isReminded(r, today) : filter === 'due' ? !!(r.due_date || r.deadline) : filter === 'blocked' ? blockers(r, byId).length > 0 || r.status === 'blocked' : true,
    );
    return sortTasks(f, sort, today, byId);
  }, [pool, filter, sort, today, byId]);
  const purposes = useMemo(() => {
    const list = all.filter((r) => !r.root_id && (all.some((k) => k.root_id === r.id) || r.id === questId));
    return list.sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || b.updated_at.localeCompare(a.updated_at));
  }, [all, questId]);
  const quest = questId ? byId.get(questId) : undefined;
  const finished = useMemo(() => {
    const list = all.filter((r) => !isOpen(r)).sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at));
    const groups: { day: string; items: Todo[] }[] = [];
    list.slice(0, 300).forEach((r) => {
      const d = isoDay(new Date(r.done_at ?? r.updated_at));
      const g = groups.at(-1);
      if (g?.day === d) g.items.push(r);
      else groups.push({ day: d, items: [r] });
    });
    return groups;
  }, [all]);

  const reviewOpen = leftovers.length > 0 && (reviewChoice ?? promptedOn !== today);
  const closeReview = () => {
    setReviewChoice(false);
    setPromptedOn(today);
    remember('reviewed', today);
  };

  const setTab = (v: Tab) => {
    setTabState(v);
    remember('tab', v);
    window.scrollTo({ top: 0 });
  };
  const setSort = (v: SortKey) => {
    setSortState(v);
    remember('sort', v);
  };
  const setGroup = (v: GroupKey) => {
    setGroupState(v);
    remember('group', v);
  };
  const pickQuest = (id: string | null) => {
    setQuestId(id);
    remember('quest', id ?? '');
    window.scrollTo({ top: 0 });
  };

  // ── Changes: shown at once, then saved; on failure the list reloads. Stage and day moves are logged. ──
  const update = (list: Patch[]) => {
    const now = new Date().toISOString();
    const ps = merge(list).map((p) => {
      const before = byId.get(p.id);
      const entries = before ? logFor(before, p, now) : [];
      return entries.length ? { ...p, log: [...(p.log ?? before!.log), ...entries] } : p;
    });
    if (!ps.length) return;
    setRows((rs) =>
      rs?.map((r) => {
        const p = ps.find((x) => x.id === r.id);
        return p ? { ...r, ...todoFields(p, r), updated_at: now } : r;
      }) ?? rs,
    );
    Promise.all(ps.map((p) => api.saveTodo(p)))
      .then((saved) => setRows((rs) => rs?.map((r) => saved.find((s) => s.id === r.id) ?? r) ?? rs))
      .catch(fail);
  };
  /** Creates a task; one derived from another joins the end of its siblings' chain. */
  const create = async (d: TodoDraft): Promise<Todo | null> => {
    const parent = d.root_id ? byId.get(d.root_id) : undefined;
    const last = parent ? stepsOf(parent.id, all).at(-1) : undefined;
    const full: TodoDraft = {
      ...(parent ? { day: null, priority: parent.priority, urgency: parent.urgency, tags: parent.tags, lists: parent.lists } : {}),
      ...d,
      prev_id: parent ? (last?.id ?? null) : d.prev_id,
      log: [{ at: new Date().toISOString(), kind: 'created' }],
    };
    try {
      const saved = await api.saveTodo(full);
      setRows((rs) => [...(rs ?? []), saved]);
      if (last) update([{ id: last.id, next_id: saved.id }]);
      return saved;
    } catch (e) {
      fail(e);
      return null;
    }
  };
  const remove = (id: string) => {
    const task = byId.get(id);
    if (!task) return;
    const gone = new Set([id, ...descendants(id, all).map((d) => d.id)]);
    const patches: Patch[] = [];
    if (task.root_id) patches.push(...relink(stepsOf(task.root_id, all).filter((s) => !gone.has(s.id))));
    all.forEach((o) => {
      if (!gone.has(o.id) && o.depends_on.some((d) => gone.has(d))) {
        patches.push({ id: o.id, depends_on: o.depends_on.filter((d) => !gone.has(d)) });
      }
    });
    setRows((rs) => rs?.filter((r) => !gone.has(r.id)) ?? rs);
    update(patches);
    if (gone.has(questId ?? '')) pickQuest(null);
    api
      .deleteTodos([...gone])
      .then(() => toast(tt('deleted')))
      .catch(fail);
  };

  /** Completing: a burst where it was tapped, the XP it earned, and confetti for a level or a finished quest. */
  const celebrate = (task: Todo, from?: Origin) => {
    const at = from ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const gold = pal?.gold ?? '#f5b301';
    fx.burst(at.x, at.y, [gold, pal?.ty[task.type] ?? '#10b981', pal?.accent ?? '#4f46e5', '#ffffff']);
    fx.float(at.x, at.y - 18, tt('xpGain', { n: xpFor(task) }), gold);
    const after = all.map((r) => (r.id === task.id ? { ...r, status: 'completed' as const, done_at: new Date().toISOString() } : r));
    const lvl = statsOf(after, today).level;
    const root = task.root_id ? byId.get(task.root_id) : undefined;
    const questDone = !!root && stepsOf(root.id, after).every((s) => !isOpen(s));
    if (lvl > stats.level || questDone) {
      fx.confetti([gold, pal?.accent ?? '#4f46e5', pal?.accent2 ?? '#db2777', '#10b981', '#0ea5e9']);
      toast(lvl > stats.level ? tt('levelUp', { n: lvl }) : `${tt('questComplete')} ${root?.title ?? ''}`);
    }
  };
  const toggle = (task: Todo, from?: Origin) => {
    if (isOpen(task)) {
      update([{ id: task.id, status: 'completed' }]);
      celebrate(task, from);
    } else {
      update([{ id: task.id, status: 'inprogress', day: task.day && task.day < today ? today : task.day }]);
    }
  };
  const toToday = (task: Todo) =>
    update([{ id: task.id, day: today, remind_on: task.remind_on && task.remind_on <= today ? null : task.remind_on }]);
  const snooze = (task: Todo) => update([{ id: task.id, remind_on: addDays(today, 1) }]);
  const moveStep = (root: Todo, i: number, dir: -1 | 1) => {
    const order = stepsOf(root.id, all);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update(relink(order));
  };
  const decide = (task: Todo, d: Decision, refine: TodoDraft) => {
    if (d === 'done') {
      update([{ id: task.id, status: 'completed' }]);
      celebrate(task);
    } else if (d === 'drop') update([{ id: task.id, status: 'quit' }]);
    else update([{ id: task.id, ...refine, day: d === 'today' ? today : null }]);
  };
  const decideAll = (d: 'today' | 'pool') => {
    update(leftovers.map((r) => ({ id: r.id, day: d === 'today' ? today : null })));
    closeReview();
  };

  /** Where a new task goes from the current screen. */
  const placeOf = (): TodoDraft => {
    if (tab === 'pool') return { day: null };
    if (tab === 'lists' && label) return { day: null, [label.kind]: [label.name] };
    if (tab === 'quests' && quest) return { root_id: quest.id, day: null };
    return { day: today };
  };
  const quickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseQuick(text);
    if (!q.title) return;
    setText('');
    const place = placeOf();
    void create({
      ...place,
      ...q,
      tags: [...(place.tags ?? []), ...(q.tags ?? [])],
      lists: [...(place.lists ?? []), ...(q.lists ?? [])],
    });
  };
  const openNew = (extra?: TodoDraft) => {
    setOpenId(null);
    const q = parseQuick(text);
    setDraft({ ...placeOf(), ...(q.title ? q : {}), ...extra });
    setText('');
  };
  const openTask = (id: string) => {
    setDraft(null);
    setOpenId(id);
  };
  const closeSheet = () => {
    setOpenId(null);
    setDraft(null);
  };

  if (rows === null) return <p className="loading">{t('loading')}</p>;
  if (missing) {
    return (
      <div className="todo-empty">
        <ListTodo size={48} strokeWidth={1.4} aria-hidden />
        <p>{tt('notSetUp')}</p>
        <code dir="ltr">npm run db:update</code>
      </div>
    );
  }

  const doneToday = todayAll.filter((r) => r.status === 'completed').length;
  const row = (task: Todo, extra?: { showRemind?: boolean; action?: ReactNode; hideRoot?: boolean }) => (
    <TaskRow key={task.id} task={task} all={all} byId={byId} today={today} lang={lang} onToggle={toggle} onOpen={(x) => openTask(x.id)} {...extra} />
  );
  const toTodayBtn = (r: Todo) => (
    <button type="button" className="icon-btn sm accent" onClick={() => toToday(r)} aria-label={tt('toToday')} title={tt('toToday')}>
      <ArrowUpToLine size={18} />
    </button>
  );
  /** A list split by the chosen grouping; each group a labelled block. */
  const grouped = (list: Todo[], rowExtra?: (r: Todo) => { showRemind?: boolean; action?: ReactNode }, by: GroupKey = group) =>
    groupTasks(list, by, tt).map((g) => (
      <section key={g.id || '-'} className="todo-group">
        {g.label && (
          <h2 className="todo-group-h" dir="auto">
            {g.label} <span className="muted">{g.items.length}</span>
          </h2>
        )}
        <ul className="todo-list">{g.items.map((r) => row(r, rowExtra?.(r)))}</ul>
      </section>
    ));
  const viewBar = (opts: { sort?: boolean; groups?: GroupKey[]; children?: ReactNode }) => (
    <div className="todo-viewbar">
      {opts.children}
      <span className="todo-viewbar-end">
        {opts.groups && (
          <label className="todo-select">
            <span className="sr-only">{tt('groupBy')}</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)}>
              {opts.groups.map((g) => (
                <option key={g} value={g}>
                  {tt(`group_${g}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {opts.sort && (
          <label className="todo-select">
            <span className="sr-only">{tt('sortSmart')}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="smart">{tt('sortSmart')}</option>
              <option value="due">{tt('sortDue')}</option>
              <option value="new">{tt('sortNew')}</option>
            </select>
          </label>
        )}
      </span>
    </div>
  );
  const GROUPS: GroupKey[] = ['none', 'tag', 'list', 'type', 'status'];
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;

  // ── Screens ──
  const todayView = (
    <>
      <p className="todo-dayline">
        <span>{new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span>
        {todayAll.length > 0 && <span className="muted">{tt('nOfM', { n: doneToday, m: todayAll.length })}</span>}
      </p>
      {reminded.length > 0 && (
        <section className="todo-reminders">
          <h2>
            <Bell size={15} aria-hidden /> {tt('remindersTitle')}
            {reminded.length > 1 && (
              <button type="button" className="todo-link" onClick={() => update(reminded.map((r) => ({ id: r.id, day: today, remind_on: null })))}>
                {tt('pullAll')}
              </button>
            )}
          </h2>
          <ul className="todo-list">
            {reminded.map((r) =>
              row(r, {
                showRemind: true,
                action: (
                  <span className="todo-acts">
                    <button type="button" className="icon-btn sm" onClick={() => snooze(r)} aria-label={tt('snooze')} title={tt('snooze')}>
                      <AlarmClock size={18} />
                    </button>
                    {toTodayBtn(r)}
                  </span>
                ),
              }),
            )}
          </ul>
        </section>
      )}
      {todayList.length === 0 ? (
        <div className="todo-blank">
          <Sun size={40} strokeWidth={1.5} aria-hidden />
          <p>{tt('emptyToday')}</p>
          {pool.length > 0 && (
            <button type="button" className="btn sm" onClick={() => setTab('pool')}>
              <Inbox size={16} /> {tt('openPool', { n: pool.length })}
            </button>
          )}
        </div>
      ) : (
        <>
          {viewBar({ sort: true, groups: GROUPS })}
          {grouped(todayList)}
        </>
      )}
      {todayAll.length > 0 && doneToday === todayAll.length && <p className="todo-cheer">🏆 {tt('allDoneToday')}</p>}
    </>
  );

  const poolView = (
    <>
      {viewBar({
        sort: true,
        groups: GROUPS,
        children: (
          <span className="todo-chips">
            {(
              [
                ['all', tt('filterAll')],
                ['reminded', tt('filterReminded')],
                ['due', tt('filterDue')],
                ['blocked', tt('filterBlocked')],
              ] as [PoolFilter, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" className={`chip sm${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </span>
        ),
      })}
      {poolShown.length === 0 ? (
        <div className="todo-blank">
          <Inbox size={40} strokeWidth={1.5} aria-hidden />
          <p>{tt('emptyPool')}</p>
        </div>
      ) : (
        grouped(poolShown, (r) => ({ showRemind: true, action: toTodayBtn(r) }))
      )}
    </>
  );

  const questsView = quest ? (
    <>
      <div className="todo-quest-head">
        <button type="button" className="icon-btn" onClick={() => pickQuest(null)} aria-label={tt('allQuests')} title={tt('allQuests')}>
          <Back size={20} />
        </button>
        <button type="button" className="todo-quest-title" onClick={() => openTask(quest.id)}>
          <span className="tier">{tt('tier_purpose')}</span>
          <span dir="auto">{quest.title || tt('untitled')}</span>
        </button>
        <span className="todo-ring" style={{ '--p': progressOf(quest, all) } as React.CSSProperties}>
          {Math.round(progressOf(quest, all) * 100)}%
        </span>
      </div>
      <QuestMap
        purpose={quest}
        all={all}
        byId={byId}
        pal={pal}
        reduced={reduced}
        lang={lang}
        tt={tt}
        onOpen={openTask}
        onAdd={(p) => openNew({ root_id: p.id, day: null, title: '' })}
      />
    </>
  ) : (
    <>
      <form
        className="todo-newquest"
        onSubmit={async (e) => {
          e.preventDefault();
          const title = String(new FormData(e.currentTarget).get('purpose') ?? '').trim();
          if (!title) return;
          e.currentTarget.reset();
          const saved = await create({ title, day: null, type: 'planning', status: 'defined' });
          if (saved) pickQuest(saved.id);
        }}
      >
        <Flag size={18} aria-hidden />
        <input name="purpose" placeholder={tt('newPurpose')} aria-label={tt('newPurpose')} dir="auto" enterKeyHint="go" />
        <button type="submit" className="btn primary sm">
          {tt('startQuest')}
        </button>
      </form>
      {purposes.length === 0 ? (
        <div className="todo-blank">
          <Swords size={40} strokeWidth={1.5} aria-hidden />
          <p>{tt('questsEmpty')}</p>
          <p className="muted small">{tt('purposeHint')}</p>
        </div>
      ) : (
        <ul className="todo-quests">
          {purposes.map((p) => {
            const steps = stepsOf(p.id, all);
            const next = steps.find((s) => isOpen(s) && !blockers(s, byId).length);
            const pr = progressOf(p, all);
            return (
              <li key={p.id} className={`ty-${p.type}${isOpen(p) ? '' : ' is-closed'}`}>
                <button type="button" className="todo-quest-card" onClick={() => pickQuest(p.id)}>
                  <span className="todo-ring" style={{ '--p': pr } as React.CSSProperties}>
                    {Math.round(pr * 100)}%
                  </span>
                  <span className="todo-quest-txt">
                    <strong dir="auto">{p.title || tt('untitled')}</strong>
                    <span className="muted small">
                      {tt('stepsDone', { n: steps.filter((s) => !isOpen(s)).length, m: steps.length })}
                      {p.deadline && ` · ${tt('deadline')}: ${dayLabel(p.deadline, today, lang, tt)}`}
                    </span>
                    {next && (
                      <span className="todo-quest-next" dir="auto">
                        ▶ {next.title || tt('untitled')}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const lists = labelsIn(all, 'lists');
  const tags = labelsIn(all, 'tags');
  const labelTasks = label ? sortTasks(all.filter((r) => hasLabel(r[label.kind], label.name) && r.status !== 'quit'), sort, today, byId) : [];
  const listsView = label ? (
    <>
      <div className="todo-quest-head">
        <button type="button" className="icon-btn" onClick={() => setLabel(null)} aria-label={tt('allLists')} title={tt('allLists')}>
          <Back size={20} />
        </button>
        <h2 className="todo-label-title" dir="auto">
          {label.kind === 'tags' ? <Hash size={18} aria-hidden /> : <LayoutList size={18} aria-hidden />}
          {label.name}
        </h2>
        <span className="muted small">{tt('openN', { n: labelTasks.filter(isOpen).length })}</span>
      </div>
      {labelTasks.length > 0 && viewBar({ sort: true, groups: GROUPS })}
      {grouped(labelTasks, (r) => (r.day === today || !isOpen(r) ? {} : { showRemind: true, action: toTodayBtn(r) }), label.kind === 'lists' && group === 'list' ? 'tag' : group)}
    </>
  ) : (
    <>
      <section className="todo-sec-block">
        <h2 className="todo-group-h">{tt('listsTitle')}</h2>
        {lists.length === 0 ? (
          <p className="muted small">{tt('listsEmpty')}</p>
        ) : (
          <ul className="todo-lists">
            {lists.map((l) => {
              const items = all.filter((r) => hasLabel(r.lists, l.name) && r.status !== 'quit');
              const done = items.filter((r) => r.status === 'completed').length;
              return (
                <li key={l.name}>
                  <button type="button" className="todo-list-card" onClick={() => setLabel({ kind: 'lists', name: l.name })}>
                    <LayoutList size={18} aria-hidden />
                    <strong dir="auto">{l.name}</strong>
                    <span className="muted small">{tt('openN', { n: l.open })}</span>
                    <span className="todo-bar" style={{ '--p': items.length ? done / items.length : 0 } as React.CSSProperties} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="todo-sec-block">
        <h2 className="todo-group-h">{tt('tagsTitle')}</h2>
        {tags.length === 0 ? (
          <p className="muted small">{tt('tagsEmpty')}</p>
        ) : (
          <div className="todo-tagcloud">
            {tags.map((l) => (
              <button key={l.name} type="button" className="chip" onClick={() => setLabel({ kind: 'tags', name: l.name })} dir="auto">
                #{l.name} <span className="muted">{l.open}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const doneView =
    finished.length === 0 ? (
      <div className="todo-blank">
        <CheckCheck size={40} strokeWidth={1.5} aria-hidden />
        <p>{tt('emptyDone')}</p>
      </div>
    ) : (
      finished.map((g) => (
        <section key={g.day} className="todo-group">
          <h2 className="todo-group-h">
            {dayLabel(g.day, today, lang, tt)} <span className="muted">{g.items.length}</span>
          </h2>
          <ul className="todo-list">{g.items.map((r) => row(r))}</ul>
        </section>
      ))
    );

  const nav: { id: Tab; label: TKey; icon: typeof Sun; n?: number; dot?: boolean }[] = [
    { id: 'today', label: 'today', icon: Sun, n: todayAll.length - doneToday, dot: reminded.length > 0 },
    { id: 'pool', label: 'pool', icon: Inbox, n: pool.length },
    { id: 'quests', label: 'quests', icon: Swords, n: purposes.filter(isOpen).length },
    { id: 'lists', label: 'lists', icon: LayoutList },
    { id: 'done', label: 'done', icon: CheckCheck },
  ];
  const placeholder =
    tab === 'pool'
      ? tt('addPool')
      : tab === 'lists' && label
        ? tt('addToList', { list: `\u2068${label.kind === 'tags' ? '#' : ''}${label.name}\u2069` })
        : tab === 'quests' && quest
          ? tt('add_step')
          : tt('addToday');
  const canAdd = tab === 'today' || tab === 'pool' || (tab === 'lists' && !!label) || (tab === 'quests' && !!quest);

  return (
    <div className={`todo tab-${tab}`} ref={setRootEl}>
      <div className="todo-top">
        <Hud stats={stats} done={doneToday} total={todayAll.length} pal={pal} reduced={reduced} lang={lang} tt={tt} />
        {canAdd && (
          <form className="todo-add" onSubmit={quickAdd}>
            <Plus size={18} aria-hidden className="muted" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-describedby="todo-quick-hint"
              dir="auto"
              enterKeyHint="send"
            />
            {text && (
              <button type="button" className="icon-btn sm" onClick={() => setText('')} aria-label={tt('clear')}>
                <X size={16} />
              </button>
            )}
            <button type="button" className="icon-btn sm" onClick={() => openNew()} aria-label={tt('addDetails')} title={tt('addDetails')}>
              <SlidersHorizontal size={18} />
            </button>
            <span id="todo-quick-hint" className="sr-only">
              {tt('quickHint')}
            </span>
          </form>
        )}
        {canAdd && text.length > 0 && <p className="todo-hint" dir="ltr">{tt('quickHint')}</p>}
      </div>

      {leftovers.length > 0 && tab !== 'done' && (
        <button type="button" className="todo-banner" onClick={() => setReviewChoice(true)}>
          <AlarmClock size={18} aria-hidden />
          <span>{tt('leftovers', { n: leftovers.length })}</span>
          <span className="go">{tt('review')}</span>
        </button>
      )}

      <div className="todo-screen">
        {tab === 'today' && todayView}
        {tab === 'pool' && poolView}
        {tab === 'quests' && questsView}
        {tab === 'lists' && listsView}
        {tab === 'done' && doneView}
      </div>

      <nav className="todo-nav" aria-label={tt('sections')}>
        {nav.map(({ id, label: l, icon: Icon, n, dot }) => (
          <button key={id} type="button" className={tab === id ? 'on' : undefined} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span className="todo-nav-ic">
              <Icon size={21} aria-hidden />
              {!!n && <span className="todo-count">{n > 99 ? '99+' : n}</span>}
              {dot && !n && <span className="todo-dot" />}
            </span>
            <span className="todo-nav-l">{tt(l)}</span>
          </button>
        ))}
      </nav>

      <TaskSheet
        task={openId ? (byId.get(openId) ?? null) : null}
        draft={draft}
        all={all}
        byId={byId}
        today={today}
        lang={lang}
        onClose={closeSheet}
        onSave={(id, patch) => update([{ id, ...patch }])}
        onCreate={(d) => void create(d)}
        onDelete={remove}
        onOpen={openTask}
        onToggle={toggle}
        onAddChild={(r, title) => void create({ title, root_id: r.id })}
        onMoveStep={moveStep}
        onPlayQuest={(id) => {
          closeSheet();
          setTab('quests');
          pickQuest(id);
        }}
      />
      <ReviewSheet
        open={reviewOpen && !openId && !draft}
        leftovers={leftovers}
        byId={byId}
        today={today}
        lang={lang}
        reduced={reduced}
        onDecide={decide}
        onAll={decideAll}
        onClose={closeReview}
      />
      <FxLayer fx={fx} reduced={reduced} font={pal?.font ?? 'system-ui, sans-serif'} />
    </div>
  );
}
