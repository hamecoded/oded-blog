import type { Lang } from '../../lib/types';
import { FIELDS } from './fields';

/**
 * Which columns the table shows, in what order. Ids are field keys or `x:<name>` for a spreadsheet's own columns.
 * Title and item type (pinned first) and the photo aren't in it: they can't move or hide.
 */
export interface ColumnLayout {
  order: string[];
  hidden: string[];
}

const KEY = 'possessions.columns';

/** Always shown first, in this order, and kept in view when the table scrolls sideways. */
export const PINNED: string[] = ['title', 'item_type'];

export function loadLayout(): ColumnLayout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ColumnLayout | null;
    if (v && Array.isArray(v.order) && Array.isArray(v.hidden)) return v;
  } catch {
    /* storage unavailable or damaged */
  }
  return { order: [], hidden: [] };
}

export function saveLayout(l: ColumnLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage unavailable */
  }
}

/** Every movable column for these extra keys, in the layout's order; columns it doesn't know yet go last. */
export function orderedColumns(extraKeys: string[], layout?: ColumnLayout): string[] {
  const all = [
    ...FIELDS.filter((f) => f.kind !== 'image' && !PINNED.includes(f.key)).map((f) => f.key as string),
    ...extraKeys.map((k) => `x:${k}`),
  ];
  if (!layout) return all;
  return [...layout.order.filter((id) => all.includes(id)), ...all.filter((id) => !layout.order.includes(id))];
}

export function columnLabel(id: string, lang: Lang): string {
  if (id.startsWith('x:')) return id.slice(2);
  return FIELDS.find((f) => f.key === id)?.label[lang] ?? id;
}

/** Moves `id` to where `target` is (before it when moving back, after it when moving forward). */
export function moveColumn(order: string[], id: string, target: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = order.filter((x) => x !== id);
  next.splice(next.indexOf(target) + (from < to ? 1 : 0), 0, id);
  return next;
}
