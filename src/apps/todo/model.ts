import type { Lang, Todo, TodoDraft, TodoLogEntry, TodoStatus, TodoType } from '../../lib/types';
import { TODO_TYPES } from '../../lib/util';
import type { TKey, Tt } from './strings';

/** 'YYYY-MM-DD' of a date in the viewer's own time zone. */
export function isoDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parse(iso);
  d.setMonth(d.getMonth() + n);
  return isoDay(d);
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

/** "Today", "Tomorrow", "Yesterday", or a short date ("Wed, 12 Nov"). */
export function dayLabel(iso: string, today: string, lang: Lang, tt: Tt): string {
  const n = daysBetween(today, iso);
  if (n === 0) return tt('today');
  if (n === 1) return tt('tomorrow');
  if (n === -1) return tt('yesterday');
  const d = parse(iso);
  const sameYear = d.getFullYear() === parse(today).getFullYear();
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    weekday: Math.abs(n) < 7 ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  }).format(d);
}

// ── Status and workflow ──

/** The main road a task travels; blocked, on hold and quit are side states. */
export const STAGES: TodoStatus[] = ['discovered', 'researched', 'defined', 'inprogress', 'completed'];
export const SIDE_STATES: TodoStatus[] = ['blocked', 'onhold', 'quit'];

export const isOpen = (t: Todo) => t.status !== 'completed' && t.status !== 'quit';
export const isClosed = (t: Todo) => !isOpen(t);

/** On an earlier day's list and not finished: waiting for the daily review. */
export const isLeftover = (t: Todo, today: string) => !!t.day && t.day < today && isOpen(t);

/** In the pool and its reminder has come (without a reminder: its due date or deadline has). */
export const isReminded = (t: Todo, today: string) => {
  if (t.day || !isOpen(t)) return false;
  const when = t.remind_on ?? t.due_date ?? t.deadline;
  return !!when && when <= today;
};

/** The open tasks this one waits for: its dependencies, and the sibling step before it. */
export function blockers(t: Todo, byId: Map<string, Todo>): Todo[] {
  const ids = [...t.depends_on, ...(t.prev_id ? [t.prev_id] : [])];
  return [...new Set(ids)].map((id) => byId.get(id)).filter((x): x is Todo => !!x && isOpen(x));
}

/** Blocked by its status, or still waiting for something unfinished. */
export const isBlocked = (t: Todo, byId: Map<string, Todo>) => isOpen(t) && (t.status === 'blocked' || blockers(t, byId).length > 0);

/** How deep a task sits: 0 a root purpose, 1 a step, 2 and below an action. */
export function depthOf(t: Todo, byId: Map<string, Todo>): number {
  let d = 0;
  let cur = t;
  const seen = new Set<string>([t.id]);
  while (cur.root_id) {
    const up = byId.get(cur.root_id);
    if (!up || seen.has(up.id)) break;
    seen.add(up.id);
    cur = up;
    d++;
  }
  return d;
}

export type Tier = 'purpose' | 'step' | 'action';
export const tierOf = (depth: number): Tier => (depth === 0 ? 'purpose' : depth === 1 ? 'step' : 'action');
/** What a task's children are called: a purpose has steps, a step (and an action) has actions. */
export const childTier = (depth: number): Tier => (depth === 0 ? 'step' : 'action');

/** The topmost task this one was derived from (itself for a root). */
export function rootOf(t: Todo, byId: Map<string, Todo>): Todo {
  let cur = t;
  const seen = new Set<string>([t.id]);
  while (cur.root_id) {
    const up = byId.get(cur.root_id);
    if (!up || seen.has(up.id)) break;
    seen.add(up.id);
    cur = up;
  }
  return cur;
}

/** A task's children in chain order (following next_id from the first); any off the chain go last. */
export function stepsOf(rootId: string, all: Todo[]): Todo[] {
  const kids = all.filter((t) => t.root_id === rootId);
  if (!kids.length) return [];
  const byId = new Map(kids.map((k) => [k.id, k]));
  const out: Todo[] = [];
  const seen = new Set<string>();
  let cur = kids.find((k) => !k.prev_id || !byId.has(k.prev_id)) ?? null;
  while (cur && !seen.has(cur.id)) {
    out.push(cur);
    seen.add(cur.id);
    cur = cur.next_id ? (byId.get(cur.next_id) ?? null) : null;
  }
  kids.filter((k) => !seen.has(k.id)).sort((a, b) => a.position - b.position).forEach((k) => out.push(k));
  return out;
}

/** Everything derived from a task, at any depth. */
export function descendants(id: string, all: Todo[]): Todo[] {
  const out: Todo[] = [];
  const seen = new Set<string>([id]);
  const walk = (rid: string) =>
    all.filter((t) => t.root_id === rid && !seen.has(t.id)).forEach((t) => {
      seen.add(t.id);
      out.push(t);
      walk(t.id);
    });
  walk(id);
  return out;
}

/** Share of a task's tree that's finished (0–1); a task with no children counts itself. */
export function progressOf(t: Todo, all: Todo[]): number {
  const kids = descendants(t.id, all).filter((k) => k.status !== 'quit');
  if (!kids.length) return isOpen(t) ? 0 : 1;
  return kids.filter((k) => k.status === 'completed').length / kids.length;
}

/** The patches that make `order` one chain: each one's prev_id and next_id pointing at its neighbours. */
export function relink(order: Todo[]): (TodoDraft & { id: string })[] {
  const patches: (TodoDraft & { id: string })[] = [];
  order.forEach((t, i) => {
    const prev_id = order[i - 1]?.id ?? null;
    const next_id = order[i + 1]?.id ?? null;
    if (t.prev_id !== prev_id || t.next_id !== next_id) patches.push({ id: t.id, prev_id, next_id });
  });
  return patches;
}

// ── Ordering ──

/** The nearest date that matters: deadline counts most, then due, then estimated. */
function dateWeight(t: Todo, today: string): number {
  const w = (iso: string | null, k: number) => {
    if (!iso) return 0;
    const n = daysBetween(today, iso);
    return k * (n < 0 ? 5 : n === 0 ? 4 : n === 1 ? 3 : n <= 3 ? 2 : n <= 7 ? 1 : 0);
  };
  return Math.max(w(t.deadline, 1.6), w(t.due_date, 1), w(t.estimate_date, 0.5));
}

/** Higher first: in progress, then importance, urgency and how close its dates are; blocked and on-hold sink. */
export function score(t: Todo, today: string, blocked: boolean): number {
  return (
    (t.status === 'inprogress' ? 20 : 0) +
    t.priority * 3 +
    t.urgency * 2 +
    dateWeight(t, today) -
    (blocked ? 15 : 0) -
    (t.status === 'onhold' ? 10 : 0)
  );
}

export type SortKey = 'smart' | 'due' | 'new';

export function sortTasks(list: Todo[], key: SortKey, today: string, byId: Map<string, Todo>): Todo[] {
  const open = (t: Todo) => (isOpen(t) ? 0 : 1);
  const first = (t: Todo) => [t.deadline, t.due_date, t.estimate_date].filter(Boolean).sort()[0] ?? '9999';
  return [...list].sort((a, b) => {
    const o = open(a) - open(b);
    if (o) return o;
    if (key === 'new') return b.created_at.localeCompare(a.created_at);
    if (key === 'due') {
      const c = first(a).localeCompare(first(b));
      if (c) return c;
    }
    return score(b, today, isBlocked(b, byId)) - score(a, today, isBlocked(a, byId)) || a.position - b.position;
  });
}

// ── Grouping ──

export type GroupKey = 'none' | 'tag' | 'list' | 'type' | 'status';

/**
 * Splits tasks into labelled groups. A task with several tags (or lists) shows under each of them; tasks with
 * none go last, under `none`. Groups keep the tasks' order.
 */
export function groupTasks(list: Todo[], key: GroupKey, tt: Tt): { id: string; label: string; items: Todo[] }[] {
  if (key === 'none') return [{ id: '*', label: '', items: list }];
  const groups = new Map<string, { id: string; label: string; items: Todo[] }>();
  const put = (id: string, label: string, t: Todo) => {
    if (!groups.has(id)) groups.set(id, { id, label, items: [] });
    groups.get(id)!.items.push(t);
  };
  list.forEach((t) => {
    if (key === 'type') put(t.type, tt(`ty_${t.type}`), t);
    else if (key === 'status') put(t.status, tt(`st_${t.status}`), t);
    else {
      const labels = key === 'tag' ? t.tags : t.lists;
      if (!labels.length) put('', tt(key === 'tag' ? 'noTag' : 'noList'), t);
      labels.forEach((l) => put(l.toLowerCase(), key === 'tag' ? `#${l}` : l, t));
    }
  });
  const order =
    key === 'type' ? TODO_TYPES : key === 'status' ? [...STAGES.slice(0, 4), 'blocked', 'onhold', 'completed', 'quit'] : null;
  return [...groups.values()].sort((a, b) => {
    if (order) return order.indexOf(a.id as never) - order.indexOf(b.id as never);
    if (!a.id) return 1;
    if (!b.id) return -1;
    return a.label.localeCompare(b.label);
  });
}

/** Every tag (or list name) in use, most used first, with how many open tasks carry it. */
export function labelsIn(all: Todo[], key: 'tags' | 'lists'): { name: string; open: number; total: number }[] {
  const m = new Map<string, { name: string; open: number; total: number }>();
  all.forEach((t) =>
    t[key].forEach((l) => {
      const k = l.toLowerCase();
      const e = m.get(k) ?? { name: l, open: 0, total: 0 };
      e.total++;
      if (isOpen(t)) e.open++;
      m.set(k, e);
    }),
  );
  return [...m.values()].sort((a, b) => b.open - a.open || b.total - a.total || a.name.localeCompare(b.name));
}

export const hasLabel = (labels: string[], name: string) => labels.some((l) => l.toLowerCase() === name.toLowerCase());

// ── Quick add: "Call the bank #money @errands !!" ──

/**
 * Reads #tags, @lists and ! marks (! high, !! urgent too) out of a quick-add line. Underscores in a label
 * stand for spaces (@home_repairs → "home repairs").
 */
export function parseQuick(text: string): TodoDraft & { title: string } {
  const tags: string[] = [];
  const lists: string[] = [];
  let bangs = 0;
  const words = text.split(/\s+/).filter((w) => {
    const m = /^([#@])([^\s#@]+)$/u.exec(w);
    if (m) {
      (m[1] === '#' ? tags : lists).push(m[2].replace(/_/g, ' '));
      return false;
    }
    if (/^!{1,3}$/.test(w)) {
      bangs = Math.max(bangs, w.length);
      return false;
    }
    return true;
  });
  const out: TodoDraft & { title: string } = { title: words.join(' ').trim(), tags, lists };
  if (bangs) {
    out.priority = 3;
    if (bangs > 1) out.urgency = bangs === 2 ? 2 : 3;
  }
  return out;
}

// ── Game: experience, levels, streak ──

/** Thinking work earns a little extra. */
const TYPE_BONUS: Record<TodoType, number> = {
  achieving: 0,
  learning: 5,
  understanding: 3,
  decisions: 4,
  checking: 0,
  opportunities: 2,
  enrichments: 2,
  planning: 3,
};

/** What finishing a task is worth: more for bigger and more important ones. */
export function xpFor(t: Pick<Todo, 'complexity' | 'priority' | 'type'>): number {
  return 10 + t.complexity * 8 + t.priority * 4 + TYPE_BONUS[t.type];
}

/** XP needed to reach a level: 0, 100, 300, 600, 1000… */
export const levelFloor = (level: number) => 50 * level * (level - 1);

export function levelOf(xp: number): number {
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
}

export interface Stats {
  xp: number;
  level: number;
  /** XP within the current level, and how many the level takes. */
  into: number;
  span: number;
  /** Days in a row with at least one completed task, up to today (or yesterday, before today's first). */
  streak: number;
  doneToday: number;
}

export function statsOf(all: Todo[], today: string): Stats {
  let xp = 0;
  const days = new Set<string>();
  let doneToday = 0;
  all.forEach((t) => {
    if (t.status !== 'completed') return;
    xp += xpFor(t);
    const d = isoDay(new Date(t.done_at ?? t.updated_at));
    days.add(d);
    if (d === today) doneToday++;
  });
  let streak = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  const level = levelOf(xp);
  const floor = levelFloor(level);
  return { xp, level, into: xp - floor, span: levelFloor(level + 1) - floor, streak, doneToday };
}

// ── Labels for levels ──

export const levelKeys = {
  priority: ['lv_none', 'pr_1', 'pr_2', 'pr_3'],
  urgency: ['lv_none', 'ur_1', 'ur_2', 'ur_3'],
  complexity: ['lv_none', 'cx_1', 'cx_2', 'cx_3', 'cx_4', 'cx_5'],
} as const satisfies Record<string, readonly TKey[]>;

export const SIZES = ['–', 'XS', 'S', 'M', 'L', 'XL'];
export { TODO_TYPES as TYPES } from '../../lib/util';

// Small per-browser memories. Storage can be missing or throw (private windows): fall back quietly.
export function remember(key: string, value: string) {
  try {
    localStorage.setItem(`todo.${key}`, value);
  } catch {
    /* not kept */
  }
}
export function recall(key: string): string | null {
  try {
    return localStorage.getItem(`todo.${key}`);
  } catch {
    return null;
  }
}

// ── History ──

/** The log lines a change adds: a new stage, or a move between day lists and the pool. */
export function logFor(before: Todo, patch: TodoDraft, at = new Date().toISOString()): TodoLogEntry[] {
  const out: TodoLogEntry[] = [];
  if (patch.status && patch.status !== before.status) out.push({ at, kind: 'status', from: before.status, to: patch.status });
  if ('day' in patch && (patch.day ?? null) !== before.day) out.push({ at, kind: 'day', from: before.day, to: patch.day ?? null });
  return out;
}
