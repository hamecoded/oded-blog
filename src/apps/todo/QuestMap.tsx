import { useEffect, useMemo, useRef } from 'react';
import type { Lang, Todo } from '../../lib/types';
import { alpha, ctx2d, easeBack, rrect, shade, wrap } from './draw';
import { useCanvasSize, type Palette } from './hooks';
import { isBlocked, isOpen, stepsOf } from './model';
import type { Tt } from './strings';

interface Node {
  kind: 'step' | 'action' | 'add' | 'trophy';
  id: string;
  x: number;
  y: number;
  r: number;
  /** Index among the steps (steps), or within the step (actions). */
  i: number;
  task?: Todo;
  parent?: number;
}

const GAP = 132;
const TOP = 82;
const MAX_ACTIONS = 6;

/** Where everything goes for a canvas `W` wide. Steps wind down a path; actions fan out beside their step. */
function layout(purpose: Todo, all: Todo[], W: number) {
  const steps = stepsOf(purpose.id, all);
  const amp = Math.min(W * 0.22, 120);
  const cx = W / 2;
  const nodes: Node[] = [];
  const path: { x: number; y: number }[] = [];
  steps.forEach((s, i) => {
    const x = cx + amp * Math.sin(i * 1.2 + 0.4);
    const y = TOP + i * GAP;
    nodes.push({ kind: 'step', id: s.id, x, y, r: 30, i, task: s });
    path.push({ x, y });
    // Actions: on the side with more room, in an arc.
    const acts = stepsOf(s.id, all);
    const side = x <= cx ? 1 : -1;
    const shown = acts.slice(0, MAX_ACTIONS);
    shown.forEach((a, j) => {
      const spread = Math.min(1.6, 0.42 * (shown.length - 1));
      const ang = (shown.length === 1 ? 0 : -spread / 2 + (spread * j) / (shown.length - 1)) + (side > 0 ? 0 : Math.PI);
      nodes.push({ kind: 'action', id: a.id, x: x + Math.cos(ang) * 62, y: y + Math.sin(ang) * 54, r: 12, i: j, task: a, parent: i });
    });
  });
  const n = steps.length;
  const addX = cx + amp * Math.sin(n * 1.2 + 0.4) * (n ? 1 : 0);
  const addY = TOP + n * GAP;
  nodes.push({ kind: 'add', id: 'add', x: addX, y: addY, r: 24, i: n });
  path.push({ x: addX, y: addY });
  const tY = addY + GAP * 0.85;
  nodes.push({ kind: 'trophy', id: 'trophy', x: cx, y: tY, r: 36, i: n + 1 });
  path.push({ x: cx, y: tY });
  return { steps, nodes, path, height: tY + 80 };
}

/**
 * A quest on a canvas: the root purpose's steps as stops along a winding road, each step's actions as small
 * stones around it, the next playable step pulsing with a "GO" bubble, and a trophy at the end that lights up
 * when every step is completed. Tap a stop to open it, the dashed one to add a step. A hidden list of
 * buttons mirrors the map for keyboards and screen readers.
 */
export function QuestMap({
  purpose,
  all,
  byId,
  pal,
  reduced,
  lang,
  tt,
  onOpen,
  onAdd,
}: {
  purpose: Todo;
  all: Todo[];
  byId: Map<string, Todo>;
  pal: Palette | null;
  reduced: boolean;
  lang: Lang;
  tt: Tt;
  onOpen: (id: string) => void;
  onAdd: (purpose: Todo) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(ref);
  const W = size.w || 360;
  const map = useMemo(() => layout(purpose, all, W), [purpose, all, W]);
  const born = useRef({ id: '', at: 0 });
  const down = useRef<{ x: number; y: number } | null>(null);

  const current = map.steps.find((s) => isOpen(s) && s.status !== 'onhold' && !isBlocked(s, byId));
  const allDone = map.steps.length > 0 && map.steps.every((s) => !isOpen(s));

  useEffect(() => {
    const c = ref.current;
    if (!c || !pal || !size.w) return;
    if (born.current.id !== purpose.id) born.current = { id: purpose.id, at: performance.now() };
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - born.current.at) / 1000;
      drawMap(c, size.w, size.h, map, current?.id, allDone, pal, lang, tt, reduced ? 99 : t, byId);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [map, size, pal, lang, tt, reduced, current?.id, allDone, purpose.id, byId]);

  const hit = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    // Actions first: they sit on top of the road.
    const order = [...map.nodes].sort((a, b) => (a.kind === 'action' ? -1 : 0) - (b.kind === 'action' ? -1 : 0));
    return order.find((n) => Math.hypot(n.x - x, n.y - y) <= n.r + (n.kind === 'action' ? 8 : 6));
  };

  return (
    <div className="todo-quest-map">
      <canvas
        ref={ref}
        style={{ blockSize: `${map.height}px` }}
        aria-hidden
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onPointerMove={(e) => {
          const n = hit(e.clientX, e.clientY);
          e.currentTarget.style.cursor = n && n.kind !== 'trophy' ? 'pointer' : '';
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (!d || Math.hypot(d.x - e.clientX, d.y - e.clientY) > 10) return;
          const n = hit(e.clientX, e.clientY);
          if (!n) return;
          if (n.kind === 'add') onAdd(purpose);
          else if (n.task) onOpen(n.task.id);
        }}
      />
      <ol className="sr-only">
        {map.steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => onOpen(s.id)}>
              {tt('nOfTier', { tier: tt('tier_step'), n: i + 1, m: map.steps.length })}: {s.title || tt('untitled')} ({tt(`st_${s.status}`)})
            </button>
            <ul>
              {stepsOf(s.id, all).map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a.id)}>
                    {tt('tier_action')}: {a.title || tt('untitled')} ({tt(`st_${a.status}`)})
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => onAdd(purpose)}>
            {tt('addStepHere')}
          </button>
        </li>
      </ol>
    </div>
  );
}

function drawMap(
  c: HTMLCanvasElement,
  W: number,
  H: number,
  map: ReturnType<typeof layout>,
  currentId: string | undefined,
  allDone: boolean,
  pal: Palette,
  lang: Lang,
  tt: Tt,
  t: number,
  byId: Map<string, Todo>,
) {
  const g = ctx2d(c);
  if (!g) return;
  g.clearRect(0, 0, W, H);
  g.direction = lang === 'he' ? 'rtl' : 'ltr';
  const font = (w: number, px: number) => `${w} ${px}px ${pal.font}`;
  const appear = (i: number) => easeBack((t - i * 0.07) / 0.45);

  // ── Road ──
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    g.beginPath();
    g.moveTo(a.x, a.y);
    const dy = (b.y - a.y) * 0.55;
    g.bezierCurveTo(a.x, a.y + dy, b.x, b.y - dy, b.x, b.y);
  };
  g.lineCap = 'round';
  for (let i = 0; i < map.path.length - 1; i++) {
    const a = map.path[i];
    const b = map.path[i + 1];
    const reached = i < map.steps.length && map.steps[i].status === 'completed';
    g.lineWidth = 18;
    g.strokeStyle = shade(pal.track, -0.06);
    seg({ x: a.x, y: a.y + 4 }, { x: b.x, y: b.y + 4 });
    g.stroke();
    g.strokeStyle = reached ? pal.gold : pal.track;
    seg(a, b);
    g.stroke();
    g.setLineDash([2, 12]);
    g.lineWidth = 3;
    g.strokeStyle = reached ? 'rgba(255,255,255,0.75)' : alpha(pal.surface, 0.9);
    seg(a, b);
    g.stroke();
    g.setLineDash([]);
  }

  // ── Stops ──
  map.nodes.forEach((n) => {
    const k = n.kind === 'action' ? appear((n.parent ?? 0) + 0.5 + n.i * 0.1) : appear(n.i);
    if (k <= 0.01) return;
    g.save();
    g.translate(n.x, n.y);
    g.scale(k, k);
    if (n.kind === 'step') drawStep(g, n, n.task!, n.task!.id === currentId, pal, t, byId, font);
    else if (n.kind === 'action') drawAction(g, n, n.task!, pal, byId);
    else if (n.kind === 'add') drawAdd(g, n, pal, font);
    else drawTrophy(g, n, allDone, pal, t);
    g.restore();
  });

  // ── Labels under steps (drawn last so stones never cover them) ──
  g.textAlign = 'center';
  g.textBaseline = 'top';
  map.nodes.forEach((n) => {
    if (n.kind !== 'step' || appear(n.i) < 0.6) return;
    const task = n.task!;
    g.font = font(800, 13);
    const lines = wrap(g, task.title || tt('untitled'), Math.min(170, W * 0.46), 2);
    const lh = 16;
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 14;
    const y0 = n.y + n.r + 12;
    rrect(g, n.x - w / 2, y0 - 3, w, lines.length * lh + 6, 8);
    g.fillStyle = alpha(pal.surface, 0.92);
    g.fill();
    g.fillStyle = task.status === 'quit' ? pal.muted : pal.text;
    lines.forEach((l, i) => g.fillText(l, n.x, y0 + i * lh));
  });
  map.nodes.forEach((n) => {
    if (n.kind === 'add') {
      g.font = font(700, 12);
      g.fillStyle = pal.muted;
      g.fillText(tt('addStepHere'), n.x, n.y + n.r + 8);
    }
    if (n.kind === 'trophy' && allDone) {
      g.font = font(900, 15);
      g.fillStyle = pal.goldDeep;
      g.fillText(tt('questComplete'), n.x, n.y + n.r + 10);
    }
  });

  // ── "GO" bubble over the current step ──
  const cur = map.nodes.find((n) => n.kind === 'step' && n.task!.id === currentId);
  if (cur && appear(cur.i) > 0.9) {
    const bob = Math.sin(t * 4) * 3;
    g.font = font(900, 13);
    const label = tt('questGo');
    const w = g.measureText(label).width + 22;
    const y = cur.y - cur.r - 34 + bob;
    rrect(g, cur.x - w / 2, y + 3, w, 26, 13);
    g.fillStyle = shade(pal.accent, -0.35);
    g.fill();
    rrect(g, cur.x - w / 2, y, w, 26, 13);
    g.fillStyle = pal.accent;
    g.fill();
    g.beginPath();
    g.moveTo(cur.x - 7, y + 25);
    g.lineTo(cur.x + 7, y + 25);
    g.lineTo(cur.x, y + 33);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.fillText(label, cur.x, y + 13.5);
  }
}

type FontFn = (w: number, px: number) => string;

/** A round 3D button: a darker base under a lit face. */
function button3d(g: CanvasRenderingContext2D, r: number, color: string, depth = 6) {
  g.beginPath();
  g.arc(0, depth, r, 0, Math.PI * 2);
  g.fillStyle = shade(color, -0.32);
  g.fill();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  const grad = g.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, shade(color, 0.3));
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.fill();
  g.beginPath();
  g.ellipse(0, -r * 0.5, r * 0.6, r * 0.28, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fill();
}

function glyph(g: CanvasRenderingContext2D, kind: 'check' | 'lock' | 'pause' | 'x', s: number, color = '#fff') {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = s * 0.22;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'check') {
    g.moveTo(-s * 0.45, 0);
    g.lineTo(-s * 0.12, s * 0.32);
    g.lineTo(s * 0.5, -s * 0.35);
    g.stroke();
  } else if (kind === 'x') {
    g.moveTo(-s * 0.35, -s * 0.35);
    g.lineTo(s * 0.35, s * 0.35);
    g.moveTo(s * 0.35, -s * 0.35);
    g.lineTo(-s * 0.35, s * 0.35);
    g.stroke();
  } else if (kind === 'pause') {
    g.fillRect(-s * 0.35, -s * 0.4, s * 0.24, s * 0.8);
    g.fillRect(s * 0.11, -s * 0.4, s * 0.24, s * 0.8);
  } else {
    rrect(g, -s * 0.42, -s * 0.05, s * 0.84, s * 0.6, s * 0.1);
    g.fill();
    g.lineWidth = s * 0.16;
    g.beginPath();
    g.arc(0, -s * 0.08, s * 0.26, Math.PI, 0);
    g.stroke();
  }
}

function drawStep(
  g: CanvasRenderingContext2D,
  n: Node,
  task: Todo,
  current: boolean,
  pal: Palette,
  t: number,
  byId: Map<string, Todo>,
  font: FontFn,
) {
  const locked = isOpen(task) && isBlocked(task, byId);
  const color =
    task.status === 'completed'
      ? pal.gold
      : task.status === 'quit'
        ? shade(pal.track, -0.2)
        : locked
          ? shade(pal.track, -0.12)
          : pal.st[task.status];
  if (current) {
    const p = (Math.sin(t * 3.2) + 1) / 2;
    g.beginPath();
    g.arc(0, 2, n.r + 8 + p * 6, 0, Math.PI * 2);
    g.fillStyle = alpha(color, 0.18 + 0.12 * (1 - p));
    g.fill();
  }
  button3d(g, n.r, color);
  // Progress of its actions as a ring.
  const kids = [...byId.values()].filter((k) => k.root_id === task.id && k.status !== 'quit');
  if (kids.length) {
    const f = kids.filter((k) => k.status === 'completed').length / kids.length;
    g.lineWidth = 4;
    g.strokeStyle = alpha(pal.surface, 0.55);
    g.beginPath();
    g.arc(0, 0, n.r + 5, 0, Math.PI * 2);
    g.stroke();
    if (f > 0) {
      g.strokeStyle = pal.gold;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0, n.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
      g.stroke();
    }
  }
  if (task.status === 'completed') glyph(g, 'check', 26);
  else if (task.status === 'quit') glyph(g, 'x', 22);
  else if (locked) glyph(g, 'lock', 24, alpha('#ffffff', 0.92));
  else if (task.status === 'onhold') glyph(g, 'pause', 24);
  else {
    g.fillStyle = '#fff';
    g.font = font(900, 20);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n.i + 1), 0, 1);
  }
}

function drawAction(g: CanvasRenderingContext2D, n: Node, task: Todo, pal: Palette, byId: Map<string, Todo>) {
  const locked = isOpen(task) && isBlocked(task, byId);
  const color = task.status === 'completed' ? pal.gold : task.status === 'quit' || locked ? shade(pal.track, -0.15) : pal.st[task.status];
  button3d(g, n.r, color, 3);
  if (task.status === 'completed') glyph(g, 'check', 12);
  else if (task.status === 'quit') glyph(g, 'x', 10);
}

function drawAdd(g: CanvasRenderingContext2D, n: Node, pal: Palette, font: FontFn) {
  g.beginPath();
  g.arc(0, 0, n.r, 0, Math.PI * 2);
  g.fillStyle = pal.surface;
  g.fill();
  g.setLineDash([5, 5]);
  g.lineWidth = 3;
  g.strokeStyle = pal.accent;
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = pal.accent;
  g.font = font(800, 26);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('+', 0, 1);
}

function drawTrophy(g: CanvasRenderingContext2D, n: Node, lit: boolean, pal: Palette, t: number) {
  if (lit) {
    // Rays turning slowly behind the cup.
    g.save();
    g.rotate(t * 0.4);
    for (let i = 0; i < 12; i++) {
      g.rotate((Math.PI * 2) / 12);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-7, -n.r * 1.9);
      g.lineTo(7, -n.r * 1.9);
      g.closePath();
      g.fillStyle = alpha(pal.gold, 0.18);
      g.fill();
    }
    g.restore();
  }
  button3d(g, n.r, lit ? pal.gold : shade(pal.track, -0.08), 7);
  const c = lit ? '#fff' : alpha(pal.muted, 0.8);
  g.fillStyle = c;
  g.strokeStyle = c;
  g.lineWidth = 3;
  // cup
  g.beginPath();
  g.moveTo(-11, -12);
  g.lineTo(11, -12);
  g.quadraticCurveTo(11, 4, 0, 6);
  g.quadraticCurveTo(-11, 4, -11, -12);
  g.fill();
  // handles
  g.beginPath();
  g.arc(-12, -6, 5, Math.PI * 0.5, Math.PI * 1.5);
  g.stroke();
  g.beginPath();
  g.arc(12, -6, 5, -Math.PI * 0.5, Math.PI * 0.5);
  g.stroke();
  // stem and base
  g.fillRect(-2.5, 5, 5, 6);
  rrect(g, -9, 11, 18, 5, 2);
  g.fill();
}
