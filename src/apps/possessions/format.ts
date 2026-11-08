import type { Lang } from '../../lib/types';

export const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

const KEY = 'possessions.currency';

export function loadCurrency(lang: Lang): Currency {
  try {
    const c = localStorage.getItem(KEY) as Currency | null;
    if (c && CURRENCIES.includes(c)) return c;
  } catch {
    /* storage unavailable */
  }
  return lang === 'he' ? 'ILS' : 'USD';
}

export function saveCurrency(c: Currency) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* storage unavailable */
  }
}

const locale = (lang: Lang) => (lang === 'he' ? 'he-IL' : 'en-US');

export function money(n: number | null | undefined, currency: Currency, lang: Lang): string {
  if (n == null) return '';
  return new Intl.NumberFormat(locale(lang), {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

export function count(n: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(n);
}

export function day(iso: string | null, lang: Lang): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Makes an item photo small before upload: at most `max` px on its longer side, re-encoded as WebP (JPEG where
 * the browser can't write WebP), whichever is smaller. Re-encoding also drops the photo's metadata, including
 * the GPS position phones store in it. Falls back to the original file if the browser can't decode it.
 */
export async function shrinkImage(file: File, max = 1200): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif|avif|bmp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const encode = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    // Safari can't write WebP and hands back a PNG instead; then JPEG is the smaller choice.
    let blob = await encode('image/webp', 0.8);
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.82);
    if (!blob) return file;
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

const AUTO_KEY = 'possessions.autoCutOut';

/** "Remove the background from new photos automatically", remembered in this browser. */
export function loadAutoCutOut(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAutoCutOut(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export type View = 'table' | 'cards';
const VIEW_KEY = 'possessions.view';

/** Table or cards, remembered per browser; phones start with cards. */
export function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'table' || v === 'cards') return v;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(max-width: 700px)').matches ? 'cards' : 'table';
}

export function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* storage unavailable */
  }
}
