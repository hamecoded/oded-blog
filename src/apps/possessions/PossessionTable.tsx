import { useRef, useState, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp, Camera, EyeOff, GripVertical, Trash2, X } from 'lucide-react';
import type { Lang, Possession, PossessionDraft } from '../../lib/types';
import { Cell } from './Cell';
import { columnLabel, moveColumn, orderedColumns, type ColumnLayout } from './columns';
import { FIELDS, type FieldDef } from './fields';
import { count, day, money, type Currency } from './format';
import { useRowDrag } from './rowDrag';
import { usePt } from './strings';

export interface SortState {
  /** A field key, or `x:<name>` for an extra column. */
  key: string;
  dir: 1 | -1;
}

const TITLE = FIELDS.find((f) => f.key === 'title')!;
const TYPE = FIELDS.find((f) => f.key === 'item_type')!;

/** Cells picked together in one column (⌘/Ctrl-click, Shift-click); editing one of them changes them all. */
interface CellPick {
  col: string;
  ids: Set<string>;
  anchor: string;
}

/**
 * The editable table: one row per possession, every cell editable in place. With `layout` + `onLayout`, column
 * headers can be dragged to new places and hidden (the controls appear on hover, on devices with a mouse).
 * ⌘/Ctrl-click and Shift-click pick several cells in a column; the value typed into one of them goes to all.
 */
export function PossessionTable({
  rows,
  extraKeys,
  itemTypes,
  categoriesFor,
  locations,
  sort,
  onSort,
  selected,
  onSelect,
  onSave,
  onDelete,
  onPhoto,
  busyId,
  currency,
  lang,
  editNew,
  checkLabel,
  removeLabel,
  quickRemove,
  layout,
  onLayout,
  onMoveRow,
  reorder,
  reorderHint,
}: {
  rows: Possession[];
  extraKeys: string[];
  /** Earlier values offered in the item type, category (per item type) and location cells. */
  itemTypes: string[];
  categoriesFor: (itemType: string) => string[];
  locations: string[];
  sort: SortState;
  onSort: (key: string) => void;
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
  onSave: (id: string, patch: PossessionDraft) => void;
  onDelete: (id: string) => void;
  /** Leave out for a table without photos (the import review). */
  onPhoto?: (p: Possession) => void;
  /** Row whose photo is uploading. */
  busyId?: string | null;
  currency: Currency;
  lang: Lang;
  /** A just-added row whose title starts in edit mode. */
  editNew: string | null;
  /** Accessible name of the row checkboxes ("Select" by default). */
  checkLabel?: string;
  /** Accessible name of the row delete button ("Delete" by default); the review uses it to leave a row out. */
  removeLabel?: string;
  /** Delete without asking first (nothing is lost in the review). */
  quickRemove?: boolean;
  layout?: ColumnLayout;
  onLayout?: (l: ColumnLayout) => void;
  /**
   * Rows can be dragged by their grip (mouse or touch; or focus the grip and press ↑/↓) to a new place within
   * their item type. When `reorder` is false the grips show but explain how to get back to your own order.
   */
  onMoveRow?: (id: string, targetId: string, after: boolean) => void;
  reorder?: boolean;
  reorderHint?: string;
}) {
  const pt = usePt();
  const [armed, setArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pick, setPick] = useState<CellPick | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { drag: rowDrag, canDrag, gripProps, itemClass } = useRowDrag(rows, wrap, onMoveRow, !!reorder);
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const order = orderedColumns(extraKeys, layout);
  const columns = order.filter((id) => !layout?.hidden.includes(id));
  const editable = !!(layout && onLayout);

  // Picks only count for rows still on show.
  const pickIds = pick ? rows.filter((r) => pick.ids.has(r.id)).map((r) => r.id) : [];
  const isPicked = (id: string, col: string) => !!pick && pick.col === col && pick.ids.has(id) && pickIds.length > 1;

  const onPick = (p: Possession, col: string) => (e: MouseEvent) => {
    const multi = e.metaKey || e.ctrlKey;
    if (!multi && !e.shiftKey) {
      // A plain click on a picked cell edits them all; anywhere else it starts over.
      if (!isPicked(p.id, col)) setPick(null);
      return false;
    }
    e.preventDefault();
    if (!pick || pick.col !== col) {
      setPick({ col, ids: new Set([p.id]), anchor: p.id });
    } else if (e.shiftKey) {
      const a = rows.findIndex((r) => r.id === pick.anchor);
      const b = rows.findIndex((r) => r.id === p.id);
      const [from, to] = a < 0 ? [b, b] : [Math.min(a, b), Math.max(a, b)];
      setPick({ ...pick, ids: new Set([...pick.ids, ...rows.slice(from, to + 1).map((r) => r.id)]) });
    } else {
      const ids = new Set(pick.ids);
      if (ids.has(p.id)) ids.delete(p.id);
      else ids.add(p.id);
      setPick({ col, ids, anchor: p.id });
    }
    return true;
  };

  /** Saves `value` into column `col` of this row, or of every picked row when this cell is one of them. */
  const saveCol = (p: Possession, col: string, value: string | number | null) => {
    const ids = isPicked(p.id, col) ? pickIds : [p.id];
    ids.forEach((id) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      if (col.startsWith('x:')) {
        const extra = { ...row.extra };
        if (value) extra[col.slice(2)] = String(value);
        else delete extra[col.slice(2)];
        onSave(id, { extra });
      } else onSave(id, { [col]: value } as PossessionDraft);
    });
    setPick(null);
  };

  const sortButton = (key: string, label: string) => (
    <button type="button" className="pt-sort" onClick={() => onSort(key)}>
      <span dir="auto">{label}</span>
      {sort.key === key && (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
    </button>
  );
  const ariaSort = (key: string) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined);

  const head = (id: string) => {
    const label = columnLabel(id, lang);
    const cls = `${id.startsWith('x:') ? 'col-extra' : `col-${id}`}${overId === id && dragId ? (order.indexOf(dragId) < order.indexOf(id) ? ' drop-after' : ' drop-before') : ''}${dragId === id ? ' dragging' : ''}`;
    if (!editable) {
      return (
        <th key={id} className={cls} aria-sort={ariaSort(id)}>
          {sortButton(id, label)}
        </th>
      );
    }
    return (
      <th
        key={id}
        className={cls}
        aria-sort={ariaSort(id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
          setDragId(id);
        }}
        onDragOver={(e) => {
          if (!dragId || dragId === id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (overId !== id) setOverId(id);
        }}
        onDragLeave={() => setOverId((o) => (o === id ? null : o))}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId) onLayout!({ order: moveColumn(order, dragId, id), hidden: layout!.hidden });
          setDragId(null);
          setOverId(null);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverId(null);
        }}
      >
        <span className="pt-head">
          <span className="pt-grip" title={pt('dragColumn')} aria-hidden>
            <GripVertical size={13} />
          </span>
          {sortButton(id, label)}
          <button
            type="button"
            className="pt-hide"
            title={pt('hideColumn')}
            aria-label={`${pt('hideColumn')}: ${label}`}
            onClick={() => onLayout!({ order, hidden: [...layout!.hidden, id] })}
          >
            <EyeOff size={13} />
          </button>
        </span>
      </th>
    );
  };

  const fieldCell = (p: Possession, f: FieldDef) => {
    const v = p[f.key];
    const label = f.label[lang];
    const common = {
      onSave: (next: string | number | null) => saveCol(p, f.key, next),
      label,
      onPick: onPick(p, f.key),
      picked: isPicked(p.id, f.key),
    };
    if (f.kind === 'money') return <Cell raw={v == null ? '' : String(v)} shown={money(v as number | null, currency, lang)} kind="money" {...common} />;
    if (f.kind === 'number') return <Cell raw={String(v ?? '')} shown={count(Number(v ?? 0), lang)} kind="number" {...common} />;
    if (f.kind === 'date') return <Cell raw={(v as string) ?? ''} shown={day(v as string | null, lang)} kind="date" {...common} />;
    const options =
      f.key === 'item_type' ? itemTypes : f.key === 'category' ? categoriesFor(p.item_type) : f.key === 'location' ? locations : undefined;
    return (
      <Cell
        raw={(v as string) ?? ''}
        kind={f.kind === 'long' ? 'long' : 'text'}
        {...common}
        options={options}
        autoEdit={f.key === 'title' && p.id === editNew}
      />
    );
  };

  const cell = (p: Possession, id: string) => {
    if (!id.startsWith('x:')) return fieldCell(p, FIELDS.find((f) => f.key === id)!);
    const k = id.slice(2);
    return (
      <Cell
        raw={p.extra[k] ?? ''}
        kind="text"
        label={k}
        onSave={(next) => saveCol(p, id, next)}
        onPick={onPick(p, id)}
        picked={isPicked(p.id, id)}
      />
    );
  };

  return (
    <>
    {pickIds.length > 1 && pick && (
      <div className="pt-pickbar" role="status">
        <span>{pt('cellsPicked', { n: pickIds.length, col: columnLabel(pick.col, lang) })}</span>
        <button type="button" className="btn ghost sm" onClick={() => setPick(null)}>
          <X size={15} /> {pt('clear')}
        </button>
      </div>
    )}
    <div
      ref={wrap}
      className="pt-wrap"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && pick) setPick(null);
      }}
    >
      <table className={`pt${onPhoto ? '' : ' no-img'}${dragId ? ' is-dragging' : ''}${rowDrag ? ' is-row-dragging' : ''}${onMoveRow ? ' has-grip' : ''}`}>
        <thead>
          <tr>
            <th className="pt-check sticky-a">
              {onMoveRow && <span className="pt-rowgrip-space" aria-hidden />}
              <input
                type="checkbox"
                checked={allOn}
                aria-label={pt('selectAll')}
                onChange={(e) => onSelect(rows.map((r) => r.id), e.target.checked)}
              />
            </th>
            {onPhoto && <th className="pt-img sticky-b" aria-label={pt('photo')} />}
            <th className="col-title sticky-c" aria-sort={ariaSort('title')}>
              {sortButton('title', TITLE.label[lang])}
            </th>
            <th className="col-item_type sticky-d" aria-sort={ariaSort('item_type')}>
              {sortButton('item_type', TYPE.label[lang])}
            </th>
            {columns.map(head)}
            <th className="pt-actions" aria-label={pt('delete')} />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              data-id={p.id}
              className={
                [selected.has(p.id) && 'is-selected', itemClass(p.id)].filter(Boolean).join(' ') || undefined
              }
            >
              <td className="pt-check sticky-a">
                {onMoveRow && (
                  <button
                    type="button"
                    className={`pt-rowgrip${canDrag ? '' : ' off'}`}
                    title={canDrag ? pt('dragRow') : reorderHint}
                    aria-label={`${pt('dragRow')}: ${p.title}`}
                    {...gripProps(p)}
                  >
                    <GripVertical size={15} />
                  </button>
                )}
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  aria-label={`${checkLabel ?? pt('selectRow')} ${p.title}`}
                  onChange={(e) => onSelect([p.id], e.target.checked)}
                />
              </td>
              {onPhoto && (
                <td className="pt-img sticky-b">
                  <button
                    type="button"
                    className={`pt-thumb${busyId === p.id ? ' busy' : ''}`}
                    onClick={() => onPhoto(p)}
                    aria-label={p.image_url ? pt('photo') : pt('addPhoto')}
                  >
                    {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <Camera size={18} />}
                  </button>
                </td>
              )}
              <td className={`col-title sticky-c${isPicked(p.id, 'title') ? ' is-picked' : ''}`}>{fieldCell(p, TITLE)}</td>
              <td className={`col-item_type sticky-d${isPicked(p.id, 'item_type') ? ' is-picked' : ''}`}>{fieldCell(p, TYPE)}</td>
              {columns.map((id) => (
                <td key={id} className={`${id.startsWith('x:') ? 'col-extra' : `col-${id}`}${isPicked(p.id, id) ? ' is-picked' : ''}`}>
                  {cell(p, id)}
                </td>
              ))}
              <td className="pt-actions">
                <button
                  type="button"
                  className={`pt-del${armed === p.id ? ' armed' : ''}`}
                  onClick={() => (quickRemove || armed === p.id ? onDelete(p.id) : setArmed(p.id))}
                  onBlur={() => setArmed((a) => (a === p.id ? null : a))}
                  aria-label={armed === p.id ? pt('sure') : (removeLabel ?? pt('delete'))}
                >
                  <Trash2 size={16} />
                  {armed === p.id && <span>{pt('sure')}</span>}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {editable && (
      <p className="muted pt-tip">
        {canDrag && <>{pt('dragTip')} </>}
        {pt('cellsTip')}
      </p>
    )}
    </>
  );
}
