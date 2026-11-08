import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import type { Lang } from '../../lib/types';
import { columnLabel, type ColumnLayout } from './columns';
import { usePt } from './strings';

/** Show, hide and reorder the table's columns; works on phones too, where headers have no hover controls. */
export function ColumnsSheet({
  open,
  onClose,
  order,
  layout,
  onLayout,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  /** Every movable column, in its current order. */
  order: string[];
  layout: ColumnLayout;
  onLayout: (l: ColumnLayout) => void;
  lang: Lang;
}) {
  const pt = usePt();
  const move = (i: number, by: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onLayout({ ...layout, order: next });
  };
  return (
    <Sheet open={open} onClose={onClose} title={pt('columns')}>
      <p className="muted cols-help">{pt('columnsHelp')}</p>
      <ul className="cols-list">
        {order.map((id, i) => {
          const shown = !layout.hidden.includes(id);
          const label = columnLabel(id, lang);
          return (
            <li key={id} className={shown ? undefined : 'is-hidden'}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={(e) =>
                    onLayout({
                      order,
                      hidden: e.target.checked ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id],
                    })
                  }
                />
                <bdi>{label}</bdi>
              </label>
              <span className="cols-move">
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${pt('moveUp')}: ${label}`}>
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`${pt('moveDown')}: ${label}`}
                >
                  <ArrowDown size={16} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn ghost block" onClick={() => onLayout({ order: [], hidden: [] })}>
        <RotateCcw size={16} /> {pt('resetColumns')}
      </button>
    </Sheet>
  );
}
