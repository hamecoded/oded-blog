// Small canvas helpers shared by the HUD, the quest map and the effects layer.

/** Context scaled so drawing uses CSS pixels. */
export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const g = c.getContext('2d');
  if (!g) return null;
  const r = c.getBoundingClientRect();
  const k = r.width ? c.width / r.width : 1;
  g.setTransform(k, 0, 0, k, 0, 0);
  return g;
}

export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** A colour made lighter (amt > 0) or darker (amt < 0); accepts #rgb, #rrggbb and rgb(). */
export function shade(color: string, amt: number): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(rgb[0])}, ${f(rgb[1])}, ${f(rgb[2])})`;
}

export function alpha(color: string, a: number): string {
  const rgb = toRgb(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})` : color;
}

function toRgb(c: string): [number, number, number] | null {
  const s = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  const r = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
  return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : null;
}

/** Wraps text to at most `lines` lines of `max` width, ending with … when cut. */
export function wrap(g: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (g.measureText(next).width <= max) {
      cur = next;
      continue;
    }
    if (cur) out.push(cur);
    cur = words[i];
    if (out.length === lines) break;
  }
  if (out.length < lines && cur) out.push(cur);
  const used = out.join(' ').split(/\s+/).length;
  if (used < words.length || g.measureText(out[out.length - 1] ?? '').width > max) {
    let last = out[out.length - 1] ?? '';
    while (last && g.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    out[out.length - 1] = `${last}…`;
  }
  return out.slice(0, lines);
}

export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeBack = (t: number) => {
  const c = 1.70158;
  const x = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
