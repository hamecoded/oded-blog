import { useEffect, useRef, useState } from 'react';

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

const HOVER_DELAY = 350;
const PRESS_DELAY = 450;
const TOUCH_SHOW = 2200;

/**
 * Tooltips for anything inside `root` carrying `data-tip`: on hover with a mouse, on keyboard focus, and on a long
 * press on touch screens (where native `title` tooltips never show). A long press only shows the tip: the tap it
 * would otherwise become (opening the task, completing it) is swallowed.
 */
export function TipLayer({ root }: { root: HTMLElement | null }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    if (!root) return;
    let timer = 0;
    let hideTimer = 0;
    let press: { x: number; y: number } | null = null;
    let swallow = false;

    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 90;
      setNudge(0);
      setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const hide = () => {
      clearTimeout(timer);
      setTip(null);
    };
    const target = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;

    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = target(e);
      clearTimeout(timer);
      if (!el) return setTip(null);
      timer = window.setTimeout(() => show(el), HOVER_DELAY);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const to = (e.relatedTarget as Element | null)?.closest?.('[data-tip]');
      if (to !== target(e)) hide();
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return hide();
      const el = target(e);
      clearTimeout(timer);
      clearTimeout(hideTimer);
      setTip(null);
      if (!el) return;
      press = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        swallow = true;
        show(el);
        navigator.vibrate?.(8);
        hideTimer = window.setTimeout(() => setTip(null), TOUCH_SHOW);
      }, PRESS_DELAY);
    };
    const move = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
        clearTimeout(timer);
        press = null;
      }
    };
    const up = () => {
      clearTimeout(timer);
      press = null;
    };
    const click = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const focus = (e: FocusEvent) => {
      const el = target(e);
      if (el && el.matches(':focus-visible')) show(el);
    };
    const blur = () => hide();
    const menu = (e: Event) => {
      if (target(e)) e.preventDefault(); // no "copy / look up" menu on a long press
    };

    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('click', click, true);
    root.addEventListener('focusin', focus);
    root.addEventListener('focusout', blur);
    root.addEventListener('contextmenu', menu);
    window.addEventListener('scroll', hide, { passive: true });
    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerout', out);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('click', click, true);
      root.removeEventListener('focusin', focus);
      root.removeEventListener('focusout', blur);
      root.removeEventListener('contextmenu', menu);
      window.removeEventListener('scroll', hide);
    };
  }, [root]);

  // Keep the bubble on screen: measured after it renders, shifted sideways if it pokes out.
  useEffect(() => {
    const b = bubble.current;
    if (!tip || !b) return;
    const r = b.getBoundingClientRect();
    const over = r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : r.left < 8 ? 8 - r.left : 0;
    if (over) requestAnimationFrame(() => setNudge(over));
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      className={`todo-tip${tip.below ? ' is-below' : ''}`}
      role="tooltip"
      style={{ left: tip.x + nudge, top: tip.y, '--nudge': `${-nudge}px` } as React.CSSProperties}
    >
      {tip.text}
    </div>
  );
}
