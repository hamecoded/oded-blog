import type { Possession, PossessionDraft } from '../../lib/types';
import type { Lang } from '../../lib/types';

/** The fields every possession has (beyond these, imported columns are kept in `extra`). */
export type FieldKey =
  | 'title'
  | 'maker'
  | 'item_type'
  | 'category'
  | 'description'
  | 'quantity'
  | 'cost'
  | 'value'
  | 'date_purchased'
  | 'location'
  | 'condition'
  | 'notes'
  | 'image_url';

export type FieldKind = 'text' | 'long' | 'number' | 'money' | 'date' | 'image';

export interface FieldDef {
  key: FieldKey;
  kind: FieldKind;
  label: { en: string; he: string };
  /** Spreadsheet headers that mean this field (lowercase; Hebrew and English). */
  aliases: string[];
}

export const FIELDS: FieldDef[] = [
  { key: 'image_url', kind: 'image', label: { en: 'Image', he: 'תמונה' }, aliases: ['image', 'photo', 'picture', 'image url', 'photo url', 'cover', 'תמונה', 'צילום'] },
  { key: 'title', kind: 'text', label: { en: 'Title', he: 'כותרת' }, aliases: ['title', 'name', 'item name', 'book', 'book title', 'album', 'film', 'movie', 'game', 'product', 'model', 'שם', 'כותרת', 'שם הספר', 'שם הפריט', 'אלבום', 'סרט', 'משחק', 'דגם'] },
  // A spreadsheet's item-type column: its value, where a row has one, replaces the item type chosen on import.
  { key: 'item_type', kind: 'text', label: { en: 'Item type', he: 'סוג פריט' }, aliases: ['item type', 'type', 'kind', 'item', 'סוג פריט', 'סוג', 'פריט'] },
  // A sub-type within the item type: Health, Fiction, Kitchen.
  { key: 'category', kind: 'text', label: { en: 'Category', he: 'קטגוריה' }, aliases: ['category', 'genre', 'subject', 'topic', 'subcategory', 'sub category', 'קטגוריה', 'תת קטגוריה', 'ז׳אנר', "ז'אנר", 'סוגה', 'נושא'] },
  { key: 'maker', kind: 'text', label: { en: 'Author / brand', he: 'יוצר / מותג' }, aliases: ['author', 'authors', 'writer', 'brand', 'maker', 'manufacturer', 'make', 'artist', 'creator', 'publisher', 'מחבר', 'מחברת', 'סופר', 'סופרת', 'כותב', 'יצרן', 'מותג', 'אמן', 'אמנית', 'הוצאה'] },
  { key: 'description', kind: 'long', label: { en: 'Description', he: 'תיאור' }, aliases: ['description', 'desc', 'details', 'summary', 'תיאור', 'פרטים', 'תקציר'] },
  { key: 'quantity', kind: 'number', label: { en: 'Qty', he: 'כמות' }, aliases: ['qty', 'quantity', 'count', 'copies', 'units', 'כמות', 'עותקים', 'יחידות'] },
  { key: 'cost', kind: 'money', label: { en: 'Cost', he: 'עלות' }, aliases: ['cost', 'price', 'paid', 'purchase price', 'price paid', 'list price', 'עלות', 'מחיר', 'שולם', 'מחיר קנייה', 'מחיר רכישה'] },
  { key: 'value', kind: 'money', label: { en: 'Value', he: 'שווי' }, aliases: ['value', 'worth', 'current value', 'estimated value', 'market value', 'שווי', 'ערך', 'שווי נוכחי', 'שווי מוערך'] },
  { key: 'date_purchased', kind: 'date', label: { en: 'Purchased', he: 'נרכש' }, aliases: ['date', 'purchased', 'date purchased', 'purchase date', 'bought', 'date bought', 'date acquired', 'acquired', 'תאריך', 'נרכש', 'נקנה', 'תאריך רכישה', 'תאריך קנייה'] },
  { key: 'location', kind: 'text', label: { en: 'Location', he: 'מיקום' }, aliases: ['location', 'located', 'where', 'kept', 'kept at', 'room', 'place', 'shelf', 'storage', 'מיקום', 'איפה', 'נמצא', 'חדר', 'מקום', 'מדף', 'אחסון'] },
  { key: 'condition', kind: 'text', label: { en: 'Condition', he: 'מצב' }, aliases: ['condition', 'state', 'מצב'] },
  { key: 'notes', kind: 'long', label: { en: 'Notes', he: 'הערות' }, aliases: ['notes', 'note', 'comment', 'comments', 'remarks', 'הערות', 'הערה'] },
];

export const fieldLabel = (f: FieldDef, lang: Lang) => f.label[lang];

const norm = (s: string) => s.toLowerCase().replace(/[_\-:.()]+/g, ' ').replace(/\s+/g, ' ').trim();

/** What each spreadsheet column most likely is: a field, 'extra' (keep as its own column) or 'skip'. */
export type ColumnTarget = FieldKey | 'extra' | 'skip';

export function guessMapping(headers: string[]): ColumnTarget[] {
  const used = new Set<FieldKey>();
  return headers.map((h) => {
    const n = norm(h);
    if (!n) return 'skip';
    const exact = FIELDS.find((f) => !used.has(f.key) && f.aliases.includes(n));
    const partial = exact ?? FIELDS.find((f) => !used.has(f.key) && f.aliases.some((a) => a.length > 3 && n.includes(a)));
    if (partial) {
      used.add(partial.key);
      return partial.key;
    }
    return 'extra';
  });
}

/** "₪1,234.50", "$ 99", "1.234,5 €", "(12)" → a number, or null when there is none. */
export function parseMoney(s: string): number | null {
  let t = s.replace(/[^\d.,\-()]/g, '');
  if (!t || !/\d/.test(t)) return null;
  const negative = /^\(.*\)$/.test(t) || t.startsWith('-');
  t = t.replace(/[()-]/g, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) {
    // "1.234,50" or "12,5" → comma is the decimal mark when it has 1–2 digits after it
    t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** '2024-03-05', '5/3/2024', '5.3.24', 'March 2024', '2024', an Excel day number → 'YYYY-MM-DD', or null. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // clearly month/day
    const y = +m[3] < 100 ? 2000 + +m[3] - (+m[3] > 50 ? 100 : 0) : +m[3];
    return ymd(y, mo, d);
  }
  if (/^\d{4}$/.test(t)) return ymd(+t, 1, 1);
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** One spreadsheet row → a new possession, given what each column is. */
export function rowToDraft(
  headers: string[],
  row: string[],
  mapping: ColumnTarget[],
  /** The item type chosen on import; a row's own value in an item-type column replaces it. */
  itemType: string,
): PossessionDraft {
  const d: PossessionDraft = { item_type: itemType, extra: {} };
  mapping.forEach((target, i) => {
    const raw = (row[i] ?? '').trim();
    if (!raw || target === 'skip') return;
    if (target === 'extra') {
      d.extra![headers[i] || `#${i + 1}`] = raw;
      return;
    }
    const f = FIELDS.find((x) => x.key === target)!;
    if (f.kind === 'money' || f.kind === 'number') {
      const n = parseMoney(raw);
      if (n !== null) (d as Record<string, unknown>)[target] = n;
    } else if (f.kind === 'date') d.date_purchased = parseDate(raw);
    else if (f.kind === 'image') d.image_url = /^https?:\/\//i.test(raw) ? raw : null;
    else (d as Record<string, unknown>)[target] = raw;
  });
  return d;
}

export const isEmptyDraft = (d: PossessionDraft) =>
  !d.title && !d.maker && !d.description && d.value == null && d.cost == null && !Object.keys(d.extra ?? {}).length;

/** Text for searching a row. */
export function haystack(p: Possession): string {
  return [p.title, p.item_type, p.maker, p.category, p.description, p.location, p.condition, p.notes, ...Object.values(p.extra)]
    .join(' ')
    .toLowerCase();
}
