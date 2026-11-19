import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ChevronDown, ChevronLeft, ChevronRight, Flag, FlagOff, Plus } from 'lucide-react';
import type { Lang, Todo } from '../../lib/types';
import { STATUS_ICON } from './look';
import { childTier, depthOf, isGoal, isOpen, progressOf, stepsOf, tierOf } from './model';
import { useTt } from './strings';

/** A compact dropdown in the bar: a chip that opens a card of rows. Closes on a pick, Escape or a tap outside. */
function BarMenu({ label, trigger, children }: { label: string; trigger: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div
      className={`todo-picker todo-drill-menu${open ? ' is-open' : ''}`}
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation(); // close the menu, not the sheet
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="todo-drill-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-tip={label}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
        <ChevronDown size={14} aria-hidden className="todo-picker-chev" />
      </button>
      {open && (
        <div className="todo-picker-menu todo-drill-card" role="menu" aria-label={label}>
          <div className="todo-picker-h">{label}</div>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/**
 * The task sheet's navigation bar: where this task sits in the drill-down from a goal (purpose → step → action),
 * every level tappable, with a menu to jump to any goal, the previous / next sibling, and a menu to drill down
 * into this task's own subtasks (or start some). `task` is the open task; for a new one, `parentId` is where it
 * will go.
 */
export function DrillBar({
  task,
  parentId,
  all,
  byId,
  lang,
  onOpen,
  onAddKid,
  onGoal,
}: {
  task: Todo | null;
  parentId: string | null;
  all: Todo[];
  byId: Map<string, Todo>;
  lang: Lang;
  onOpen: (id: string) => void;
  /** Takes the user to the field that adds a subtask. */
  onAddKid: () => void;
  /** Promote to a goal (true), or take the goal mark off (false). */
  onGoal: (on: boolean) => void;
}) {
  const tt = useTt();
  const trail = useRef<HTMLOListElement>(null);
  const Sep = lang === 'he' ? ChevronLeft : ChevronRight;

  // The path from the goal down to the parent.
  const path: Todo[] = [];
  const seen = new Set<string>();
  for (let id = task?.root_id ?? parentId; id && !seen.has(id);) {
    seen.add(id);
    const t = byId.get(id);
    if (!t) break;
    path.unshift(t);
    id = t.root_id;
  }
  const depth = task ? depthOf(task, byId) : path.length;
  const tier = tierOf(depth);
  const siblings = path.length ? stepsOf(path[path.length - 1].id, all) : [];
  const at = task ? siblings.findIndex((s) => s.id === task.id) : -1;
  const kids = task ? stepsOf(task.id, all) : [];
  const kidTier = childTier(depth);
  const goal = task ? isGoal(task, all) : false;
  const goals = all.filter((t) => isGoal(t, all)).sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || a.title.localeCompare(b.title, lang));

  // Keep the end of a long path (the current task) in view.
  useEffect(() => {
    const el = trail.current;
    if (el) el.scrollLeft = lang === 'he' ? -el.scrollWidth : el.scrollWidth;
  }, [task?.id, lang]);

  const crumb = (t: Todo, d: number, last: boolean) => (
    <li key={t.id}>
      <button
        type="button"
        className={`todo-drill-crumb tier-${tierOf(d)}`}
        onClick={() => onOpen(t.id)}
        data-tip={tt('openTask', { title: t.title || tt('untitled') })}
      >
        <span className="tier">{tt(`tier_${tierOf(d)}`)}</span>
        <span className="name" dir="auto">
          {t.title || tt('untitled')}
        </span>
      </button>
      {!last && <Sep size={15} aria-hidden className="todo-drill-sep" />}
    </li>
  );

  /**
   * The path is the task's ancestors only, from its goal down to its parent: no chip for the task itself (the sheet's
   * title already says which task this is). A goal, or a task outside any goal, has no path.
   */
  const showTrail = path.length > 0;
  const goalsMenu = goals.length > 0 && (
    <BarMenu
      label={tt('goals')}
      trigger={
        <>
          <Flag size={15} aria-hidden /> <span className="todo-drill-goals-l">{tt('goals')}</span>
        </>
      }
    >
      {(close) =>
        goals.map((g) => (
          <button
            key={g.id}
            type="button"
            role="menuitem"
            className={path[0]?.id === g.id || task?.id === g.id ? 'on' : undefined}
            onClick={() => {
              close();
              onOpen(g.id);
            }}
          >
            <span className="todo-drill-pct" style={{ '--p': progressOf(g, all) } as React.CSSProperties} aria-hidden />
            <span className="todo-menu-l">{g.title || tt('untitled')}</span>
            <span className="todo-menu-note" dir="ltr">
              {Math.round(progressOf(g, all) * 100)}%
            </span>
          </button>
        ))
      }
    </BarMenu>
  );

  return (
    <nav className="todo-drill" aria-label={tt('drillNav')}>
      {showTrail && (
        <div className="todo-drill-path">
          {showTrail && goalsMenu}
          <ol className="todo-drill-trail" ref={trail}>
            {path.map((t, i) => crumb(t, i, i === path.length - 1))}
          </ol>
        </div>
      )}

      {(siblings.length > 1 || task || !showTrail) && (
        <div className="todo-drill-moves">
          {!showTrail && goalsMenu}
          {task && !goal && (
            <button type="button" className="todo-drill-chip is-promote" onClick={() => onGoal(true)} data-tip={tt('promoteHint')}>
              <Flag size={15} aria-hidden /> {tt('promote')}
            </button>
          )}
          {task && goal && task.goal && kids.length === 0 && (
            <button type="button" className="todo-drill-chip" onClick={() => onGoal(false)}>
              <FlagOff size={15} aria-hidden /> {tt('unpromote')}
            </button>
          )}
          {siblings.length > 1 && at >= 0 && (
            <span className="todo-drill-sibs">
              <button
                type="button"
                className="icon-btn sm"
                disabled={at <= 0}
                onClick={() => onOpen(siblings[at - 1].id)}
                aria-label={tt('prevStep')}
                data-tip={at > 0 ? tt('openTask', { title: siblings[at - 1].title || tt('untitled') }) : undefined}
              >
                {lang === 'he' ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
              <span className="todo-drill-n">{tt('nOfTier', { tier: tt(`tier_${tier}`), n: at + 1, m: siblings.length })}</span>
              <button
                type="button"
                className="icon-btn sm"
                disabled={at >= siblings.length - 1}
                onClick={() => onOpen(siblings[at + 1].id)}
                aria-label={tt('nextStep')}
                data-tip={at < siblings.length - 1 ? tt('openTask', { title: siblings[at + 1].title || tt('untitled') }) : undefined}
              >
                {lang === 'he' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>
            </span>
          )}
          {task && depth < 2 && (
            <span className="todo-drill-down">
              {kids.length > 0 ? (
                <BarMenu
                  label={tt(`kids_${kidTier as 'step' | 'action'}`)}
                  trigger={
                    <>
                      <ArrowDownToLine size={15} aria-hidden />
                      {tt('drillInto', { n: kids.length, what: tt(`kids_${kidTier as 'step' | 'action'}`) })}
                    </>
                  }
                >
                  {(close) => (
                    <>
                      {kids.map((k) => {
                        const Icon = STATUS_ICON[k.status];
                        return (
                          <button
                            key={k.id}
                            type="button"
                            role="menuitem"
                            className={`st-${k.status}`}
                            onClick={() => {
                              close();
                              onOpen(k.id);
                            }}
                          >
                            <Icon size={16} aria-hidden className="todo-drill-st" />
                            <span className="todo-menu-l">{k.title || tt('untitled')}</span>
                            {all.some((x) => x.root_id === k.id) && <span className="todo-menu-note">{stepsOf(k.id, all).length}</span>}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        role="menuitem"
                        className="todo-drill-add"
                        onClick={() => {
                          close();
                          onAddKid();
                        }}
                      >
                        <Plus size={16} aria-hidden /> {tt(`add_${kidTier as 'step' | 'action'}`)}
                      </button>
                    </>
                  )}
                </BarMenu>
              ) : (
                <button type="button" className="todo-drill-chip" onClick={onAddKid}>
                  <Plus size={15} aria-hidden /> {tt(`breakInto_${kidTier as 'step' | 'action'}`)}
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
