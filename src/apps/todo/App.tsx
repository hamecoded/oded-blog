import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlarmClock,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Flag,
  GripVertical,
  Hash,
  Inbox,
  Layers,
  ListTodo,
  LockKeyhole,
  LockKeyholeOpen,
  SlidersHorizontal,
  Sun,
  Swords,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { errorText, useApp } from '../../lib/app';
import type { Todo, TodoDraft, TodoEvent, TodoEventDraft } from '../../lib/types';
import { sha256Hex, todoFields } from '../../lib/util';
import { FxLayer } from './FxLayer';
import { Fx } from './fx';
import { Hud } from './Hud';
import { useAppChrome, useHomeScreenApp, usePalette, useReducedMotion, useToday } from './hooks';
import {
  addDays,
  blockers,
  dayLabel,
  depthOf,
  descendants,
  groupTasks,
  isLeftover,
  isOpen,
  isoDay,
  isReminded,
  goalStage,
  isEventOnly,
  hasLabel,
  inTagOrder,
  positionBetween,
  tagsIn,
  tierOf,
  topicTasks,
  logFor,
  moved,
  foldOutline,
  nextLeaf,
  isGoal,
  nestTasks,
  parseQuick,
  progressOf,
  forget,
  recall,
  relink,
  reparent,
  remember,
  sortTasks,
  statsOf,
  stepsOf,
  xpFor,
  type GroupKey,
  type SortKey,
} from './model';
import { tagHue, TYPE_ICON, VEIL } from './look';
import { SelectMenu } from './SelectMenu';
import { PinSheet, type PinMode } from './PinSheet';
import { EventHead, EventPage, EventsList } from './Events';
import { useOutlineDrag, type Place } from './outlineDrag';
import { Picker } from './Picker';
import { QuestMap } from './QuestMap';
import { ReviewSheet, type Decision } from './ReviewSheet';
import { useTt, type TKey } from './strings';
import { TaskRow, type Origin } from './TaskRow';
import { HomeLink } from './HomeLink';
import { LevelsSheet } from './LevelsSheet';
import { UndoBar } from './UndoBar';
import { TaskSheet } from './TaskSheet';
import { TipLayer } from './TipLayer';

type Tab = 'today' | 'pool' | 'quests' | 'tags' | 'events' | 'done';
type PoolFilter = 'all' | 'reminded' | 'due' | 'blocked';
/** The journeys list: its order ('mine' is dragged by hand) and which ones it shows. */
type QuestSort = 'mine' | 'progress' | 'recent' | 'deadline' | 'name';
type QuestFilter = 'all' | 'active' | 'new' | 'done';
const QUEST_SORTS: QuestSort[] = ['mine', 'progress', 'recent', 'deadline', 'name'];
type Patch = TodoDraft & { id: string };

/** Several patches to the same task become one. */
function merge(list: Patch[]): Patch[] {
  const m = new Map<string, Patch>();
  list.forEach((p) => m.set(p.id, { ...m.get(p.id), ...p }));
  return [...m.values()];
}

const TABS: Tab[] = ['today', 'pool', 'quests', 'tags', 'events', 'done'];

/**
 * To-do, played as a game: a fresh list every day, XP and levels for finished tasks, and purposes played as
 * quests (steps along a road on a canvas, actions around each step). Tasks left open on an earlier day wait
 * for the morning debrief (keep today, or save to the pool after refining priority and setting a reminder);
 * pooled tasks come back on their reminder date. Every tag is a topic: its tasks, in their own order, in the Tags tab.
 */
export default function TodoApp() {
  const { user, prefs, toast, t } = useApp();
  const lang = prefs.uiLang;
  const tt = useTt();
  const today = useToday();
  useAppChrome();
  useHomeScreenApp(tt('homeName'));
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const pal = usePalette(rootEl);
  const reduced = useReducedMotion();
  const [fx] = useState(() => new Fx());

  const [rows, setRows] = useState<Todo[] | null>(null);
  const [missing, setMissing] = useState(false);
  /** The user's events (the Events tab); `eventsMissing`: the live table isn't there yet. */
  const [events, setEvents] = useState<TodoEvent[]>([]);
  const [eventsMissing, setEventsMissing] = useState(false);
  /** The event open in the Events tab; null shows the list. */
  const [eventId, setEventId] = useState<string | null>(null);
  // ── Sensitive items: blurred until the PIN is entered; then shown until the lock button is pressed. ──
  /** The PIN's hash (sha256 of user id + PIN); undefined while loading, null when none is set. */
  const [pinHash, setPinHash] = useState<string | null | undefined>(undefined);
  /**
   * Unlocked stays so (through refreshes) until the lock button: remembered as the PIN hash it was unlocked with,
   * so a PIN changed on another device locks this one again.
   */
  const [unlockedWith, setUnlockedWith] = useState(() => recall('unlocked'));
  const unlocked = !!pinHash && unlockedWith === pinHash;
  const setUnlocked = (on: boolean) => {
    const v = on && pinHash ? pinHash : null;
    setUnlockedWith(v);
    if (v) remember('unlocked', v);
    else forget('unlocked');
  };
  /** The PIN sheet, and what to do once it's done (open the item that asked for it). */
  const [pinAsk, setPinAsk] = useState<{ mode: PinMode; then?: () => void } | null>(null);
  useEffect(() => {
    if (!user) return;
    api
      .getTodoSettings()
      .then((s) => setPinHash(s.pin_hash))
      .catch(() => setPinHash(null));
  }, [user]);

  // A link can ask for a tab (the blog's top bar "Tags" link opens the Tags tab): `state.todoTab`.
  const loc = useLocation();
  const askedTab = (loc.state as { todoTab?: Tab } | null)?.todoTab;
  const [tab, setTabState] = useState<Tab>(() => {
    // The address keeps the tab (?tab=pool), so a refresh comes back to it even where the browser keeps no storage.
    // It comes first: a browser keeps a link's state through a refresh, so an old "open Tags" would win otherwise.
    const inUrl = new URLSearchParams(window.location.search).get('tab');
    if (inUrl && TABS.includes(inUrl as Tab)) return inUrl as Tab;
    if (askedTab && TABS.includes(askedTab)) return askedTab;
    // A plain /apps/todo (opening the app) always starts on Today.
    return 'today';
  });
  const [sort, setSortState] = useState<SortKey>(() => (recall('sort') as SortKey | null) ?? 'smart');
  const [group, setGroupState] = useState<GroupKey>(() => {
    const v = recall('group') as GroupKey | 'list' | null;
    return !v || v === 'list' ? 'none' : v; // grouping by list went with the lists
  });
  /** The pool's own grouping (Today's is `group`): by tag unless changed, so a tag's tasks sit together. */
  const [poolGroup, setPoolGroupState] = useState<GroupKey>(() => (recall('poolGroup') as GroupKey | null) ?? 'tag');
  const [filter, setFilter] = useState<PoolFilter>('all');
  /** Groups folded away in a grouped list (`<grouping>:<group id>`), remembered. */
  const [shutGroups, setShutGroups] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(recall('shutGroups') ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggleGroup = (key: string) =>
    setShutGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      remember('shutGroups', JSON.stringify([...next]));
      return next;
    });
  const [questSort, setQuestSortState] = useState<QuestSort>(() => {
    const v = recall('questSort') as QuestSort | null;
    return v && QUEST_SORTS.includes(v) ? v : 'mine';
  });
  const [questFilter, setQuestFilter] = useState<QuestFilter>('all');
  /** A tag the journeys list is narrowed to ('' = every journey). */
  const [questTag, setQuestTag] = useState('');
  const [text, setText] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TodoDraft | null>(null);
  /** The journey open in the Journeys tab; null shows the list (where the tab always starts). */
  const [questId, setQuestId] = useState<string | null>(null);
  /** The tag open in the Tags tab (a topic); null shows every topic. */
  const [topic, setTopic] = useState<string | null>(null);
  useEffect(() => {
    // Written into the address in place (no new history entry, and the router isn't told: nothing to re-render).
    const u = new URL(window.location.href);
    // The router keeps a link's state under `usr`; the "open this tab" in it is used up once the tab is open.
    const state = window.history.state as { usr?: { todoTab?: string } } | null;
    const used = !!state?.usr?.todoTab;
    if (u.searchParams.get('tab') !== tab || used) {
      u.searchParams.set('tab', tab);
      window.history.replaceState(used ? { ...state, usr: { ...state!.usr, todoTab: undefined } } : state, '', u);
    }
  }, [tab]);
  // Following that link while the app is already open: a new navigation (its own key) switches the tab, to its start.
  const [seenNav, setSeenNav] = useState(loc.key);
  if (loc.key !== seenNav) {
    setSeenNav(loc.key);
    // A link asking for a tab, or (back / forward) the tab the address says.
    const inUrl = new URLSearchParams(loc.search).get('tab') as Tab | null;
    const next = askedTab && TABS.includes(askedTab) ? askedTab : inUrl && TABS.includes(inUrl) ? inUrl : null;
    if (next && (next !== tab || askedTab)) {
      setTabState(next);
      if (next === 'tags') setTopic(null);
      if (next === 'quests') setQuestId(null);
      if (next === 'events') setEventId(null);
    }
  }
  /** null: the review opens by itself once a day when there are leftovers. */
  const [reviewChoice, setReviewChoice] = useState<boolean | null>(null);
  const [promptedOn, setPromptedOn] = useState(() => recall('reviewed'));
  const [levelsOpen, setLevelsOpen] = useState(false);
  /** The last completion (or quit) that can still be taken back; replaced by the next one. */
  const [undo, setUndo] = useState<{ key: number; text: 'undoDone' | 'undoQuit' | 'undoReopen'; task: Todo; patches: Patch[] } | null>(null);
  /** Pool tasks folded shut (their subtasks hidden); kept per browser. */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(recall('collapsed') ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggleFold = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      remember('collapsed', JSON.stringify([...n].filter((x) => rows?.some((r) => r.id === x) ?? true)));
      return n;
    });

  const fail = (e: unknown) => {
    toast(errorText(e, t));
    void reload();
  };
  const reloadEvents = () =>
    api
      .listTodoEvents()
      .then((r) => {
        setEventsMissing(false);
        setEvents(r);
      })
      .catch((e) => {
        if (e instanceof Error && e.message === 'events/missing') setEventsMissing(true);
        else toast(errorText(e, t));
      });
  const reload = () => {
    void reloadEvents();
    return api
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
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), [user?.id]);

  const all = useMemo(() => rows ?? [], [rows]);
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all]);
  const stats = useMemo(() => statsOf(all, today), [all, today]);
  /** Every task but those kept on their event only (see `event_only`): what Today, the pool, tags, journeys and done show. */
  const pub = useMemo(() => all.filter((r) => !isEventOnly(r, byId)), [all, byId]);
  /** Tasks that have subtasks. They never sit on Today themselves (nor come up as leftovers): only their subtasks do. */
  const parents = useMemo(
    () => new Set([...all.map((r) => r.root_id).filter((x): x is string => !!x), ...all.filter((r) => r.goal && !r.root_id).map((r) => r.id)]),
    [all],
  );
  const leftovers = useMemo(
    () =>
      pub
        .filter((r) => isLeftover(r, today) && !parents.has(r.id))
        .sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || b.priority - a.priority),
    [pub, today, parents],
  );
  const todayAll = useMemo(() => pub.filter((r) => r.day === today && r.status !== 'quit' && !parents.has(r.id)), [pub, today, parents]);
  const todayList = useMemo(() => sortTasks(todayAll, sort, today, byId), [todayAll, sort, today, byId]);
  const reminded = useMemo(() => sortTasks(pub.filter((r) => isReminded(r, today)), 'smart', today, byId), [pub, today, byId]);
  // A goal with no steps yet is only a name on the journeys page: it joins the pool once it has something to do.
  const pool = useMemo(() => pub.filter((r) => !r.day && isOpen(r) && !(r.goal && !all.some((x) => x.root_id === r.id))), [pub, all]);
  const poolShown = useMemo(() => {
    const f = pool.filter((r) =>
      filter === 'reminded' ? isReminded(r, today) : filter === 'due' ? !!(r.due_date || r.deadline) : filter === 'blocked' ? blockers(r, byId).length > 0 || r.status === 'blocked' : true,
    );
    return sortTasks(f, sort, today, byId);
  }, [pool, filter, sort, today, byId]);
  const purposes = useMemo(() => {
    const list = pub.filter((r) => isGoal(r, all) || (r.id === questId && !r.root_id));
    return list.sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || b.updated_at.localeCompare(a.updated_at));
  }, [pub, all, questId]);
  const quest = questId ? byId.get(questId) : undefined;
  /** The journeys list as chosen: filtered by stage and tag, then in the chosen order. */
  const questsShown = useMemo(() => {
    const lastActive = (p: Todo) => [p, ...descendants(p.id, all)].reduce((m, t) => (t.updated_at > m ? t.updated_at : m), '');
    // A tag matches a journey that carries it or has a step or action that does.
    const tagged = (p: Todo) => [p, ...descendants(p.id, all)].some((t) => hasLabel(t.tags, questTag));
    const list = purposes.filter((p) => (questFilter === 'all' || goalStage(p, all) === questFilter) && (!questTag || tagged(p)));
    const by: Record<QuestSort, (a: Todo, b: Todo) => number> = {
      mine: (a, b) => a.position - b.position,
      progress: (a, b) => progressOf(b, all) - progressOf(a, all),
      recent: (a, b) => lastActive(b).localeCompare(lastActive(a)),
      deadline: (a, b) => (a.deadline ?? a.due_date ?? '9999').localeCompare(b.deadline ?? b.due_date ?? '9999'),
      name: (a, b) => a.title.localeCompare(b.title, lang),
    };
    // Finished journeys go last except in your own order, which is exactly as dragged.
    return [...list].sort((a, b) => (questSort === 'mine' ? 0 : Number(!isOpen(a)) - Number(!isOpen(b))) || by[questSort](a, b));
  }, [purposes, questFilter, questTag, questSort, all, lang]);
  /** The tags in use across the journeys and everything under them, for the tag filter. */
  const questTags = tagsIn(purposes.flatMap((p) => [p, ...descendants(p.id, all)])).map((l) => l.name);
  const setQuestSort = (v: QuestSort) => {
    setQuestSortState(v);
    remember('questSort', v);
  };
  const finished = useMemo(() => {
    // A goal with no steps yet has nothing to show for it, so it stays out of the archive.
    const list = pub.filter((r) => !isOpen(r) && !(r.goal && !all.some((x) => x.root_id === r.id))).sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at));
    const groups: { day: string; items: Todo[] }[] = [];
    list.slice(0, 300).forEach((r) => {
      const d = isoDay(new Date(r.done_at ?? r.updated_at));
      const g = groups.at(-1);
      if (g?.day === d) g.items.push(r);
      else groups.push({ day: d, items: [r] });
    });
    return groups;
  }, [pub, all]);

  const reviewOpen = leftovers.length > 0 && (reviewChoice ?? promptedOn !== today);
  const closeReview = () => {
    setReviewChoice(false);
    setPromptedOn(today);
    remember('reviewed', today);
  };

  const setTab = (v: Tab) => {
    setTabState(v);
    // The Journeys tab always opens on the list of journeys (a journey is picked from there).
    if (v === 'quests') setQuestId(null);
    if (v === 'tags') setTopic(null); // likewise the Tags tab opens on the topics
    if (v === 'events') setEventId(null); // and the Events tab on the list of events
    window.scrollTo({ top: 0 });
  };
  const setSort = (v: SortKey) => {
    setSortState(v);
    remember('sort', v);
  };
  const setPoolGroup = (v: GroupKey) => {
    setPoolGroupState(v);
    remember('poolGroup', v);
  };
  const setGroup = (v: GroupKey) => {
    setGroupState(v);
    remember('group', v);
  };
  // ── Events: changed here at once, then saved; on failure they reload. ──
  const saveEvent = (id: string, patch: TodoEventDraft) => {
    setEvents((es) => es.map((e) => (e.id === id ? { ...e, ...patch, updated_at: new Date().toISOString() } : e)));
    api.saveTodoEvent({ id, ...patch }).catch((e) => {
      toast(errorText(e, t));
      void reloadEvents();
    });
  };
  const createEvent = async (d: TodoEventDraft) => {
    try {
      const saved = await api.saveTodoEvent(d);
      setEvents((es) => [...es, saved]);
      setEventId(saved.id);
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast(errorText(e, t));
    }
  };
  /** Deleting an event keeps its tasks, without it (as "on delete set null" does in the database). */
  const deleteEvent = (id: string) => {
    setEvents((es) => es.filter((e) => e.id !== id));
    setRows((rs) => rs?.map((r) => (r.event_id === id ? { ...r, event_id: null } : r)) ?? rs);
    setEventId(null);
    toast(tt('eventDeleted'));
    api.deleteTodoEvents([id]).catch((e) => {
      toast(errorText(e, t));
      void reload();
    });
  };
  /** An item becomes a real task for the event, in the pool; it leaves the event's items. */
  const promoteItem = async (ev: TodoEvent, itemId: string) => {
    const item = ev.items.find((i) => i.id === itemId);
    if (!item) return;
    const saved = await create({ title: item.text, day: null, event_id: ev.id });
    if (!saved) return;
    saveEvent(ev.id, { items: ev.items.filter((i) => i.id !== itemId) });
    toast(tt('eventPromoted', { title: item.text }));
  };
  const pickQuest = (id: string | null) => {
    const go = () => {
      setQuestId(id);
      window.scrollTo({ top: 0 });
    };
    const q = id ? byId.get(id) : undefined;
    if (q && !unlocked && q.sensitive) setPinAsk({ mode: pinHash ? 'unlock' : 'set', then: go });
    else go();
  };

  // ── Changes: shown at once, then saved; on failure the list reloads. Stage and day moves are logged. ──
  /** `quiet`: an undo putting tasks back as they were, so nothing is added to their log. */
  const update = (list: Patch[], quiet = false) => {
    const now = new Date().toISOString();
    const ps = merge(list).map((p) => {
      const before = byId.get(p.id);
      const entries = before && !quiet ? logFor(before, p, now) : [];
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
    // A task on a day list that gets its first subtask hands its place to it: parents never sit on Today.
    const handOver = parent?.day && !last ? parent.day : null;
    const full: TodoDraft = {
      ...(parent ? { day: null, priority: parent.priority, urgency: parent.urgency, tags: parent.tags } : {}),
      ...d,
      ...(handOver ? { day: handOver } : {}),
      prev_id: parent ? (last?.id ?? null) : d.prev_id,
      log: [{ at: new Date().toISOString(), kind: 'created' }],
    };
    try {
      const saved = await api.saveTodo(full);
      setRows((rs) => [...(rs ?? []), saved]);
      if (last) update([{ id: last.id, next_id: saved.id }]);
      if (handOver && parent) update([{ id: parent.id, day: null }]);
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
  /** Offers, for a few seconds, to put tasks back exactly as they were (stage, day list, log). */
  const offerUndo = (text: 'undoDone' | 'undoQuit' | 'undoReopen', task: Todo) =>
    setUndo({ key: Date.now(), text, task, patches: [{ id: task.id, status: task.status, day: task.day, log: task.log }] });
  const toggle = (task: Todo, from?: Origin) => {
    if (isOpen(task)) {
      update([{ id: task.id, status: 'completed' }]);
      celebrate(task, from);
      offerUndo('undoDone', task);
    } else {
      update([{ id: task.id, status: 'inprogress', day: task.day && task.day < today ? today : task.day }]);
      // Unticked by mistake (in the Done list, say): the same undo puts it back as it was.
      offerUndo('undoReopen', task);
    }
  };
  /**
   * Puts a task on today's list and returns it. A task with subtasks never goes there itself: its next subtask to
   * work on does (null when there's none left).
   */
  const toToday = (task: Todo): Todo | null => {
    const target = parents.has(task.id) ? nextLeaf(task, all, byId) : task;
    if (!target) return null;
    const patches: Patch[] = [{ id: target.id, day: today, remind_on: target.remind_on && target.remind_on <= today ? null : target.remind_on }];
    // The parent's own reminder has done its job once its next step is on Today.
    if (target !== task && task.remind_on && task.remind_on <= today) patches.push({ id: task.id, remind_on: null });
    update(patches);
    return target;
  };
  const snooze = (task: Todo) => update([{ id: task.id, remind_on: addDays(today, 1) }]);
  const reorder = (root: Todo, from: number, to: number) => {
    const order = stepsOf(root.id, all);
    if (from === to || to < 0 || to >= order.length) return;
    update(relink(moved(order, from, to)));
  };
  /** Puts a step right before or after one of its siblings (a drop in the pool's outline). */
  const placeStep = (id: string, place: Place) => {
    const task = byId.get(id);
    if (!task?.root_id) return;
    const order = stepsOf(task.root_id, all).filter((s) => s.id !== id);
    const at = 'before' in place ? order.findIndex((s) => s.id === place.before) : order.findIndex((s) => s.id === place.after) + 1;
    if (at < 0) return;
    order.splice(at, 0, task);
    update(relink(order));
  };
  /** In the pool, a step's siblings that are shown there too, in their order. */
  const poolSiblings = (id: string) => {
    const task = byId.get(id);
    if (!task?.root_id) return [];
    const shown = new Set(poolShown.map((r) => r.id));
    return stepsOf(task.root_id, all)
      .filter((s) => shown.has(s.id))
      .map((s) => s.id);
  };
  const outline = useOutlineDrag(poolSiblings, placeStep);
  /** The open topic's open tasks, top-level ones in the topic's order (its outline nests the rest under them). */
  const topicOpenOf = () => (topic ? inTagOrder(topicTasks(pub, topic).filter(isOpen)) : []);
  /**
   * What a dragged row in a topic moves among: a step whose parent is shown too stays among its shown siblings
   * (as in the pool); a top-level row moves among the topic's top-level rows.
   */
  const topicSiblings = (id: string) => {
    const open = topicOpenOf();
    const shown = new Set(open.map((r) => r.id));
    const task = byId.get(id);
    if (task?.root_id && shown.has(task.root_id))
      return stepsOf(task.root_id, all)
        .filter((s) => shown.has(s.id))
        .map((s) => s.id);
    return open.filter((r) => !r.root_id || !shown.has(r.root_id)).map((r) => r.id);
  };
  /** A drop in a topic: a step is relinked among its siblings; a top-level task takes a `position` between its neighbours. */
  const placeInTopic = (id: string, place: Place) => {
    const task = byId.get(id);
    const shown = new Set(topicOpenOf().map((r) => r.id));
    if (task?.root_id && shown.has(task.root_id)) return placeStep(id, place);
    const order = topicSiblings(id)
      .filter((x) => x !== id)
      .map((x) => byId.get(x)!);
    const at = 'before' in place ? order.findIndex((r) => r.id === place.before) : order.findIndex((r) => r.id === place.after) + 1;
    if (at < 0) return;
    update([{ id, position: positionBetween(order[at - 1], order[at]) }], true);
  };
  const topicDrag = useOutlineDrag(topicSiblings, placeInTopic);
  /** Journeys in your own order: a drop gives the journey a `position` between its new neighbours in the list. */
  const questIds = () => questsShown.map((p) => p.id);
  const placeQuest = (id: string, place: Place) => {
    const order = questsShown.filter((p) => p.id !== id);
    const at = 'before' in place ? order.findIndex((r) => r.id === place.before) : order.findIndex((r) => r.id === place.after) + 1;
    if (at < 0) return;
    update([{ id, position: positionBetween(order[at - 1], order[at]) }], true);
  };
  const questDrag = useOutlineDrag(questIds, placeQuest);
  const canDragQuests = questSort === 'mine' && questsShown.length > 1;
  /**
   * Makes a task a goal (a journey): out of its parent if it has one (taking its own subtasks along) and off the
   * day lists. `false` takes the mark off again (a goal that already has steps stays one, by having them).
   */
  const setGoal = (task: Todo, on: boolean) => {
    if (!on) {
      update([{ id: task.id, goal: false }]);
      return toast(tt('goalRemoved'));
    }
    update([...(task.root_id ? reparent(task, null, all) : []), { id: task.id, goal: true, day: null }]);
    toast(tt('promoted', { title: task.title || tt('untitled') }));
  };
  const moveUnder = (task: Todo, parentId: string | null) => {
    if ((task.root_id ?? null) === parentId) return;
    const p0 = parentId ? byId.get(parentId) : undefined;
    // Its new parent can't stay on a day list (parents never sit on Today): the moved task takes that place.
    update([...reparent(task, parentId, all), ...(p0?.day ? [{ id: p0.id, day: null }, ...(task.day ? [] : [{ id: task.id, day: p0.day }])] : [])]);
    const p = parentId ? byId.get(parentId) : undefined;
    toast(p ? tt('movedUnder', { title: p.title || tt('untitled') }) : tt('movedOut'));
  };
  const decide = (task: Todo, d: Decision, refine: TodoDraft) => {
    if (d === 'done') {
      update([{ id: task.id, status: 'completed' }]);
      celebrate(task);
      offerUndo('undoDone', task);
    } else if (d === 'drop') {
      update([{ id: task.id, status: 'quit' }]);
      offerUndo('undoQuit', task);
    }
    else update([{ id: task.id, ...refine, day: d === 'today' ? today : null }]);
  };
  const decideAll = (d: 'today' | 'pool') => {
    update(leftovers.map((r) => ({ id: r.id, day: d === 'today' ? today : null })));
    closeReview();
  };

  /** Where a new task goes from the current screen. */
  const placeOf = (): TodoDraft => {
    if (tab === 'pool') return { day: null };
    if (tab === 'tags' && topic) return { day: null, tags: [topic] };
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
    });
  };
  const openNew = (extra?: TodoDraft) => {
    setOpenId(null);
    const q = parseQuick(text);
    setDraft({ ...placeOf(), ...(q.title ? q : {}), ...extra });
    setText('');
  };
  // ── Sensitive items ──
  /** The top-level task a task belongs to (itself when it's top-level): its `sensitive` covers all under it. */
  const rootOf = (t: Todo) => {
    let r = t;
    const seen = new Set<string>();
    while (r.root_id && !seen.has(r.id)) {
      seen.add(r.id);
      const up = byId.get(r.root_id);
      if (!up) break;
      r = up;
    }
    return r;
  };
  const isSensitive = (t: Todo) => rootOf(t).sensitive;
  /** Blurred right now: sensitive, and the PIN not entered (or locked again). */
  const isVeiled = (t: Todo) => !unlocked && isSensitive(t);
  const eventVeiled = (e: TodoEvent) => !unlocked && e.sensitive;
  /**
   * An outline with locked items shut: what's under a blurred item isn't listed at all (not even as dots, which
   * would tell how much is there), and the blurred item itself has nothing to fold.
   */
  const shutLocked = <R extends { task: Todo; level: number; kids?: number; hidden?: number }>(rows: R[]): R[] =>
    rows.filter((x) => !(x.level > 0 && isVeiled(x.task))).map((x) => (x.level === 0 && isVeiled(x.task) && x.kids ? { ...x, kids: 0, hidden: 0 } : x));
  /** A flat list with one blurred row per locked item, however many of its tasks are in it. */
  const oneLockedEach = (list: Todo[]) => {
    const seen = new Set<string>();
    return list.filter((r) => {
      if (!isVeiled(r)) return true;
      const id = rootOf(r).id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const hashPin = (pin: string) => sha256Hex(`${user?.id ?? ''}:${pin}`);
  /** Asks for the PIN (or to choose one, when there's none yet), then does `then`. */
  const askPin = (then?: () => void) => setPinAsk({ mode: pinHash ? 'unlock' : 'set', then });
  /** Does `go` now, or after the PIN when the item is blurred. `go` must not ask again (it runs before the re-render). */
  const guard = (veiled: boolean, go: () => void) => (veiled ? askPin(go) : go());
  /** Blurs the sensitive items again; whatever sensitive is open closes. `also` counts as sensitive too (just marked). */
  const lock = (quiet = false, also?: { task?: string; event?: string }) => {
    setUnlocked(false);
    const open = openId ? byId.get(openId) : undefined;
    if (open && (isSensitive(open) || rootOf(open).id === also?.task)) closeSheetRaw();
    const q = questId ? byId.get(questId) : undefined;
    if (q && (isSensitive(q) || q.id === also?.task)) setQuestId(null);
    if (eventId && (events.find((e) => e.id === eventId)?.sensitive || eventId === also?.event)) setEventId(null);
    if (!quiet) toast(tt('locked'));
  };
  /** Marks a top-level task sensitive (choosing a PIN first if there's none yet), or takes the mark off. */
  const setSensitive = (task: Todo, on: boolean) => {
    const apply = () => {
      update([{ id: task.id, sensitive: on }]);
      toast(tt(on ? 'sensitiveOn' : 'sensitiveOff', { title: task.title || tt('untitled') }));
      // Marked sensitive: it's hidden at once (the PIN is needed to see it again), and its form closes.
      if (on) lock(true, { task: task.id });
    };
    if (on && !pinHash) setPinAsk({ mode: 'set', then: apply });
    else apply();
  };
  const setEventSensitive = (ev: TodoEvent, on: boolean) => {
    const apply = () => {
      saveEvent(ev.id, { sensitive: on });
      toast(tt(on ? 'sensitiveOn' : 'sensitiveOff', { title: ev.title || tt('untitled') }));
      if (on) lock(true, { event: ev.id });
    };
    if (on && !pinHash) setPinAsk({ mode: 'set', then: apply });
    else apply();
  };
  const closeSheetRaw = () => {
    setOpenId(null);
    setDraft(null);
  };
  const openTask = (id: string) => {
    const t = byId.get(id);
    guard(!!t && isVeiled(t), () => {
      setDraft(null);
      setOpenId(id);
    });
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
  /** The name of a task's event, for its row's chip; none on that event's own page. */
  const eventNameOf = (task: Todo) => {
    if (!task.event_id || (tab === 'events' && task.event_id === eventId)) return undefined;
    const ev = events.find((e) => e.id === task.event_id);
    if (!ev) return undefined;
    return eventVeiled(ev) ? VEIL : ev.title || tt('untitled');
  };
  const row = (task: Todo, extra?: { showRemind?: boolean; action?: ReactNode; hideRoot?: boolean }, level = 0) => {
    const look = level ? outline.rowLook(task.id) : {};
    return (
      <TaskRow
        key={task.id}
        task={task}
        all={all}
        byId={byId}
        today={today}
        lang={lang}
        eventName={eventNameOf(task)}
        veiled={isVeiled(task)}
        onToggle={(x, from) => guard(isVeiled(x), () => toggle(x, from))}
        onOpen={(x) => openTask(x.id)}
        {...extra}
        {...(level
          ? {
              hideRoot: true,
              className: `is-nested${look.className ? ` ${look.className}` : ''}`,
              rowStyle: { '--lvl': level, ...look.rowStyle } as React.CSSProperties,
            }
          : {})}
      />
    );
  };
  /** The handle a nested pool row is dragged by (arrow keys move it too). */
  const gripFor = (r: Todo) => (
    <button type="button" className="icon-btn sm todo-grip" aria-label={tt('dragToReorder')} data-tip={tt('tipGrip')} {...outline.grip(r.id)}>
      <GripVertical size={18} />
    </button>
  );
  /**
   * Moves a task onto today's list: a labelled button, and a toast saying where it went. A task with subtasks has
   * none: it never goes on Today itself (its subtasks have their own buttons).
   */
  const toTodayBtn = (r: Todo) =>
    parents.has(r.id) ? null : (
    <button
      type="button"
      className="todo-today-btn"
      onClick={() => {
        const moved = toToday(r);
        toast(moved ? tt('movedToToday', { title: moved.title || tt('untitled') }) : tt('nothingLeft'));
      }}
      aria-label={tt('toToday')}
      data-tip={tt('toToday')}
    >
      <Sun size={15} aria-hidden />
      {tt('toTodayShort')}
    </button>
  );
  /** Sends a task on today's list back to the pool. */
  const toPoolBtn = (r: Todo) => (
    <button
      type="button"
      className="todo-today-btn to-pool"
      onClick={() => {
        update([{ id: r.id, day: null }]);
        toast(tt('movedToPool', { title: r.title || tt('untitled') }));
      }}
      aria-label={tt('toPool')}
      data-tip={tt('toPool')}
    >
      <Inbox size={15} aria-hidden />
      {tt('toPoolShort')}
    </button>
  );
  /**
   * A list split by the chosen grouping; with `nest`, steps sit indented under their parent within a group. A group's
   * heading folds it away (remembered per grouping and group: `shutGroups`).
   */
  const grouped = (list: Todo[], rowExtra?: (r: Todo) => { showRemind?: boolean; action?: ReactNode }, by: GroupKey = group, nest = false) =>
    groupTasks(
      list,
      by,
      tt,
      nest ? (t) => (t.root_id ? rootOf(t).tags : t.tags) : undefined,
      // In the pool by tag, goals come first, each with its steps; then the loose tasks by their tags.
      nest && by === 'tag' ? { id: '*goals', label: tt('goals'), has: (t) => isGoal(rootOf(t), all) } : undefined,
    ).map((g) => {
      const key = `${by}:${g.id}`;
      const shut = !!g.label && shutGroups.has(key);
      return (
        <section key={g.id || '-'} className={`todo-group${shut ? ' is-shut' : ''}`}>
          {shut && (
            // Folded: the group as one row, looking like the tasks around it; tapping it opens the group again.
            <ul className="todo-list">
              <li
                className={`todo-row todo-group-row${g.id === '*goals' ? ' is-goals' : ''}`}
                style={by === 'tag' && g.id && g.id !== '*goals' ? ({ '--h': tagHue(g.id) } as React.CSSProperties) : undefined}
              >
                <button type="button" className="todo-group-row-main" onClick={() => toggleGroup(key)} aria-expanded={false} dir="auto">
                  <span className="todo-group-row-icon" aria-hidden>
                    {g.id === '*goals' ? <Flag size={18} /> : by === 'tag' && g.id ? <Hash size={18} /> : <Layers size={18} />}
                  </span>
                  <span className="todo-group-row-name">{g.id === '*goals' || !(by === 'tag' && g.id) ? g.label : g.label.replace(/^#/, '')}</span>
                  <span className="todo-group-row-n">{g.items.length === 1 ? tt('groupItem1') : tt('groupItems', { n: g.items.length })}</span>
                  <ChevronDown size={18} aria-hidden className="todo-group-chev" />
                </button>
              </li>
            </ul>
          )}
          {g.label && !shut && (
            <h2 className="todo-group-h" dir="auto">
              <button type="button" className="todo-group-toggle" onClick={() => toggleGroup(key)} aria-expanded={!shut}>
                <ChevronDown size={15} aria-hidden className="todo-group-chev" />
                {g.label} <span className="muted">{g.items.length}</span>
              </button>
            </h2>
          )}
          {!shut && (
            <ul className={`todo-list${nest ? ' is-outline' : ''}${nest && outline.dragging ? ' is-sorting' : ''}`}>
              {nest
                ? shutLocked(foldOutline(nestTasks(g.items, all), collapsed)).map(({ task: r, level, kids, hidden }) => {
                    const extra = rowExtra?.(r);
                    if (!level && !kids) return row(r, extra, level);
                    const shut = hidden > 0;
                    const action = (
                      <span className="todo-acts">
                        {kids > 0 && (
                          <button
                            type="button"
                            className={`todo-fold-btn${shut ? ' is-shut' : ''}`}
                            onClick={() => toggleFold(r.id)}
                            aria-expanded={!shut}
                            aria-label={shut ? tt('expandN', { n: hidden }) : tt('collapse')}
                            data-tip={shut ? tt('expandN', { n: hidden }) : tt('collapse')}
                          >
                            <ChevronDown size={16} aria-hidden />
                            {shut && <span>{hidden}</span>}
                          </button>
                        )}
                        {level > 0 && gripFor(r)}
                        {extra?.action}
                      </span>
                    );
                    return row(r, { ...extra, action }, level);
                  })
                : g.items.map((r) => row(r, rowExtra?.(r)))}
            </ul>
          )}
        </section>
      );
    });
  /** `grouping`: a view with its own grouping (the pool's); else Today's `group`. */
  const viewBar = (opts: { sort?: boolean; groups?: GroupKey[]; grouping?: [GroupKey, (v: GroupKey) => void]; children?: ReactNode; extra?: ReactNode }) => (
    <div className="todo-viewbar">
      {opts.children}
      <span className="todo-viewbar-end">
        {opts.extra}
        {opts.groups && (
          <Picker
            label={tt('groupBy')}
            icon={<Layers size={15} aria-hidden />}
            value={opts.grouping?.[0] ?? group}
            options={opts.groups.map((g) => ({ value: g, label: tt(`group_${g}`) }))}
            onChange={opts.grouping?.[1] ?? setGroup}
          />
        )}
        {opts.sort && (
          <Picker
            label={tt('sortBy')}
            icon={<ArrowDownUp size={15} aria-hidden />}
            value={sort}
            options={[
              { value: 'smart' as SortKey, label: tt('sortSmart') },
              { value: 'due' as SortKey, label: tt('sortDue') },
              { value: 'new' as SortKey, label: tt('sortNew') },
            ]}
            onChange={setSort}
          />
        )}
      </span>
    </div>
  );
  const GROUPS: GroupKey[] = ['none', 'tag', 'type', 'status'];
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;
  /** Add fields read in the interface's direction (Hebrew: right to left), whatever language is typed into them. */
  const uiDir = lang === 'he' ? 'rtl' : 'ltr';

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
              <button type="button" className="todo-link" onClick={() => reminded.filter((r) => !parents.has(r.id)).forEach((r) => toToday(r))}>
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
                    <button type="button" className="icon-btn sm" onClick={() => snooze(r)} aria-label={tt('snooze')} data-tip={tt('snooze')}>
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
          {grouped(todayList, (r) => (isOpen(r) ? { action: toPoolBtn(r) } : {}))}
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
        grouping: [poolGroup, setPoolGroup],
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
        grouped(poolShown, (r) => ({ showRemind: true, action: toTodayBtn(r) }), poolGroup, true)
      )}
    </>
  );

  /** Inside a quest or a list, the row back out: shown at the very top, above the level bar. */
  const questHead = quest && (
    <div className="todo-quest-head">
      <button type="button" className="icon-btn" onClick={() => pickQuest(null)} aria-label={tt('allQuests')} data-tip={tt('allQuests')}>
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
  );
  const questsView = quest ? (
    <>
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
          const saved = await create({ title, day: null, type: 'planning', status: 'defined', goal: true });
          if (saved) pickQuest(saved.id);
        }}
      >
        <Flag size={18} aria-hidden />
        <input name="purpose" placeholder={tt('newPurpose')} aria-label={tt('newPurpose')} dir={uiDir} enterKeyHint="go" />
        <button type="submit" className="btn primary sm">
          {tt('startQuest')}
        </button>
      </form>
      {purposes.length > 1 &&
        viewBar({
          children: (
            <span className="todo-chips">
              {(['all', 'active', 'new', 'done'] as QuestFilter[]).map((k) => {
                const n = k === 'all' ? purposes.length : purposes.filter((p) => goalStage(p, all) === k).length;
                return (
                  <button key={k} type="button" className={`chip sm${questFilter === k ? ' on' : ''}`} aria-pressed={questFilter === k} onClick={() => setQuestFilter(k)}>
                    {tt(`qf_${k}`)} <span className="muted">{n}</span>
                  </button>
                );
              })}
            </span>
          ),
          extra: (
            <>
              {questTags.length > 0 && (
                <Picker
                  label={tt('qTag')}
                  icon={<Hash size={15} aria-hidden />}
                  value={questTag}
                  options={[{ value: '', label: tt('qTagAll') }, ...questTags.map((t) => ({ value: t, label: `#${t}` }))]}
                  onChange={setQuestTag}
                />
              )}
              <Picker
                label={tt('sortBy')}
                icon={<ArrowDownUp size={15} aria-hidden />}
                value={questSort}
                options={QUEST_SORTS.map((k) => ({ value: k, label: tt(`qsort_${k}`) }))}
                onChange={setQuestSort}
              />
            </>
          ),
        })}
      {purposes.length === 0 ? (
        <div className="todo-blank">
          <Swords size={40} strokeWidth={1.5} aria-hidden />
          <p>{tt('questsEmpty')}</p>
          <p className="muted small">{tt('purposeHint')}</p>
        </div>
      ) : questsShown.length === 0 ? (
        <p className="muted small todo-topic-empty">{tt('questsNone')}</p>
      ) : (
        <ul className={`todo-quests${canDragQuests ? ' is-sortable' : ''}${questDrag.dragging ? ' is-sorting' : ''}`}>
          {questsShown.map((p) => {
            const steps = stepsOf(p.id, all);
            const next = steps.find((s) => isOpen(s) && !blockers(s, byId).length);
            const pr = progressOf(p, all);
            const look = questDrag.rowLook(p.id);
            return (
              <li key={p.id} data-id={p.id} className={`ty-${p.type}${isOpen(p) ? '' : ' is-closed'}${look.className ? ` ${look.className}` : ''}`} style={look.rowStyle}>
                {canDragQuests && (
                  <button type="button" className="icon-btn sm todo-grip todo-quest-grip" aria-label={tt('dragToReorder')} data-tip={tt('tipQuestGrip')} {...questDrag.grip(p.id)}>
                    <GripVertical size={18} />
                  </button>
                )}
                <button type="button" className={`todo-quest-card${isVeiled(p) ? ' is-veiled' : ''}`} onClick={() => pickQuest(p.id)}>
                  <span className="todo-ring" style={{ '--p': pr } as React.CSSProperties}>
                    {isVeiled(p) ? <LockKeyhole size={18} aria-label={tt('veiled')} /> : `${Math.round(pr * 100)}%`}
                  </span>
                  {isVeiled(p) ? (
                    <span className="todo-quest-txt">
                      <strong className="todo-veil" aria-hidden>
                        {VEIL}
                      </strong>
                      <span className="muted small">{tt('tipVeiled')}</span>
                    </span>
                  ) : (
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
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const tags = tagsIn(pub);
  const topicAll = topic ? topicTasks(pub, topic) : [];
  const topicOpen = inTagOrder(topicAll.filter(isOpen));
  const topicDone = topicAll.filter((r) => !isOpen(r));
  // The topic as an outline, like the pool: steps under their parent, foldable.
  const topicRows = shutLocked(foldOutline(nestTasks(topicOpen, all), collapsed));
  /** Whether row `i` sits under a goal: its top-level row (the nearest level-0 row above it) is one. */
  const goalBlock = (i: number) => {
    let j = i;
    while (j > 0 && topicRows[j].level > 0) j--;
    return isGoal(topicRows[j].task, all);
  };
  const topicHead = topic && (
    <div className="todo-quest-head todo-topic-head" style={{ '--h': tagHue(topic) } as React.CSSProperties}>
      <button type="button" className="icon-btn" onClick={() => setTopic(null)} aria-label={tt('allTags')} data-tip={tt('allTags')}>
        <Back size={20} />
      </button>
      <h2 className="todo-label-title" dir="auto">
        <span className="todo-topic-hash" aria-hidden>
          #
        </span>
        {topic}
      </h2>
      <span className="muted small">{tt('openN', { n: topicOpen.length })}</span>
    </div>
  );
  /** Fold, grip, then "Today" (or a mark that it's on today already): the topic's own row actions. */
  const topicActs = (r: Todo, kids: number, hidden: number) => (
    <span className="todo-acts">
      {kids > 0 && (
        <button
          type="button"
          className={`todo-fold-btn${hidden ? ' is-shut' : ''}`}
          onClick={() => toggleFold(r.id)}
          aria-expanded={!hidden}
          aria-label={hidden ? tt('expandN', { n: hidden }) : tt('collapse')}
          data-tip={hidden ? tt('expandN', { n: hidden }) : tt('collapse')}
        >
          <ChevronDown size={16} aria-hidden />
          {hidden > 0 && <span>{hidden}</span>}
        </button>
      )}
      {topicSiblings(r.id).length > 1 && (
        <button type="button" className="icon-btn sm todo-grip" aria-label={tt('dragToReorder')} data-tip={tt('tipTagOrder')} {...topicDrag.grip(r.id)}>
          <GripVertical size={18} />
        </button>
      )}
      {r.day === today ? (
        <span className="todo-on-today" data-tip={tt('tipOnToday')}>
          <Sun size={14} aria-hidden />
          {tt('tagOnToday')}
        </span>
      ) : (
        toTodayBtn(r)
      )}
    </span>
  );
  // Open tasks not yet in the open topic, offered to bring in (a goal brings everything under it along).
  const inTopic = new Set(topicAll.map((r) => r.id));
  const topicCandidates = topic ? pub.filter((r) => isOpen(r) && !inTopic.has(r.id)) : [];
  const assignToTopic = (id: string) => {
    const t = byId.get(id);
    if (!t || !topic) return;
    update([{ id, tags: [...t.tags, topic] }]);
    toast(tt('assigned', { title: t.title || tt('untitled'), tag: `\u2068#${topic}\u2069` }));
  };
  const tagsView = topic ? (
    <>
      {topicCandidates.length > 0 && (
        <div className="todo-assign">
          <SelectMenu
            label={tt('assignExisting')}
            value={null}
            placeholder={tt('assignExisting')}
            searchPlaceholder={tt('searchTasks')}
            empty={tt('noMatches')}
            options={nestTasks(topicCandidates, all).map(({ task: o, level }) => {
              const Icon = TYPE_ICON[o.type];
              const goalish = isGoal(o, all);
              return {
                value: o.id,
                label: isVeiled(o) ? `${VEIL} (${tt('veiled')})` : o.title || tt('untitled'),
                level,
                icon: <Icon size={15} aria-hidden className={`todo-menu-ic ty-${o.type}`} />,
                note: goalish ? tt('assignWithSteps', { n: descendants(o.id, all).filter(isOpen).length }) : o.root_id ? tt(`tier_${tierOf(depthOf(o, byId))}`) : undefined,
              };
            })}
            onChange={assignToTopic}
          />
        </div>
      )}
      {topicOpen.length === 0 ? (
        <p className="muted small todo-topic-empty">{topicAll.length ? tt('tagNoOpen') : tt('tagFresh', { tag: `\u2068#${topic}\u2069` })}</p>
      ) : (
        <ul className={`todo-list is-outline${topicDrag.dragging ? ' is-sorting' : ''}`}>
          {topicRows.map(({ task: r, level, kids, hidden }, i) => {
            const look = topicDrag.rowLook(r.id);
            // A goal and everything under it read as one block, set apart from the loose tasks around it.
            const head = level === 0 && kids > 0 && isGoal(r, all);
            const inGoal = level > 0 && goalBlock(i);
            const last = (head && hidden > 0) || (inGoal && (topicRows[i + 1]?.level ?? 0) === 0);
            const block = [head ? 'goal-head' : '', inGoal ? 'in-goal' : '', last ? 'goal-last' : ''];
            return (
              <TaskRow
                key={r.id}
                task={r}
                all={all}
                byId={byId}
                today={today}
                lang={lang}
                onToggle={(x, from) => guard(isVeiled(x), () => toggle(x, from))}
                onOpen={(x) => openTask(x.id)}
                showRemind
                hideTag={topic}
                eventName={eventNameOf(r)}
                veiled={isVeiled(r)}
                hideRoot={level > 0}
                action={topicActs(r, kids, hidden)}
                className={[level > 0 ? 'is-nested' : '', ...block, look.className].filter(Boolean).join(' ') || undefined}
                rowStyle={{ '--lvl': level, ...look.rowStyle } as React.CSSProperties}
              />
            );
          })}
        </ul>
      )}
      {topicDone.length > 0 && (
        <details className="todo-topic-done">
          <summary>{tt('tagDoneFold', { n: topicDone.length })}</summary>
          <ul className="todo-list">{topicDone.map((r) => row(r))}</ul>
        </details>
      )}
    </>
  ) : (
    <>
      {/* A new topic: it opens straight away, empty, and every task added there carries its tag. */}
      <form
        className="todo-newquest todo-newtag"
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get('tag') ?? '')
            .replace(/^#+/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60);
          if (!name) return;
          e.currentTarget.reset();
          // An existing tag with the same name (in any letter case) opens instead of a twin.
          setTopic(tags.find((t) => t.name.toLowerCase() === name.toLowerCase())?.name ?? name);
          window.scrollTo({ top: 0 });
          setTimeout(() => document.querySelector<HTMLInputElement>('.todo-add input')?.focus(), 50);
        }}
      >
        <Hash size={18} aria-hidden />
        <input name="tag" placeholder={tt('newTag')} aria-label={tt('newTag')} dir={uiDir} enterKeyHint="go" maxLength={60} />
        <button type="submit" className="btn primary sm">
          {tt('newTagGo')}
        </button>
      </form>
      {tags.length === 0 ? (
        <div className="todo-blank">
          <Hash size={40} strokeWidth={1.5} aria-hidden />
          <p>{tt('tagsEmpty')}</p>
        </div>
      ) : (
    <section className="todo-sec-block">
      <h2 className="todo-group-h">
        {tt('tagsTitle')} <span className="muted">{tags.length}</span>
      </h2>
      <p className="muted small todo-topics-sub">{tt('tagsSub')}</p>
      <ul className="todo-topics">
        {tags.map((l) => {
          const items = topicTasks(pub, l.name);
          const open = inTagOrder(items.filter(isOpen));
          const done = items.length - open.length;
          const onToday = open.filter((r) => r.day === today).length;
          // What the card lists: the topic's top-level items (a goal stands for everything under it).
          const ids = new Set(open.map((r) => r.id));
          const tops = open.filter((r) => !r.root_id || !ids.has(r.root_id));
          return (
            <li key={l.name}>
              <button
                type="button"
                className="todo-topic-card"
                style={{ '--h': tagHue(l.name), '--p': items.length ? done / items.length : 0 } as React.CSSProperties}
                onClick={() => {
                  setTopic(l.name);
                  window.scrollTo({ top: 0 });
                }}
              >
                <span className="todo-topic-top">
                  <strong dir="auto">
                    <span aria-hidden>#</span>
                    {l.name}
                  </strong>
                  <span className="todo-topic-n">{open.length}</span>
                </span>
                {tops.length > 0 && (
                  <span className="todo-topic-next">
                    {tops.slice(0, 3).map((r) =>
                      isGoal(r, all) ? (
                        <span key={r.id} dir="auto" className="is-goal">
                          <Flag size={12} aria-hidden />
                          <span className={`t${isVeiled(r) ? ' todo-veil' : ''}`}>{isVeiled(r) ? VEIL : r.title || tt('untitled')}</span>
                          <em dir="ltr">{Math.round(progressOf(r, all) * 100)}%</em>
                        </span>
                      ) : (
                        <span key={r.id} dir="auto" className={isVeiled(r) ? 'todo-veil' : r.day === today ? 'is-today' : undefined}>
                          {isVeiled(r) ? VEIL : r.title || tt('untitled')}
                        </span>
                      ),
                    )}
                    {tops.length > 3 && <span className="muted">{tt('tagMore', { n: tops.length - 3 })}</span>}
                  </span>
                )}
                <span className="todo-topic-foot">
                  <span className="todo-topic-bar" aria-hidden />
                  <span className="muted small">
                    {tt('tagDoneN', { n: done })}
                    {onToday > 0 && (
                      <>
                        {' · '}
                        <Sun size={12} aria-hidden /> {onToday}
                      </>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
      )}
    </>
  );

  const event = eventId ? events.find((e) => e.id === eventId) : undefined;
  const eventHead = event && (
    <EventHead
      ev={event}
      today={today}
      lang={lang}
      back={
        <button type="button" className="icon-btn" onClick={() => setEventId(null)} aria-label={tt('allEvents')} data-tip={tt('allEvents')}>
          <Back size={20} />
        </button>
      }
    />
  );
  /** An event's tasks as an outline (a task for it brings what's under it), each with "Today" or its on-today mark. */
  const eventTasks = (ev: TodoEvent) => {
    const mine = all.filter((r) => r.event_id === ev.id && r.status !== 'quit');
    const set = new Map<string, Todo>();
    mine.forEach((r) => [r, ...descendants(r.id, all)].forEach((x) => x.status !== 'quit' && set.set(x.id, x)));
    const list = sortTasks([...set.values()], 'smart', today, byId);
    return list.length === 0 ? null : (
      <ul className="todo-list is-outline">
        {shutLocked(nestTasks(list, all)).map(({ task: r, level }) =>
          row(
            r,
            {
              action:
                // Kept on the event only: "To the pool" publishes it (with what's under it) to the rest of the app.
                r.event_only ? (
                  <button
                    type="button"
                    className="todo-today-btn to-pool"
                    onClick={() => {
                      update([{ id: r.id, event_only: false }]);
                      toast(tt('eventPublished', { title: r.title || tt('untitled') }));
                    }}
                    data-tip={tt('eventPublishHint')}
                  >
                    <Inbox size={15} aria-hidden />
                    {tt('eventPublish')}
                  </button>
                ) : isEventOnly(r, byId) ? undefined : r.day === today ? (
                  <span className="todo-on-today" data-tip={tt('tipOnToday')}>
                    <Sun size={14} aria-hidden />
                    {tt('tagOnToday')}
                  </span>
                ) : isOpen(r) ? (
                  toTodayBtn(r)
                ) : undefined,
              hideRoot: level > 0,
            },
            level,
          ),
        )}
      </ul>
    );
  };
  const eventsView = eventsMissing ? (
    <div className="todo-blank">
      <CalendarDays size={40} strokeWidth={1.5} aria-hidden />
      <p>{tt('eventsNotSetUp')}</p>
      <code dir="ltr">npm run db:update</code>
    </div>
  ) : event ? (
    <EventPage
      ev={event}
      tasks={eventTasks(event)}
      lang={lang}
      uiDir={uiDir}
      onSave={(p) => saveEvent(event.id, p)}
      onDelete={() => deleteEvent(event.id)}
      onPromote={(itemId) => void promoteItem(event, itemId)}
      onNewTask={() => openNew({ day: null, event_id: event.id, event_only: true, title: '' })}
      onSensitive={(on) => setEventSensitive(event, on)}
    />
  ) : (
    <EventsList
      events={events}
      all={all}
      today={today}
      lang={lang}
      uiDir={uiDir}
      veiled={eventVeiled}
      onOpen={(id) => {
        const ev = events.find((e) => e.id === id);
        guard(!!ev && eventVeiled(ev), () => {
          setEventId(id);
          window.scrollTo({ top: 0 });
        });
      }}
      onCreate={(d) => void createEvent(d)}
    />
  );

  /**
   * The app icon, and on its corner the lock for sensitive items (once there are any): closed while they're
   * blurred (tap: the PIN), open while they show (tap: blur them again).
   */
  const hasSensitive = all.some((r) => r.sensitive) || events.some((e) => e.sensitive);
  const homeAndLock = (
    <>
      <HomeLink
        onHome={() => {
          closeSheetRaw();
          setTab('today');
        }}
      />
      {hasSensitive && (
        <button
          type="button"
          className={`todo-lockbadge${unlocked ? ' is-open' : ''}`}
          onClick={() => (unlocked ? lock() : askPin())}
          aria-label={unlocked ? tt('lock') : tt('unlock')}
          aria-pressed={!unlocked}
          data-tip={unlocked ? tt('lock') : tt('unlock')}
        >
          {unlocked ? <LockKeyholeOpen size={13} strokeWidth={2.6} aria-hidden /> : <LockKeyhole size={13} strokeWidth={2.6} aria-hidden />}
        </button>
      )}
    </>
  );

  const doneView =
    finished.length === 0 ? (
      <div className="todo-blank">
        <CheckCheck size={40} strokeWidth={1.5} aria-hidden />
        <p>{tt('emptyDone')}</p>
      </div>
    ) : (
      finished.map((g) => {
        const items = oneLockedEach(g.items);
        return (
          <section key={g.day} className="todo-group">
            <h2 className="todo-group-h">
              {dayLabel(g.day, today, lang, tt)} <span className="muted">{items.length}</span>
            </h2>
            <ul className="todo-list">{items.map((r) => row(r))}</ul>
          </section>
        );
      })
    );

  const nav: { id: Tab; label: TKey; icon: typeof Sun; n?: number; dot?: boolean }[] = [
    // Today in the middle, within easy reach of the thumb; the pool on one side of it, the journeys on the other
    // (in Hebrew, right to left: events, pool, today, journeys, done). Tags open from the blog's top bar.
    { id: 'events', label: 'events', icon: CalendarDays, n: events.filter((e) => e.date && e.date >= today).length },
    { id: 'pool', label: 'pool', icon: Inbox, n: pool.length },
    { id: 'today', label: 'today', icon: Sun, n: todayAll.length - doneToday, dot: reminded.length > 0 },
    { id: 'quests', label: 'quests', icon: Swords, n: purposes.filter(isOpen).length },
    { id: 'done', label: 'done', icon: CheckCheck },
  ];
  const placeholder =
    tab === 'pool'
      ? tt('addPool')
      : tab === 'tags' && topic
        ? tt('addToTag', { tag: `\u2068#${topic}\u2069` })
        : tab === 'quests' && quest
          ? tt('add_step')
          : tt('addToday');
  const canAdd = tab === 'today' || tab === 'pool' || (tab === 'tags' && !!topic) || (tab === 'quests' && !!quest);

  return (
    <div className={`todo tab-${tab}`} ref={setRootEl}>
      {/* The blog's app header row is hidden for this app (index.css); its heading lives on here for screen readers. */}
      <h1 className="sr-only">{tt('appName')}</h1>
      <div className="todo-top">
        {/* An open journey or topic has its own heading row (with the way back) above the bar. */}
        {tab === 'quests' && questHead}
        {tab === 'tags' && topicHead}
        {tab === 'events' && eventHead}
        {/* The same game bar on every tab: on Today it counts the day's list, elsewhere the level's XP. */}
        <Hud home={homeAndLock} mode={tab === 'today' ? 'day' : 'xp'} onLevel={() => setLevelsOpen(true)} stats={stats} done={doneToday} total={todayAll.length} pal={pal} reduced={reduced} lang={lang} tt={tt} />
        {canAdd && (
          <form className={`todo-add${text.trim() ? ' has-text' : ''}`} onSubmit={quickAdd}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-describedby="todo-quick-hint"
              dir={uiDir}
              enterKeyHint="send"
            />
            {text && (
              <button type="button" className="icon-btn sm" onClick={() => setText('')} aria-label={tt('clear')}>
                <X size={16} />
              </button>
            )}
            <button type="button" className="icon-btn sm" onClick={() => openNew()} aria-label={tt('addDetails')} data-tip={tt('addDetails')}>
              <SlidersHorizontal size={18} />
            </button>
            {text.trim() && (
              <button type="submit" className="btn primary sm todo-add-go">
                {tt('create')}
              </button>
            )}
            <span id="todo-quick-hint" className="sr-only">
              {tt('quickHint')}
            </span>
          </form>
        )}
        {canAdd && text.length > 0 && <p className="todo-hint">{tt('quickHint')}</p>}
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
        {tab === 'tags' && tagsView}
        {tab === 'events' && eventsView}
        {tab === 'done' && doneView}
      </div>

      <nav className="todo-nav" aria-label={tt('sections')}>
        {nav.map(({ id, label: l, icon: Icon, n, dot }) => (
          <button
            key={id}
            type="button"
            className={[id === 'today' ? 'is-hero' : '', tab === id ? 'on' : ''].filter(Boolean).join(' ') || undefined}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            <span className="todo-nav-ic">
              <Icon size={id === 'today' ? 26 : 21} aria-hidden />
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
        onReorder={reorder}
        onMoved={(t, toToday) => toast(tt(toToday ? 'movedToToday' : 'movedToPool', { title: t.title || tt('untitled') }))}
        events={events}
        veil={isVeiled}
        veilEvent={eventVeiled}
        onSensitive={setSensitive}
        onMoveUnder={moveUnder}
        onSetGoal={setGoal}
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
        veil={isVeiled}
      />
      <UndoBar
        // The title is blurred too while the task is sensitive and locked.
        undo={undo && { key: undo.key, text: tt(undo.text, { title: isVeiled(undo.task) ? VEIL : undo.task.title || tt('untitled') }) }}
        onUndo={() => {
          if (undo) update(undo.patches, true);
          setUndo(null);
        }}
        onClose={() => setUndo(null)}
      />
      {pinAsk && (
        <PinSheet
          mode={pinAsk.mode}
          onClose={() => setPinAsk(null)}
          onCheck={async (pin) => {
            if ((await hashPin(pin)) !== pinHash) return false;
            setUnlocked(true);
            const then = pinAsk.then;
            setPinAsk(null);
            then?.();
            return true;
          }}
          onSet={async (pin) => {
            const h = await hashPin(pin);
            try {
              await api.saveTodoSettings({ pin_hash: h });
            } catch (e) {
              toast(errorText(e, t));
              return;
            }
            // Choosing a PIN doesn't unlock: only typing it to open something does.
            setPinHash(h);
            toast(tt('pinSaved'));
            const then = pinAsk.then;
            setPinAsk(null);
            then?.();
          }}
        />
      )}
      <LevelsSheet open={levelsOpen} onClose={() => setLevelsOpen(false)} stats={stats} />
      <TipLayer root={rootEl} />
      <FxLayer fx={fx} reduced={reduced} font={pal?.font ?? 'system-ui, sans-serif'} />
    </div>
  );
}
