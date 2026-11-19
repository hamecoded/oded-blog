import { useEffect, useRef } from 'react';
import type { Lang } from '../../lib/types';
import { alpha, ctx2d, easeBack, rrect, shade } from './draw';
import { useCanvasSize, type Palette } from './hooks';
import type { Stats } from './model';
import type { Tt } from './strings';

interface Shown {
  xp: number;
  /** 0–1: how far the level-up flash and the bar's shine have run. */
  flash: number;
  shine: number;
}

/**
 * The game bar across the top: level badge, a progress bar and the streak flame. On Today (`mode` 'day') the bar
 * is the day's list: tasks done out of the tasks set for today; elsewhere ('xp') it's the experience towards the
 * next level. Drawn on a canvas; the bar glides to its new value and shines when it grows.
 */
export function Hud({
  stats,
  done,
  total,
  pal,
  reduced,
  lang,
  tt,
  onLevel,
  mode,
  home,
}: {
  /** The app's icon (back to the Apps page), at the bar's inline start. */
  home: React.ReactNode;
  mode: 'day' | 'xp';
  /** Opens the explanation of levels (a tap on the badge). */
  onLevel: () => void;
  stats: Stats;
  done: number;
  total: number;
  pal: Palette | null;
  reduced: boolean;
  lang: Lang;
  tt: Tt;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(ref);
  const shown = useRef<Shown | null>(null);
  const prevLevel = useRef(stats.level);
  const raf = useRef(0);

  const xpTarget = mode === 'day' ? (total ? done / total : 0) : stats.span ? stats.into / stats.span : 0;

  useEffect(() => {
    const c = ref.current;
    if (!c || !pal || !size.w) return;
    const s = (shown.current ??= { xp: xpTarget, flash: 1, shine: 1 });
    if (stats.level !== prevLevel.current) {
      // Levelled up (or down, after reopening): the bar restarts from its far end.
      if (stats.level > prevLevel.current) s.xp = 0;
      s.flash = 0;
      prevLevel.current = stats.level;
    }
    if (Math.abs(s.xp - xpTarget) > 0.001) s.shine = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (reduced) {
        s.xp = xpTarget;
        s.flash = s.shine = 1;
      } else {
        s.xp += (xpTarget - s.xp) * Math.min(1, dt * 6);
        s.flash = Math.min(1, s.flash + dt / 0.9);
        s.shine = Math.min(1, s.shine + dt / 1.2);
      }
      draw(c, size.w, size.h, s, stats, done, total, pal, lang, tt, mode);
      const moving = Math.abs(s.xp - xpTarget) > 0.002 || s.flash < 1 || s.shine < 1;
      raf.current = moving ? requestAnimationFrame(frame) : 0;
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, [xpTarget, stats, done, total, pal, size, reduced, lang, tt, mode]);

  const label = [
    tt('level', { n: stats.level }),
    mode === 'day' ? (total ? tt('todayRing', { n: done, m: total }) : tt('dayBarEmpty')) : tt('xpOf', { n: stats.into, m: stats.span }),
    stats.streak ? tt('streak', { n: stats.streak }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="todo-hud-wrap">
      <canvas ref={ref} className="todo-hud" role="img" aria-label={label} />
      <span className="todo-hud-home">{home}</span>
      {/* The badge is drawn on the canvas; this invisible button over it makes it tappable and focusable. */}
      <button type="button" className="todo-hud-level" onClick={onLevel} aria-label={tt('levelsOpen', { n: stats.level })} data-tip={tt('levelsOpen', { n: stats.level })} />
    </div>
  );
}

function draw(
  c: HTMLCanvasElement,
  W: number,
  H: number,
  s: Shown,
  stats: Stats,
  done: number,
  total: number,
  pal: Palette,
  lang: Lang,
  tt: Tt,
  mode: 'day' | 'xp',
) {
  const g = ctx2d(c);
  if (!g) return;
  g.clearRect(0, 0, W, H);
  const rtl = lang === 'he';
  const X = (x: number) => (rtl ? W - x : x);
  const cy = H / 2;
  g.direction = rtl ? 'rtl' : 'ltr';
  const font = (w: number, px: number) => `${w} ${px}px ${pal.font}`;

  // ── Level badge (inline end; the app icon is at the start): a hexagon with depth, popping on level up ──
  const bx = X(W - 28);
  const pop = s.flash < 1 ? 1 + 0.25 * Math.sin(easeBack(s.flash) * Math.PI) : 1;
  const hex = (r: number, dy: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      g.lineTo(bx + Math.cos(a) * r, cy + dy + Math.sin(a) * r);
    }
    g.closePath();
  };
  const R = 21 * pop;
  hex(R, 3);
  g.fillStyle = shade(pal.accent, -0.35);
  g.fill();
  hex(R, 0);
  const grad = g.createLinearGradient(bx, cy - R, bx, cy + R);
  grad.addColorStop(0, shade(pal.accent, 0.15));
  grad.addColorStop(1, pal.accent2);
  g.fillStyle = grad;
  g.fill();
  if (s.flash < 1) {
    g.strokeStyle = alpha(pal.gold, 1 - s.flash);
    g.lineWidth = 3;
    hex(R + 6 * s.flash, 0);
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(800, 8);
  g.fillText(tt('lv').toUpperCase(), bx, cy - 9);
  g.font = font(900, 17);
  g.fillText(String(stats.level), bx, cy + 4);

  // ── Streak flame ──
  const fx = X(W - 72);
  const lit = stats.streak > 0;
  g.save();
  g.translate(fx, cy - 2);
  const flame = (k: number) => {
    g.beginPath();
    g.moveTo(0, -14 * k);
    g.bezierCurveTo(9 * k, -4 * k, 10 * k, 4 * k, 0, 11 * k);
    g.bezierCurveTo(-10 * k, 4 * k, -9 * k, -4 * k, 0, -14 * k);
    g.closePath();
  };
  flame(1);
  const fg = g.createLinearGradient(0, -14, 0, 11);
  fg.addColorStop(0, lit ? '#ffcf3f' : pal.track);
  fg.addColorStop(1, lit ? '#ff5a1f' : shade(pal.track, -0.15));
  g.fillStyle = fg;
  g.fill();
  if (lit) {
    flame(0.5);
    g.fillStyle = '#fff3b0';
    g.translate(0, 4);
    g.fill();
  }
  g.restore();
  g.fillStyle = lit ? pal.text : pal.muted;
  g.font = font(800, 11);
  g.fillText(String(stats.streak), fx, cy + 19);

  // ── XP bar ──
  const x0 = 58;
  const x1 = W - 96;
  const bw = Math.max(40, x1 - x0);
  const by = cy + 1;
  const bh = 13;
  const barX = rtl ? W - x0 - bw : x0;
  g.textBaseline = 'alphabetic';
  g.textAlign = rtl ? 'right' : 'left';
  g.fillStyle = pal.text;
  g.font = font(800, 13);
  g.fillText(mode === 'day' ? tt('today') : tt('level', { n: stats.level }), X(x0), by - 6);
  g.textAlign = rtl ? 'left' : 'right';
  g.fillStyle = pal.muted;
  g.font = font(700, 11);
  g.direction = mode === 'day' && rtl ? 'rtl' : 'ltr';
  g.textAlign = rtl ? 'left' : 'right';
  g.fillText(
    mode === 'day' ? (total ? tt('dayBar', { n: done, m: total }) : tt('dayBarEmpty')) : tt('xpOf', { n: stats.into, m: stats.span }),
    X(x0 + bw),
    by - 6,
  );
  g.direction = rtl ? 'rtl' : 'ltr';

  rrect(g, barX, by, bw, bh, bh / 2);
  g.fillStyle = pal.track;
  g.fill();
  const fw = Math.max(0, Math.min(1, s.xp)) * bw;
  if (fw > 1) {
    g.save();
    rrect(g, barX, by, bw, bh, bh / 2);
    g.clip();
    const fx0 = rtl ? barX + bw - fw : barX;
    const bg = g.createLinearGradient(barX, 0, barX + bw, 0);
    bg.addColorStop(0, pal.gold);
    bg.addColorStop(1, '#ff8a1f');
    g.fillStyle = bg;
    g.fillRect(fx0, by, fw, bh);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(fx0, by + 2, fw, bh / 2 - 2);
    if (s.shine < 1) {
      const sx = fx0 + (rtl ? fw - fw * s.shine : fw * s.shine);
      const sg = g.createLinearGradient(sx - 24, 0, sx + 24, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.8)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg;
      g.fillRect(sx - 24, by, 48, bh);
    }
    g.restore();
  }
  // Tick marks: one per task on Today (when they fit), otherwise every 10%.
  const ticks = mode === 'day' && total > 1 && total <= 20 ? total : 10;
  g.fillStyle = alpha(pal.surface, 0.5);
  for (let i = 1; i < ticks; i++) g.fillRect(barX + (bw * i) / ticks, by + 3, 1, bh - 6);
}
