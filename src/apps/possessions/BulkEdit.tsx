import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { Lang, PossessionDraft } from '../../lib/types';
import { FIELDS, parseDate, parseMoney, type FieldKey } from './fields';
import { usePt } from './strings';

const EDITABLE = FIELDS.filter((f) => f.kind !== 'image');

interface Pair {
  key: FieldKey;
  value: string;
}

/**
 * Set fields on every ticked row at once: one or more field + value pairs ("+ Field" adds another), applied
 * together with one press.
 */
export function BulkEdit({
  onApply,
  suggestions,
  lang,
}: {
  onApply: (patch: PossessionDraft) => void;
  /** Earlier values per field (item type, category, location). */
  suggestions: Partial<Record<FieldKey, string[]>>;
  lang: Lang;
}) {
  const pt = usePt();
  const [pairs, setPairs] = useState<Pair[]>([{ key: 'item_type', value: '' }]);
  const used = new Set(pairs.map((p) => p.key));

  const update = (i: number, patch: Partial<Pair>) => setPairs((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const apply = () => {
    const patch: Record<string, string | number | null> = {};
    pairs.forEach(({ key, value }) => {
      const f = EDITABLE.find((x) => x.key === key)!;
      const v = value.trim();
      if (f.kind === 'money' || f.kind === 'number') patch[key] = v === '' ? (key === 'quantity' ? 1 : null) : parseMoney(v);
      else if (f.kind === 'date') patch[key] = v ? parseDate(v) : null;
      else patch[key] = v;
    });
    onApply(patch as PossessionDraft);
    setPairs((ps) => ps.map((p) => ({ ...p, value: '' })));
  };

  return (
    <form
      className="bulk-edit"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <span className="bulk-label">{pt('setField')}</span>
      {pairs.map((pair, i) => {
        const field = EDITABLE.find((f) => f.key === pair.key)!;
        const numeric = field.kind === 'money' || field.kind === 'number';
        const list = suggestions[pair.key];
        const listId = `bulk-${i}-${pair.key}`;
        return (
          <span key={i} className="bulk-pair">
            <select
              value={pair.key}
              onChange={(e) => update(i, { key: e.target.value as FieldKey, value: '' })}
              aria-label={pt('field')}
            >
              {EDITABLE.filter((f) => f.key === pair.key || !used.has(f.key)).map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label[lang]}
                </option>
              ))}
            </select>
            <input
              type={field.kind === 'date' ? 'date' : 'text'}
              inputMode={numeric ? 'decimal' : undefined}
              value={pair.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={pt('newValue')}
              aria-label={`${pt('newValue')}: ${field.label[lang]}`}
              list={list?.length ? listId : undefined}
              dir={numeric || field.kind === 'date' ? 'ltr' : 'auto'}
            />
            {list && list.length > 0 && (
              <datalist id={listId}>
                {list.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            )}
            {pairs.length > 1 && (
              <button
                type="button"
                className="bulk-remove"
                onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}
                aria-label={`${pt('removeField')}: ${field.label[lang]}`}
              >
                <X size={14} />
              </button>
            )}
          </span>
        );
      })}
      {used.size < EDITABLE.length && (
        <button
          type="button"
          className="bulk-add"
          onClick={() => setPairs((ps) => [...ps, { key: EDITABLE.find((f) => !used.has(f.key))!.key, value: '' }])}
        >
          <Plus size={16} /> {pt('addField')}
        </button>
      )}
      <button type="submit" className="btn primary sm">
        <Check size={15} /> {pt('apply')}
      </button>
    </form>
  );
}
