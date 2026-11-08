import type { Lang, Possession } from '../../lib/types';
import { FIELDS } from './fields';

/**
 * How the printed list is put together. `groupBy` is a field key, `x:<name>` for a spreadsheet's own column,
 * `year` (year purchased) or `none`. Remembered in this browser.
 */
export interface PrintOptions {
  groupBy: string;
  photos: boolean;
}

const KEY = 'possessions.print';
export const DEFAULT_PRINT: PrintOptions = { groupBy: 'item_type', photos: true };

export function loadPrintOptions(): PrintOptions {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PrintOptions | null;
    if (v && typeof v.groupBy === 'string') return { ...DEFAULT_PRINT, ...v };
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PRINT;
}

export function savePrintOptions(o: PrintOptions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable */
  }
}

/** Columns that make sense to group by: the text fields, the purchase year, and the spreadsheet's own columns. */
export function groupChoices(extraKeys: string[], lang: Lang, labels: { year: string; none: string }) {
  const text = FIELDS.filter((f) => f.kind === 'text' && f.key !== 'title').map((f) => ({ id: f.key as string, label: f.label[lang] }));
  return [
    ...text,
    { id: 'year', label: labels.year },
    { id: 'quantity', label: FIELDS.find((f) => f.key === 'quantity')!.label[lang] },
    ...extraKeys.map((k) => ({ id: `x:${k}`, label: k })),
    { id: 'none', label: labels.none },
  ];
}

/** The value a row is grouped under ('' when it has none). */
export function groupValue(r: Possession, groupBy: string): string {
  if (groupBy === 'year') return r.date_purchased?.slice(0, 4) ?? '';
  if (groupBy.startsWith('x:')) return (r.extra[groupBy.slice(2)] ?? '').trim();
  const v = r[groupBy as keyof Possession];
  return v == null ? '' : String(v).trim();
}

export function groupLabel(groupBy: string, lang: Lang, yearLabel: string): string {
  if (groupBy === 'year') return yearLabel;
  if (groupBy.startsWith('x:')) return groupBy.slice(2);
  return FIELDS.find((f) => f.key === groupBy)?.label[lang] ?? groupBy;
}
