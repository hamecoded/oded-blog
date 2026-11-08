import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Trash2 } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import type { Lang, Possession, PossessionDraft } from '../../lib/types';
import { FIELDS, parseDate, parseMoney, type FieldKey } from './fields';
import { usePt } from './strings';

type Form = Record<string, string>;

const TEXT_KEYS = FIELDS.filter((f) => f.kind !== 'image').map((f) => f.key);

function formOf(p: Possession): Form {
  const f: Form = {};
  TEXT_KEYS.forEach((k) => {
    const v = p[k];
    f[k] = v == null ? '' : String(v);
  });
  Object.entries(p.extra).forEach(([k, v]) => (f[`x:${k}`] = v));
  return f;
}

/**
 * One item as a form: every field at once, made for phones (the cards view opens it). Save sends only what
 * changed. Item type, category and location suggest values used before.
 */
export function ItemSheet({
  item,
  onClose,
  onSave,
  onDelete,
  onPhoto,
  itemTypes,
  categoriesFor,
  locations,
  lang,
}: {
  item: Possession | null;
  onClose: () => void;
  onSave: (id: string, patch: PossessionDraft) => void;
  onDelete: (id: string) => void;
  onPhoto: (p: Possession) => void;
  itemTypes: string[];
  categoriesFor: (itemType: string) => string[];
  locations: string[];
  lang: Lang;
}) {
  const pt = usePt();
  const [form, setForm] = useState<Form>({});
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  // A new, still empty item starts with the cursor in its title. Done after the dialog has opened: opening a
  // dialog moves focus to its first button, which would undo an earlier focus.
  const isNew = !!item && !item.title;
  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [isNew, item?.id]);
  // Refill the form when a different item opens (compared during render, not in an effect).
  if ((item?.id ?? null) !== shownFor) {
    setShownFor(item?.id ?? null);
    setForm(item ? formOf(item) : {});
    setArmed(false);
  }
  if (!item) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        {null}
      </Sheet>
    );
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = (key: FieldKey) => FIELDS.find((f) => f.key === key)!;
  const label = (key: FieldKey) => field(key).label[lang];
  const extraKeys = Object.keys(item.extra);

  const save = () => {
    const before = formOf(item);
    const patch: Record<string, unknown> = {};
    TEXT_KEYS.forEach((k) => {
      if (form[k] === before[k]) return;
      const f = field(k);
      const v = (form[k] ?? '').trim();
      if (f.kind === 'money' || f.kind === 'number') patch[k] = v === '' ? (k === 'quantity' ? 1 : null) : parseMoney(v);
      else if (f.kind === 'date') patch[k] = v ? parseDate(v) : null;
      else patch[k] = v;
    });
    if (extraKeys.some((k) => form[`x:${k}`] !== before[`x:${k}`])) {
      const extra: Record<string, string> = {};
      extraKeys.forEach((k) => {
        const v = (form[`x:${k}`] ?? '').trim();
        if (v) extra[k] = v;
      });
      patch.extra = extra;
    }
    if (Object.keys(patch).length) onSave(item.id, patch as PossessionDraft);
    onClose();
  };

  const input = (key: FieldKey, opts: { list?: string[]; listId?: string } = {}) => {
    const f = field(key);
    const numeric = f.kind === 'money' || f.kind === 'number';
    return (
      <label className={`is-${f.kind}`}>
        {label(key)}
        {f.kind === 'long' ? (
          <textarea value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} rows={3} dir="auto" />
        ) : (
          <input
            type={f.kind === 'date' ? 'date' : 'text'}
            inputMode={numeric ? 'decimal' : undefined}
            value={form[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            list={opts.list?.length ? opts.listId : undefined}
            dir={numeric || f.kind === 'date' ? 'ltr' : 'auto'}
            enterKeyHint="next"
            ref={key === 'title' ? titleRef : undefined}
          />
        )}
        {opts.list && opts.list.length > 0 && (
          <datalist id={opts.listId}>
            {opts.list.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
      </label>
    );
  };

  return (
    <Sheet open={!!item} onClose={onClose} title={item.title || pt('edit')}>
      <form
        className="form item-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <button type="button" className="item-photo" onClick={() => onPhoto(item)}>
          {item.image_url ? <img src={item.image_url} alt="" /> : <Camera size={26} />}
          <span>{item.image_url ? pt('photo') : pt('addPhoto')}</span>
        </button>
        {input('title')}
        <div className="item-row">
          {input('item_type', { list: itemTypes, listId: 'item-types' })}
          {input('category', { list: categoriesFor((form.item_type ?? '').trim()), listId: 'item-cats' })}
        </div>
        {input('maker')}
        {input('description')}
        <div className="item-row three">
          {input('quantity')}
          {input('cost')}
          {input('value')}
        </div>
        <div className="item-row">
          {input('date_purchased')}
          {input('condition')}
        </div>
        {input('location', { list: locations, listId: 'item-locations' })}
        {input('notes')}
        {extraKeys.map((k) => (
          <label key={k}>
            <bdi>{k}</bdi>
            <input value={form[`x:${k}`] ?? ''} onChange={(e) => set(`x:${k}`, e.target.value)} dir="auto" />
          </label>
        ))}
        <div className="item-actions">
          <button type="submit" className="btn primary">
            <Check size={18} /> {pt('saveItem')}
          </button>
          <button
            type="button"
            className={`btn ${armed ? 'primary danger-fill' : 'ghost danger'}`}
            onClick={() => {
              if (!armed) return setArmed(true);
              onDelete(item.id);
              onClose();
            }}
          >
            <Trash2 size={18} /> {armed ? pt('sure') : pt('delete')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
