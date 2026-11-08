import { useRef } from 'react';
import { Camera, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { Lang, Possession } from '../../lib/types';
import { count, money, type Currency } from './format';
import { useRowDrag } from './rowDrag';
import { usePt } from './strings';

/**
 * The phone-friendly view: one card per item, nothing to scroll sideways. Tapping a card opens the item's form
 * (ItemSheet); the photo opens the photo window; the tick box selects for "Set a field"; the grip drags the card
 * to a new place within its item type.
 */
export function ItemCards({
  rows,
  selected,
  onSelect,
  onOpen,
  onPhoto,
  busyId,
  currency,
  lang,
  onMoveRow,
  reorder,
}: {
  rows: Possession[];
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
  onOpen: (p: Possession) => void;
  onPhoto: (p: Possession) => void;
  busyId: string | null;
  currency: Currency;
  lang: Lang;
  onMoveRow: (id: string, targetId: string, after: boolean) => void;
  reorder: boolean;
}) {
  const pt = usePt();
  const list = useRef<HTMLUListElement>(null);
  const { drag, canDrag, gripProps, itemClass } = useRowDrag(rows, list, onMoveRow, reorder);
  const Chevron = lang === 'he' ? ChevronLeft : ChevronRight;

  return (
    <ul ref={list} className={`pcards${drag ? ' is-row-dragging' : ''}`}>
      {rows.map((p) => {
        const kind = [p.item_type, p.category].filter(Boolean);
        const sub = [p.maker, p.location].filter(Boolean);
        return (
          <li key={p.id} data-id={p.id} className={[selected.has(p.id) && 'is-selected', itemClass(p.id)].filter(Boolean).join(' ') || undefined}>
            {canDrag && (
              <button type="button" className="pcard-grip" aria-label={`${pt('dragRow')}: ${p.title}`} {...gripProps(p)}>
                <GripVertical size={18} />
              </button>
            )}
            <input
              type="checkbox"
              className="pcard-check"
              checked={selected.has(p.id)}
              onChange={(e) => onSelect([p.id], e.target.checked)}
              aria-label={`${pt('selectRow')} ${p.title}`}
            />
            <button
              type="button"
              className={`pcard-photo${busyId === p.id ? ' busy' : ''}`}
              onClick={() => onPhoto(p)}
              aria-label={p.image_url ? pt('photo') : pt('addPhoto')}
            >
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <Camera size={20} />}
            </button>
            <button type="button" className="pcard-main" onClick={() => onOpen(p)}>
              <span className="pcard-title">
                <bdi>{p.title || '—'}</bdi>
                {p.quantity !== 1 && <span className="muted"> ×{count(p.quantity, lang)}</span>}
              </span>
              {kind.length > 0 && (
                <span className="pcard-kind">
                  {kind.map((k, i) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      <bdi>{k}</bdi>
                    </span>
                  ))}
                </span>
              )}
              {sub.length > 0 && (
                <span className="pcard-sub muted">
                  {sub.map((k, i) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      <bdi>{k}</bdi>
                    </span>
                  ))}
                </span>
              )}
            </button>
            <span className="pcard-value">
              {p.value != null && <strong>{money(p.value, currency, lang)}</strong>}
              <Chevron size={16} className="muted" aria-hidden />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
