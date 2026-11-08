import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { useApp } from '../../lib/app';
import type { Possession, PossessionDraft } from '../../lib/types';
import { possessionFields } from '../../lib/util';
import { FIELDS, guessMapping, isEmptyDraft, rowToDraft, type ColumnTarget } from './fields';
import type { Currency } from './format';
import { PossessionTable, type SortState } from './PossessionTable';
import { readSpreadsheet, type SheetData } from './spreadsheet';
import { usePt } from './strings';

interface SheetPlan {
  ignored: boolean;
  /** This sheet's item type; blank uses the one from step 1. */
  itemType: string;
  mapping: ColumnTarget[];
}

function headersOf(sheet: SheetData, hasHeaders: boolean, lang: string): string[] {
  const first = sheet.rows[0] ?? [];
  return hasHeaders ? first.map((h, i) => h || `#${i + 1}`) : first.map((_, i) => (lang === 'he' ? `עמודה ${i + 1}` : `Column ${i + 1}`));
}

/** A row in the review step: a possession that isn't saved yet. */
const toRow = (d: PossessionDraft, i: number, base: number): Possession => ({
  id: `new-${i}`,
  owner_id: '',
  ...possessionFields({ ...d, position: base + i }),
  created_at: String(i).padStart(6, '0'),
  updated_at: '',
});

/**
 * Import in two steps. 1: say what the spreadsheet holds (its item type, e.g. "Book"), pick the file and check
 * what each column is. 2: review every row in an editable table, leave rows out, then add them to the list.
 */
export function ImportSheet({
  open,
  onClose,
  onImport,
  itemTypes,
  categoriesFor,
  locations,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (rows: PossessionDraft[]) => Promise<void>;
  /** Item types and (per item type) categories used so far, offered as suggestions. */
  itemTypes: string[];
  categoriesFor: (itemType: string) => string[];
  locations: string[];
  currency: Currency;
}) {
  const { prefs } = useApp();
  const lang = prefs.uiLang;
  const pt = usePt();
  const [itemType, setItemType] = useState('');
  const [fileBase, setFileBase] = useState('');
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  /** Per sheet: ignored or not, its own item type (blank = the one from step 1) and what each column is. */
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [index, setIndex] = useState(0);
  const [hasHeaders, setHasHeaders] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Step 2
  const [review, setReview] = useState<Possession[] | null>(null);
  const [included, setIncluded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortState>({ key: 'created_at', dir: 1 });

  const sheet = sheets?.[index];
  const plan = plans[index];
  const updatePlan = (i: number, patch: Partial<SheetPlan>) =>
    setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setMapping = (m: ColumnTarget[]) => updatePlan(index, { mapping: m });
  const freshPlans = (list: SheetData[], headers: boolean): SheetPlan[] =>
    list.map((s) => ({ ignored: false, itemType: '', mapping: guessMapping(headersOf(s, headers, lang)) }));

  const close = () => {
    setItemType('');
    setSheets(null);
    setPlans([]);
    setFileBase('');
    setError('');
    setHasHeaders(true);
    setReview(null);
    setBusy(false);
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const list = await readSpreadsheet(file);
      if (!list.length) throw new Error('possessions/empty');
      setFileBase(file.name.replace(/\.[^.]+$/, ''));
      setSheets(list);
      setPlans(freshPlans(list, hasHeaders));
      setIndex(0);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m === 'possessions/xls' ? pt('impXls') : m === 'possessions/empty' ? pt('impEmpty') : pt('impUnreadable'));
    }
  };

  const rowsOf = (s: SheetData) => (hasHeaders ? s.rows.slice(1) : s.rows);
  const typeOf = (p: SheetPlan) => p.itemType.trim() || itemType.trim();

  /** Every row of every sheet that isn't ignored. */
  const drafts = useMemo(() => {
    if (!sheets) return [];
    return sheets.flatMap((s, i) => {
      const p = plans[i];
      if (!p || p.ignored) return [];
      const headers = headersOf(s, hasHeaders, lang);
      return rowsOf(s)
        .map((r) => rowToDraft(headers, r, p.mapping, typeOf(p)))
        .filter((d) => !isEmptyDraft(d));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, plans, hasHeaders, itemType, lang]);

  const startReview = () => {
    const base = Date.now();
    const rows = drafts.map((d, i) => toRow(d, i, base));
    setReview(rows);
    setIncluded(new Set(rows.map((r) => r.id)));
    setSort({ key: 'created_at', dir: 1 });
  };

  const used = plans.filter((p) => !p.ignored);
  const missingType = used.length > 0 && used.some((p) => !typeOf(p));
  const multi = (sheets?.length ?? 0) > 1;
  const headers = sheet ? headersOf(sheet, hasHeaders, lang) : [];
  const sampleRow = (col: number) => (sheet ? (rowsOf(sheet).find((r) => r[col]) ?? [])[col] ?? '' : '');
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;
  const Next = lang === 'he' ? ArrowLeft : ArrowRight;

  // ───── Step 2: review ─────
  if (review) {
    const keep = review.filter((r) => included.has(r.id));
    const extraKeys = [...new Set(review.flatMap((r) => Object.keys(r.extra)))];
    const val = (r: Possession) => (sort.key.startsWith('x:') ? r.extra[sort.key.slice(2)] : r[sort.key as keyof Possession]) ?? '';
    const shown = [...review].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), lang, { numeric: true });
      return c * sort.dir;
    });
    const reviewTypes = [...new Set([...itemTypes, ...review.map((r) => r.item_type)].filter(Boolean))];
    const reviewCategoriesFor = (t: string) =>
      [...new Set([...categoriesFor(t), ...review.filter((r) => r.item_type === t).map((r) => r.category)].filter(Boolean))];
    return (
      <Sheet open={open} onClose={close} title={pt('impReviewTitle')} wide>
        <div className="imp-review">
          <p className="muted">
            {pt('impReviewHelp', { n: review.length, file: fileBase })}
          </p>
          <PossessionTable
            rows={shown}
            extraKeys={extraKeys}
            itemTypes={reviewTypes}
            categoriesFor={reviewCategoriesFor}
            locations={[...new Set([...locations, ...review.map((r) => r.location)].filter(Boolean))]}
            sort={sort}
            onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
            selected={included}
            onSelect={(ids, on) =>
              setIncluded((s) => {
                const next = new Set(s);
                ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
                return next;
              })
            }
            onSave={(id, patch) =>
              setReview((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...possessionFields(patch, r) } : r)))
            }
            onDelete={(id) => setReview((rs) => rs && rs.filter((r) => r.id !== id))}
            currency={currency}
            lang={lang}
            editNew={null}
            checkLabel={pt('impInclude')}
            removeLabel={pt('impLeaveOut')}
            quickRemove
          />
          <div className="imp-foot">
            <button type="button" className="btn ghost" onClick={() => setReview(null)} disabled={busy}>
              <Back size={16} /> {pt('impBack')}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || keep.length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  await onImport(keep.map((r) => possessionFields(r)));
                  close();
                } catch {
                  setBusy(false);
                }
              }}
            >
              <Check size={16} /> {pt('impApprove', { n: keep.length })}
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  // ───── Step 1: item type, file, columns ─────
  const ready = used.length > 0 && !missingType && drafts.length > 0;
  return (
    <Sheet open={open} onClose={close} title={pt('impTitle')} wide>
      <div className="form imp">
        <label>
          <span className="imp-step">
            <b>1</b> {pt('impCategory')}
          </span>
          <input
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            placeholder={pt('impCategoryPh')}
            list="imp-types"
            dir="auto"
            required
            autoFocus
          />
          <small className="muted">{pt('impCategoryHelp')}</small>
          <datalist id="imp-types">
            {itemTypes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <div className="field">
          <span className="imp-step">
            <b>2</b> {pt('impFile')}
          </span>
          <label className="imp-drop">
            <FileSpreadsheet size={28} />
            <span className="imp-drop-title">{fileBase ? <bdi>{fileBase}</bdi> : pt('impChoose')}</span>
            <span className="muted">{pt('impFormats')}</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}

        {sheets && sheet && (
          <>
            {multi && (
              <div className="field">
                <span>{pt('impSheets')}</span>
                <small className="muted">{pt('impSheetsHelp')}</small>
                <ul className="imp-sheets">
                  {sheets.map((s, i) => {
                    const p = plans[i];
                    if (!p) return null;
                    return (
                      <li key={s.name + i} className={`${p.ignored ? 'is-ignored' : ''}${i === index ? ' is-active' : ''}`}>
                        <label className="check imp-sheet-use">
                          <input
                            type="checkbox"
                            checked={!p.ignored}
                            onChange={(e) => {
                              updatePlan(i, { ignored: !e.target.checked });
                              // Columns of an ignored sheet don't matter: show the next sheet in use instead.
                              if (!e.target.checked && i === index) {
                                const next = plans.findIndex((x, j) => j !== i && !x.ignored);
                                if (next >= 0) setIndex(next);
                              }
                            }}
                          />
                          <span className="imp-sheet-name">
                            <bdi>{s.name}</bdi>
                            <small className="muted">
                              {p.ignored ? pt('impIgnored') : pt('impRows', { n: rowsOf(s).length })}
                            </small>
                          </span>
                        </label>
                        {!p.ignored && (
                          <>
                            <input
                              className="imp-sheet-cat"
                              value={p.itemType}
                              onChange={(e) => updatePlan(i, { itemType: e.target.value })}
                              placeholder={itemType.trim() || pt('impCategoryShort')}
                              aria-label={`${pt('impSheetCategory')}: ${s.name}`}
                              list="imp-types"
                              dir="auto"
                            />
                            <button
                              type="button"
                              className={`btn sm ${i === index ? 'primary' : 'ghost'}`}
                              onClick={() => setIndex(i)}
                              aria-pressed={i === index}
                            >
                              {pt('impColumns')}
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {plan && !plan.ignored && (
            <div className="field">
              <span className="imp-step">
                <b>3</b> {pt('impColumns')}
                {multi && (
                  <span className="muted">
                    · <bdi>{sheet.name}</bdi>
                  </span>
                )}
              </span>
              <small className="muted">{pt('impColumnsHelp')}</small>
              <label className="check">
                <input
                  type="checkbox"
                  checked={hasHeaders}
                  onChange={(e) => {
                    setHasHeaders(e.target.checked);
                    setPlans(freshPlans(sheets, e.target.checked).map((f, i) => ({ ...f, ignored: plans[i]?.ignored ?? false, itemType: plans[i]?.itemType ?? '' })));
                  }}
                />
                {pt('impHeaders')}
              </label>
              <ul className="imp-map">
                {headers.map((h, i) => (
                  <li key={i}>
                    <span className="imp-col">
                      <bdi className="imp-col-name">{h}</bdi>
                      {sampleRow(i) && (
                        <span className="muted imp-col-sample">
                          {pt('impSample')} <bdi>{sampleRow(i).slice(0, 40)}</bdi>
                        </span>
                      )}
                    </span>
                    <select
                      value={plan.mapping[i] ?? 'extra'}
                      aria-label={h}
                      onChange={(e) => {
                        const next = [...plan.mapping];
                        const v = e.target.value as ColumnTarget;
                        // A field comes from one column only: another column that had it becomes its own column.
                        if (v !== 'extra' && v !== 'skip') next.forEach((x, j) => x === v && j !== i && (next[j] = 'extra'));
                        next[i] = v;
                        setMapping(next);
                      }}
                    >
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label[lang]}
                        </option>
                      ))}
                      <option value="extra">{pt('impOwn')}</option>
                      <option value="skip">{pt('impSkip')}</option>
                    </select>
                  </li>
                ))}
              </ul>
            </div>
            )}
          </>
        )}

        <button type="button" className="btn primary block" disabled={!ready} onClick={startReview}>
          {ready
            ? pt('impReview', { n: drafts.length })
            : !sheets
              ? itemType.trim()
                ? pt('impNeedFile')
                : pt('impNeedCategory')
              : used.length === 0
                ? pt('impAllIgnored')
                : missingType
                  ? pt('impNeedCategory')
                  : pt('impEmpty')}
          {ready && <Next size={16} />}
        </button>
      </div>
    </Sheet>
  );
}
