import { useEffect, useState, type RefObject } from 'react';
import type { TodoStatus, TodoType } from '../../lib/types';
import { TODO_TYPES as TYPES } from '../../lib/util';
import { isoDay } from './model';

/** Today's date ('YYYY-MM-DD'), moving on at midnight while the app stays open (checked on return and every minute). */
export function useToday(): string {
  const [today, setToday] = useState(isoDay);
  useEffect(() => {
    const check = () => setToday(isoDay());
    const timer = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return today;
}

/**
 * Phone-friendly page: no zooming (pinch, double-tap, or the automatic zoom into a focused field), and
 * --header-h set to the site header's height so the app's own bars can stick right under it.
 * Both are put back when the app closes.
 */
export function useAppChrome() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.content;
    if (meta && before) {
      const fit = /viewport-fit=cover/.test(before) ? ', viewport-fit=cover' : '';
      meta.content = `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no${fit}`;
    }
    const root = document.documentElement.style;
    const header = document.querySelector<HTMLElement>('.site-header');
    const measure = () => root.setProperty('--header-h', `${header?.offsetHeight ?? 0}px`);
    measure();
    const ro = header ? new ResizeObserver(measure) : null;
    if (header) ro?.observe(header);
    return () => {
      if (meta && before) meta.content = before;
      ro?.disconnect();
      root.removeProperty('--header-h');
    };
  }, []);
}

/** The colours canvas drawings use, read from the CSS tokens so they follow the light/dark theme. */
export interface Palette {
  text: string;
  muted: string;
  surface: string;
  surface2: string;
  border: string;
  accent: string;
  accent2: string;
  gold: string;
  goldDeep: string;
  track: string;
  font: string;
  st: Record<TodoStatus, string>;
  ty: Record<TodoType, string>;
}

const STATUSES: TodoStatus[] = ['discovered', 'researched', 'defined', 'blocked', 'onhold', 'inprogress', 'completed', 'quit'];

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    text: v('--text', '#1f2330'),
    muted: v('--muted', '#6b6f7d'),
    surface: v('--surface', '#fff'),
    surface2: v('--surface-2', '#f0efe9'),
    border: v('--border', '#e3e1d8'),
    accent: v('--accent', '#4f46e5'),
    accent2: v('--accent-2', '#db2777'),
    gold: v('--tg-gold', '#f5b301'),
    goldDeep: v('--tg-gold-deep', '#c98a00'),
    track: v('--tg-track', '#e5e3dc'),
    font: v('--ui-font', 'system-ui, sans-serif'),
    st: Object.fromEntries(STATUSES.map((s) => [s, v(`--st-${s}`, '#888')])) as Record<TodoStatus, string>,
    ty: Object.fromEntries(TYPES.map((s) => [s, v(`--ty-${s}`, '#888')])) as Record<TodoType, string>,
  };
}

/** The palette under `el`, read again when the theme changes (system setting or the site's own switch). */
export function usePalette(el: HTMLElement | null): Palette | null {
  const [pal, setPal] = useState<Palette | null>(null);
  useEffect(() => {
    if (!el) return;
    const read = () => setPal(readPalette(el));
    const raf = requestAnimationFrame(read);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener('change', read);
      mo.disconnect();
    };
  }, [el]);
  return pal;
}

/** True when the viewer asked their system for less motion: canvases then draw still frames. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Keeps a canvas's bitmap at its CSS size × device pixel ratio; returns that CSS size. */
export function useCanvasSize(ref: RefObject<HTMLCanvasElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
