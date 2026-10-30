/** Google Fonts that include the Hebrew subset. Loaded lazily on first use. */
export interface FontDef {
  family: string;
  label: { he: string; en: string };
  kind: 'sans' | 'serif' | 'display' | 'hand';
  weights: string;
  fallback: string;
}

export const FONTS: FontDef[] = [
  { family: 'Heebo', label: { he: 'חיבו', en: 'Heebo' }, kind: 'sans', weights: '400;500;700', fallback: 'sans-serif' },
  { family: 'Assistant', label: { he: 'אסיסטנט', en: 'Assistant' }, kind: 'sans', weights: '400;600;700', fallback: 'sans-serif' },
  { family: 'Rubik', label: { he: 'רוביק', en: 'Rubik' }, kind: 'sans', weights: '400;500;700', fallback: 'sans-serif' },
  { family: 'Varela Round', label: { he: 'ורלה עגול', en: 'Varela Round' }, kind: 'sans', weights: '400', fallback: 'sans-serif' },
  { family: 'Frank Ruhl Libre', label: { he: 'פרנק רוהל', en: 'Frank Ruhl Libre' }, kind: 'serif', weights: '400;500;700', fallback: 'serif' },
  { family: 'David Libre', label: { he: 'דוד', en: 'David Libre' }, kind: 'serif', weights: '400;700', fallback: 'serif' },
  { family: 'Noto Serif Hebrew', label: { he: 'נוטו סריף', en: 'Noto Serif Hebrew' }, kind: 'serif', weights: '400;700', fallback: 'serif' },
  { family: 'Suez One', label: { he: 'סואץ', en: 'Suez One' }, kind: 'display', weights: '400', fallback: 'serif' },
  { family: 'Secular One', label: { he: 'סקולר', en: 'Secular One' }, kind: 'display', weights: '400', fallback: 'sans-serif' },
  { family: 'Playpen Sans Hebrew', label: { he: 'כתב יד – פליפן', en: 'Handwriting – Playpen' }, kind: 'hand', weights: '400;600', fallback: 'cursive' },
  { family: 'Amatic SC', label: { he: 'כתב יד – אמטיק', en: 'Handwriting – Amatic' }, kind: 'hand', weights: '400;700', fallback: 'cursive' },
  { family: 'Karantina', label: { he: 'קרנטינה', en: 'Karantina' }, kind: 'hand', weights: '400;700', fallback: 'cursive' },
];

export const DEFAULT_FONT = 'Heebo';

const loaded = new Set<string>();

export function fontHref(families: string[]): string {
  const q = families
    .map((f) => FONTS.find((x) => x.family === f))
    .filter((f): f is FontDef => !!f)
    .map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

export function ensureFonts(families: string[]) {
  const todo = families.filter((f) => !loaded.has(f) && FONTS.some((x) => x.family === f));
  if (!todo.length) return;
  todo.forEach((f) => loaded.add(f));
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontHref(todo);
  document.head.append(link);
}

export function fontStack(family: string): string {
  const f = FONTS.find((x) => x.family === family);
  return `'${family}', ${f?.fallback ?? 'sans-serif'}`;
}

/** Families referenced via inline style in post HTML, so viewers load them too. */
export function fontsInHtml(html: string): string[] {
  return FONTS.filter((f) => html.includes(f.family)).map((f) => f.family);
}
