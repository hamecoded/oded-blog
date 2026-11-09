import type { CSSProperties, ReactNode } from 'react';
import { AtSign, Bell, CalendarClock, Clock, CornerDownRight, Flame, Hourglass, ListTree, Lock } from 'lucide-react';
import type { Lang, Todo } from '../../lib/types';
import { STATUS_ICON, TYPE_ICON } from './look';
import { blockers, childTier, dayLabel, depthOf, isOpen, SIZES, stepsOf, tierOf, xpFor } from './model';
import { useTt } from './strings';

export interface Origin {
  x: number;
  y: number;
}

/**
 * One task as a dense, tappable card: the orb on the inline start completes it (or reopens it), the rest opens
 * it. Its type colours the edge, its stage colours the orb, and the line under the title holds only what's set.
 */
export function TaskRow({
  task,
  all,
  byId,
  today,
  lang,
  onToggle,
  onOpen,
  showRemind,
  action,
  hideRoot,
}: {
  task: Todo;
  all: Todo[];
  byId: Map<string, Todo>;
  today: string;
  lang: Lang;
  onToggle: (t: Todo, from: Origin) => void;
  onOpen: (t: Todo) => void;
  /** Pool rows show when they'll come back. */
  showRemind?: boolean;
  /** A button at the end of the row (pool: "to today"). */
  action?: ReactNode;
  /** Inside its own root's sheet the "part of" line says nothing new. */
  hideRoot?: boolean;
}) {
  const tt = useTt();
  const Icon = STATUS_ICON[task.status];
  const TypeIcon = TYPE_ICON[task.type];
  const depth = depthOf(task, byId);
  const kids = stepsOf(task.id, all);
  const kidsDone = kids.filter((s) => s.status === 'completed').length;
  const root = task.root_id ? byId.get(task.root_id) : undefined;
  const waitFor = isOpen(task) ? blockers(task, byId) : [];
  const blocked = isOpen(task) && (task.status === 'blocked' || waitFor.length > 0);
  const late = (iso: string | null) => !!iso && iso < today && isOpen(task);
  const soon = (iso: string | null) => !!iso && iso <= today && isOpen(task);
  const meta: ReactNode[] = [];

  if (root && !hideRoot) {
    const siblings = stepsOf(root.id, all);
    meta.push(
      <span key="root" className="todo-m root">
        <CornerDownRight size={12} aria-hidden />
        <span className="tier">{tt(`tier_${tierOf(depth)}`)}</span>
        <span className="n">
          {siblings.findIndex((s) => s.id === task.id) + 1}/{siblings.length}
        </span>
        <span className="of" dir="auto">
          {root.title || tt('untitled')}
        </span>
      </span>,
    );
  }
  if (task.status !== 'discovered' && task.status !== 'completed') {
    meta.push(
      <span key="st" className={`todo-m st st-${task.status}`}>
        {tt(`st_${task.status}`)}
      </span>,
    );
  }
  if (task.deadline) {
    meta.push(
      <span key="dl" className={`todo-m date${soon(task.deadline) ? ' late' : ''}`} title={tt('deadline')}>
        <Hourglass size={12} aria-hidden />
        {dayLabel(task.deadline, today, lang, tt)}
      </span>,
    );
  }
  if (task.due_date) {
    meta.push(
      <span key="due" className={`todo-m date${late(task.due_date) ? ' late' : ''}`} title={tt('dueDate')}>
        <Clock size={12} aria-hidden />
        {dayLabel(task.due_date, today, lang, tt)}
      </span>,
    );
  }
  if (task.estimate_date && !task.due_date && !task.deadline) {
    meta.push(
      <span key="est" className="todo-m date" title={tt('estimateDate')}>
        <CalendarClock size={12} aria-hidden />
        {dayLabel(task.estimate_date, today, lang, tt)}
      </span>,
    );
  }
  if (showRemind && task.remind_on) {
    meta.push(
      <span key="rem" className="todo-m" title={tt('remindOn')}>
        <Bell size={12} aria-hidden />
        {dayLabel(task.remind_on, today, lang, tt)}
      </span>,
    );
  }
  if (task.urgency >= 2) {
    meta.push(
      <span key="urg" className={`todo-m urg u${task.urgency}`} title={`${tt('urgency')}: ${tt(`ur_${task.urgency as 2 | 3}`)}`}>
        <Flame size={12} aria-hidden />
        {task.urgency === 3 ? tt('ur_3') : null}
      </span>,
    );
  }
  if (task.complexity) {
    meta.push(
      <span key="cx" className="todo-m size" title={`${tt('complexity')}: ${tt(`cx_${task.complexity as 1 | 2 | 3 | 4 | 5}`)}`}>
        {SIZES[task.complexity]}
      </span>,
    );
  }
  if (kids.length) {
    meta.push(
      <span key="kids" className="todo-m kids" title={tt(`kids_${childTier(depth) as 'step' | 'action'}`)}>
        <ListTree size={12} aria-hidden />
        {kidsDone}/{kids.length}
      </span>,
    );
  }
  task.lists.forEach((l) =>
    meta.push(
      <span key={`l:${l}`} className="todo-m list" dir="auto">
        <AtSign size={11} aria-hidden />
        {l}
      </span>,
    ),
  );
  task.tags.forEach((l) =>
    meta.push(
      <span key={`t:${l}`} className="todo-m tag" dir="auto">
        #{l}
      </span>,
    ),
  );
  if (waitFor.length) {
    meta.push(
      <span key="lock" className="todo-m lock" title={tt('blockedBy', { list: waitFor.map((w) => w.title).join(', ') })}>
        <Lock size={12} aria-hidden />
      </span>,
    );
  }

  const style = { '--prog': kids.length ? kidsDone / kids.length : 0 } as CSSProperties;
  return (
    <li
      className={`todo-row ty-${task.type} p${task.priority} is-${task.status}${blocked ? ' is-blocked' : ''}${depth ? ` is-${tierOf(depth)}` : ''}`}
      style={style}
    >
      <button
        type="button"
        className="todo-check"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onToggle(task, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
        aria-label={isOpen(task) ? `${tt('markDoneShort')} (+${xpFor(task)} XP)` : tt('reopen')}
        aria-pressed={!isOpen(task)}
        title={isOpen(task) ? `${tt('markDoneShort')} · +${xpFor(task)} XP` : tt('reopen')}
      >
        <Icon size={18} strokeWidth={2.4} />
      </button>
      <button type="button" className="todo-main" onClick={() => onOpen(task)}>
        <span className="todo-title" dir="auto">
          <TypeIcon size={13} className="todo-ty" aria-label={tt(`ty_${task.type}`)} />
          {task.title || tt('untitled')}
        </span>
        {meta.length > 0 && <span className="todo-meta">{meta}</span>}
      </button>
      {action}
    </li>
  );
}
