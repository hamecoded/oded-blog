import { Printer } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import type { Lang } from '../../lib/types';
import { groupChoices, type PrintOptions } from './printing';
import { usePt } from './strings';

/** Print options: what to group the list by, and whether to include photos; then print. */
export function PrintSheet({
  open,
  onClose,
  options,
  onOptions,
  onPrint,
  extraKeys,
  count,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  options: PrintOptions;
  onOptions: (o: PrintOptions) => void;
  onPrint: () => void;
  extraKeys: string[];
  /** Items that will print (what's on screen). */
  count: number;
  lang: Lang;
}) {
  const pt = usePt();
  const choices = groupChoices(extraKeys, lang, { year: pt('printYear'), none: pt('printNoGroups') });
  return (
    <Sheet open={open} onClose={onClose} title={pt('printTitleSheet')}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onPrint();
        }}
      >
        <label>
          {pt('printGroupBy')}
          <select value={choices.some((c) => c.id === options.groupBy) ? options.groupBy : 'item_type'} onChange={(e) => onOptions({ ...options, groupBy: e.target.value })}>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === 'item_type' ? pt('printByType') : c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={options.photos} onChange={(e) => onOptions({ ...options, photos: e.target.checked })} />
          {pt('printPhotos')}
        </label>
        <p className="muted print-note">{pt('printWhat', { n: count })}</p>
        <button type="submit" className="btn primary block">
          <Printer size={18} /> {pt('print')}
        </button>
      </form>
    </Sheet>
  );
}
