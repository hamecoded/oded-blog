import { useRef, useState, type CSSProperties } from 'react';
import { ArrowUpToLine, CircleCheck, CircleSlash, Inbox, Lock } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import type { Lang, Todo, TodoDraft } from '../../lib/types';
import { TYPE_ICON } from './look';
import { blockers, dayLabel, levelKeys } from './model';
import { RemindField } from './RemindField';
import { Segmented } from './Segmented';
import { useTt } from './strings';

export type Decision = 'today' | 'pool' | 'done' | 'drop';

/** How far (px) a card has to be dragged to count as a decision. */
const THRESHOLD = 90;

/**
 * The morning debrief: unfinished tasks from earlier days, dealt one card at a time from a stack. Swipe the card
 * (or tap a button): towards the inline end keeps it for today, towards the inline start saves it to the pool
 * with the refined priority, urgency and reminder chosen under it. It can also be marked done or quit. A decided
 * task stops being a leftover, so the next card simply moves up.
 */
export function ReviewSheet({
  open,
  leftovers,
  byId,
  today,
  lang,
  reduced,
  onDecide,
  onAll,
  onClose,
}: {
  open: boolean;
  leftovers: Todo[];
  byId: Map<string, Todo>;
  today: string;
  lang: Lang;
  reduced: boolean;
  onDecide: (t: Todo, d: Decision, refine: TodoDraft) => void;
  onAll: (d: 'today' | 'pool') => void;
  onClose: () => void;
}) {
  const tt = useTt();
  const task = leftovers[0];
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [refine, setRefine] = useState({ priority: 0, urgency: 0, remind_on: null as string | null });
  const [dx, setDx] = useState(0);
  const [fly, setFly] = useState<'start' | 'end' | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number; horiz: boolean | null } | null>(null);
  if ((task?.id ?? null) !== shownFor) {
    setShownFor(task?.id ?? null);
    setRefine({ priority: task?.priority ?? 0, urgency: task?.urgency ?? 0, remind_on: task?.remind_on ?? null });
    setDx(0);
    setFly(null);
  }
  const rtl = lang === 'he';
  /** dx in the reading direction: positive towards the inline end. */
  const fwd = rtl ? -dx : dx;

  const decide = (d: Decision) => {
    if (!task) return;
    const send = () => onDecide(task, d, d === 'pool' || d === 'today' ? refine : {});
    if (reduced || (d !== 'today' && d !== 'pool')) return send();
    setFly(d === 'today' ? 'end' : 'start');
    setTimeout(send, 220);
  };

  const level = (k: 'priority' | 'urgency') => levelKeys[k].map((lk, i) => ({ value: i, label: tt(lk), title: tt(lk) }));
  const waitFor = task ? blockers(task, byId) : [];
  const root = task?.root_id ? byId.get(task.root_id) : undefined;
  const TypeIcon = task ? TYPE_ICON[task.type] : null;
  const flyX = fly ? (fly === 'end' ? 1 : -1) * (rtl ? -1 : 1) * 520 : dx;
  const cardStyle = {
    transform: `translateX(${flyX}px) rotate(${flyX / 22}deg)`,
    transition: dragging && !fly ? 'none' : 'transform 0.22s ease-out, opacity 0.22s',
    opacity: fly ? 0 : 1,
    '--keep': Math.max(0, Math.min(1, fwd / THRESHOLD)),
    '--later': Math.max(0, Math.min(1, -fwd / THRESHOLD)),
  } as CSSProperties;

  return (
    <Sheet open={open && !!task} onClose={onClose} title={tt('reviewTitle')} wide>
      {task && (
        <div className="todo-review">
          <div className="todo-review-top">
            <p className="muted small">{tt('reviewIntro')}</p>
            <span className="todo-review-n">{tt('reviewProgress', { n: leftovers.length })}</span>
          </div>

          <div className="todo-deck" data-more={Math.min(leftovers.length - 1, 2)}>
            <article
              key={task.id}
              className={`todo-card ty-${task.type} p${task.priority}`}
              style={cardStyle}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
                drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horiz: null };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== e.pointerId) return;
                const mx = e.clientX - d.x;
                const my = e.clientY - d.y;
                if (d.horiz === null && Math.hypot(mx, my) > 8) {
                  d.horiz = Math.abs(mx) > Math.abs(my);
                  if (d.horiz) {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(true);
                  }
                }
                if (d.horiz) setDx(mx);
              }}
              onPointerUp={() => {
                const d = drag.current;
                drag.current = null;
                setDragging(false);
                if (!d?.horiz) return setDx(0);
                if (fwd > THRESHOLD) decide('today');
                else if (fwd < -THRESHOLD) decide('pool');
                else setDx(0);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragging(false);
                setDx(0);
              }}
            >
              <span className="todo-stamp keep">{tt('keepToday')}</span>
              <span className="todo-stamp later">{tt('saveForLater')}</span>
              <span className="todo-card-day">
                {TypeIcon && <TypeIcon size={14} aria-hidden />} {tt(`ty_${task.type}`)} · {tt('fromDay', { day: dayLabel(task.day!, today, lang, tt) })}
              </span>
              {root && (
                <span className="todo-card-root" dir="auto">
                  {tt('partOf')} {root.title}
                </span>
              )}
              <h3 dir="auto">{task.title || tt('untitled')}</h3>
              {task.description && (
                <p className="todo-card-desc" dir="auto">
                  {task.description}
                </p>
              )}
              {waitFor.length > 0 && (
                <p className="todo-wait">
                  <Lock size={14} aria-hidden /> {tt('blockedBy', { list: waitFor.map((w) => w.title).join(', ') })}
                </p>
              )}
              <span className="todo-card-st muted small">{tt(`st_${task.status}`)}</span>
            </article>
          </div>
          <p className="todo-swipe-hint muted small" aria-hidden>
            {tt('swipeHint')}
          </p>

          <div className="todo-refine">
            <h4>{tt('refine')}</h4>
            <div className="todo-grid">
              <div className="todo-field">
                <span className="todo-field-l">{tt('priority')}</span>
                <Segmented label={tt('priority')} value={refine.priority} options={level('priority')} tone="level" onChange={(v) => setRefine((r) => ({ ...r, priority: v }))} />
              </div>
              <div className="todo-field">
                <span className="todo-field-l">{tt('urgency')}</span>
                <Segmented label={tt('urgency')} value={refine.urgency} options={level('urgency')} tone="level" onChange={(v) => setRefine((r) => ({ ...r, urgency: v }))} />
              </div>
              <div className="todo-field wide">
                <RemindField label={tt('remindMe')} value={refine.remind_on} today={today} onChange={(v) => setRefine((r) => ({ ...r, remind_on: v }))} />
              </div>
            </div>
          </div>

          <div className="todo-review-acts">
            <button type="button" className="btn primary" onClick={() => decide('pool')}>
              <Inbox size={18} /> {tt('saveForLater')}
            </button>
            <button type="button" className="btn" onClick={() => decide('today')}>
              <ArrowUpToLine size={18} /> {tt('keepToday')}
            </button>
            <button type="button" className="btn ghost" onClick={() => decide('done')}>
              <CircleCheck size={18} /> {tt('markDone')}
            </button>
            <button type="button" className="btn ghost danger" onClick={() => decide('drop')}>
              <CircleSlash size={18} /> {tt('drop')}
            </button>
          </div>
          <div className="todo-review-foot">
            {leftovers.length > 1 && (
              <>
                <button type="button" className="chip sm" onClick={() => onAll('pool')}>
                  <Inbox size={14} /> {tt('allToPool')}
                </button>
                <button type="button" className="chip sm" onClick={() => onAll('today')}>
                  <ArrowUpToLine size={14} /> {tt('allToToday')}
                </button>
              </>
            )}
            <button type="button" className="todo-link" onClick={onClose}>
              {tt('decideLater')}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
