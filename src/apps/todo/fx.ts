import { alpha } from './draw';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: 'dot' | 'star' | 'chip';
  rot: number;
  vr: number;
  gravity: number;
}
interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}
interface Ring {
  x: number;
  y: number;
  color: string;
  life: number;
  max: number;
  r: number;
}

/**
 * Celebration effects drawn on one full-screen canvas above the app (pointer-events: none): bursts of particles
 * where a task was completed, floating "+XP" numbers, shock rings and level-up confetti. The animation loop runs
 * only while something is on screen. With reduced motion everything is skipped except the floating text.
 */
export class Fx {
  private canvas: HTMLCanvasElement | null = null;
  private ps: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: Ring[] = [];
  private raf = 0;
  private last = 0;
  reduced = false;
  font = 'system-ui, sans-serif';

  configure(reduced: boolean, font: string) {
    this.reduced = reduced;
    this.font = font;
  }

  attach(c: HTMLCanvasElement | null) {
    this.canvas = c;
    if (!c) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  burst(x: number, y: number, colors: string[], n = 26) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 260;
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0,
        max: 0.6 + Math.random() * 0.5,
        size: 3 + Math.random() * 4,
        color: colors[i % colors.length],
        shape: i % 3 === 0 ? 'star' : i % 3 === 1 ? 'dot' : 'chip',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        gravity: 520,
      });
    }
    this.rings.push({ x, y, color: colors[0], life: 0, max: 0.45, r: 46 });
    this.start();
  }

  float(x: number, y: number, text: string, color: string, size = 20) {
    this.texts.push({ x, y, text, color, life: 0, max: 1.1, size });
    this.start();
  }

  /** Confetti raining from the top edge: a level up. */
  confetti(colors: string[]) {
    if (this.reduced) return;
    const w = window.innerWidth;
    for (let i = 0; i < 140; i++) {
      this.ps.push({
        x: Math.random() * w,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 120,
        vy: 80 + Math.random() * 160,
        life: 0,
        max: 2.2 + Math.random() * 1.2,
        size: 4 + Math.random() * 5,
        color: colors[i % colors.length],
        shape: 'chip',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        gravity: 60,
      });
    }
    this.start();
  }

  private start() {
    if (this.raf || !this.canvas) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const c = this.canvas;
    if (!c) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    this.rings = this.rings.filter((r) => (r.life += dt) < r.max);
    this.rings.forEach((r) => {
      const t = r.life / r.max;
      g.strokeStyle = alpha(r.color, 1 - t);
      g.lineWidth = 4 * (1 - t) + 1;
      g.beginPath();
      g.arc(r.x, r.y, 8 + r.r * t, 0, Math.PI * 2);
      g.stroke();
    });

    this.ps = this.ps.filter((p) => (p.life += dt) < p.max);
    this.ps.forEach((p) => {
      p.vy += p.gravity * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const t = p.life / p.max;
      g.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      g.fillStyle = p.color;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      if (p.shape === 'dot') {
        g.beginPath();
        g.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        g.fill();
      } else if (p.shape === 'chip') {
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        star(g, p.size);
      }
      g.restore();
    });
    g.globalAlpha = 1;

    this.texts = this.texts.filter((x) => (x.life += dt) < x.max);
    this.texts.forEach((x) => {
      const t = x.life / x.max;
      const rise = 46 * (1 - Math.pow(1 - t, 2));
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : t < 0.25 ? 1.1 - ((t - 0.15) / 0.1) * 0.1 : 1;
      g.globalAlpha = t > 0.65 ? (1 - t) / 0.35 : 1;
      g.font = `900 ${Math.round(x.size * pop)}px ${this.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.direction = /[\u0590-\u05ff]/.test(x.text) ? 'rtl' : 'ltr';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.strokeText(x.text, x.x, x.y - rise);
      g.fillStyle = x.color;
      g.fillText(x.text, x.x, x.y - rise);
    });
    g.globalAlpha = 1;

    if (this.ps.length || this.texts.length || this.rings.length) this.raf = requestAnimationFrame(this.tick);
    else {
      this.raf = 0;
      g.clearRect(0, 0, w, h);
    }
  };
}

function star(g: CanvasRenderingContext2D, s: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.45 : s;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}
