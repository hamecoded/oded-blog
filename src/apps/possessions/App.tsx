import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Columns3, Eye, EyeOff, FileUp, PackageOpen, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { errorText, useApp } from '../../lib/app';
import type { Possession, PossessionDraft } from '../../lib/types';
import { loadLayout, orderedColumns, saveLayout, type ColumnLayout } from './columns';
import { BulkEdit } from './BulkEdit';
import { CameraSheet } from './CameraSheet';
import { ColumnsSheet } from './ColumnsSheet';
import { haystack } from './fields';
import {
  CURRENCIES,
  count,
  loadAutoCutOut,
  loadCurrency,
  money,
  saveAutoCutOut,
  saveCurrency,
  shrinkImage,
  type Currency,
} from './format';
import { ImportSheet } from './ImportSheet';
import { PhotoSheet } from './PhotoSheet';
import { PossessionTable, type SortState } from './PossessionTable';
import { PrintList } from './PrintList';
import { PrintSheet } from './PrintSheet';
import { loadPrintOptions, savePrintOptions, type PrintOptions } from './printing';
import { usePt } from './strings';

const sum = (rows: Possession[], k: 'value' | 'cost') => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
const qty = (rows: Possession[]) => rows.reduce((s, r) => s + r.quantity, 0);
/** Your own order: by item type (blank last), then the position rows were dragged to. */
const OWN_ORDER = 'position';
const byPosition = (a: Possession, b: Possession) => a.position - b.position || a.created_at.localeCompare(b.created_at);

interface Group {
  name: string;
  n: number;
  value: number;
}

/** Distinct values of `key` with item count and value, alphabetical, blank last. */
function groupBy(rows: Possession[], key: 'item_type' | 'category', lang: string): Group[] {
  const names = [...new Set(rows.map((r) => r[key]))];
  names.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, lang)));
  return names.map((name) => {
    const list = rows.filter((r) => r[key] === name);
    return { name, n: qty(list), value: sum(list, 'value') };
  });
}

/** Possessions: the signed-in user's things, imported from spreadsheets and edited in a table. */
export default function PossessionsApp() {
  const { user, prefs, toast, t } = useApp();
  const lang = prefs.uiLang;
  const pt = usePt();
  const [rows, setRows] = useState<Possession[] | null>(null);
  const [q, setQ] = useState('');
  /** The chosen item type (null: all of them), and the categories hidden within it. */
  const [type, setType] = useState<string | null>(null);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortState>({ key: OWN_ORDER, dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [currency, setCurrency] = useState<Currency>(() => loadCurrency(lang));
  const [layout, setLayoutState] = useState<ColumnLayout>(loadLayout);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [editNew, setEditNew] = useState<string | null>(null);
  const [armBulk, setArmBulk] = useState(false);
  /** Bumped to re-sort after an import (see "Row order" below). */
  const [arrangeTick, setArrangeTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  /** Background removal: what it's doing (shown in the photo sheet), the photo to go back to, and the setting. */
  const [cutting, setCutting] = useState<{ id: string; label: string } | null>(null);
  const [undoCut, setUndoCut] = useState<{ id: string; url: string } | null>(null);
  const [autoCutOut, setAutoCutOut] = useState(loadAutoCutOut);
  const [printOpen, setPrintOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintOptions>(loadPrintOptions);
  const photoTarget = useRef<string | null>(null);

  const fail = (e: unknown) => toast(errorText(e, t));
  /** The live database doesn't have the possessions table (or its newest columns) yet. */
  const [missing, setMissing] = useState(false);
  const reload = () =>
    api
      .listPossessions()
      .then((r) => {
        setMissing(false);
        setRows(r);
      })
      .catch((e) => {
        if (e instanceof Error && e.message === 'possessions/missing') setMissing(true);
        else fail(e);
        setRows((r) => r ?? []);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), [user?.id]);

  const setLayout = (l: ColumnLayout) => {
    setLayoutState(l);
    saveLayout(l);
  };
  const chooseType = (next: string | null) => {
    setType(next);
    setHiddenCats(new Set());
  };

  const all = useMemo(() => rows ?? [], [rows]);
  const types = useMemo(() => groupBy(all, 'item_type', lang), [all, lang]);
  const ofType = useMemo(() => (type === null ? all : all.filter((r) => r.item_type === type)), [all, type]);
  const cats = useMemo(() => (type === null ? [] : groupBy(ofType, 'category', lang)), [ofType, type, lang]);

  /** The rows the filters and search let through, in the chosen sort order. */
  const arrange = () => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = ofType.filter((r) => !hiddenCats.has(r.category) && words.every((w) => haystack(r).includes(w)));
    const val = (r: Possession): string | number | null =>
      sort.key.startsWith('x:') ? (r.extra[sort.key.slice(2)] ?? null) : ((r[sort.key as keyof Possession] as string | number | null) ?? null);
    if (sort.key === OWN_ORDER) {
      return shown
        .sort((a, b) => (a.item_type === b.item_type ? byPosition(a, b) : a.item_type === '' ? 1 : b.item_type === '' ? -1 : a.item_type.localeCompare(b.item_type, lang)))
        .map((r) => r.id);
    }
    return shown
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        let c: number;
        if (x === y) c = 0;
        else if (x === null || x === '') c = 1;
        else if (y === null || y === '') c = -1;
        else if (typeof x === 'number' && typeof y === 'number') c = (x - y) * sort.dir;
        else c = String(x).localeCompare(String(y), lang, { numeric: true }) * sort.dir;
        return c || a.category.localeCompare(b.category, lang) || a.title.localeCompare(b.title, lang) || a.created_at.localeCompare(b.created_at);
      })
      .map((r) => r.id);
  };

  // Row order: worked out when the sort, filters or search change, then kept while cells are edited, so a row
  // doesn't jump away (and another slide under the pointer) the moment its item type or title changes. Rows
  // added since stay at the end; deleted ones drop out.
  const viewKey = JSON.stringify([sort, q, type, [...hiddenCats].sort(), arrangeTick, user?.id]);
  const [view, setView] = useState<{ key: string; ids: string[]; known: Set<string> } | null>(null);
  if (rows !== null && view?.key !== viewKey) setView({ key: viewKey, ids: arrange(), known: new Set(all.map((r) => r.id)) });
  const visible = useMemo(() => {
    if (!view) return [];
    const byId = new Map(all.map((r) => [r.id, r]));
    const ids = [...view.ids.filter((id) => byId.has(id)), ...all.filter((r) => !view.known.has(r.id)).map((r) => r.id)];
    return ids.map((id) => byId.get(id)!);
  }, [view, all]);

  /** Earlier values for the dropdowns: places, item types, and each item type's categories. */
  const locations = useMemo(
    () => [...new Set(all.map((r) => r.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang)),
    [all, lang],
  );
  const typeNames = useMemo(() => types.map((g) => g.name).filter(Boolean), [types]);
  const categoriesFor = useMemo(() => {
    const map = new Map<string, Set<string>>();
    all.forEach((r) => r.category && (map.get(r.item_type) ?? map.set(r.item_type, new Set()).get(r.item_type)!).add(r.category));
    return (itemType: string) => [...(map.get(itemType) ?? [])].sort((a, b) => a.localeCompare(b, lang));
  }, [all, lang]);

  const extraKeys = useMemo(() => [...new Set(visible.flatMap((r) => Object.keys(r.extra)))], [visible]);

  // ───── changes ─────

  const save = (id: string, patch: PossessionDraft) => {
    setRows((rs) => rs && rs.map((r) => (r.id === id ? ({ ...r, ...patch } as Possession) : r)));
    api
      .savePossession({ ...patch, id })
      .then((saved) => setRows((rs) => rs && rs.map((r) => (r.id === id ? saved : r))))
      .catch((e) => {
        toast(`${pt('saveFailed')}: ${errorText(e, t)}`);
        void reload();
      });
  };

  const add = async () => {
    // A new item takes the chosen item type, and its category when only one is on show.
    const shownCats = cats.filter((c) => !hiddenCats.has(c.name));
    try {
      const p = await api.savePossession({
        item_type: type ?? '',
        category: type !== null && shownCats.length === 1 ? shownCats[0].name : '',
      });
      setQ('');
      setRows((rs) => [...(rs ?? []), p]);
      setEditNew(p.id);
    } catch (e) {
      fail(e);
    }
  };

  /**
   * Moves a row before or after another of the same item type. Usually one save: the row takes a position halfway
   * between its new neighbours; when there's no room between them, the whole item type is renumbered.
   */
  const moveRow = (id: string, targetId: string, after: boolean) => {
    const moving = all.find((r) => r.id === id);
    const target = all.find((r) => r.id === targetId);
    if (!moving || !target || moving.item_type !== target.item_type || id === targetId) return;
    const rest = all.filter((r) => r.item_type === moving.item_type && r.id !== id).sort(byPosition);
    const at = rest.findIndex((r) => r.id === targetId) + (after ? 1 : 0);
    const prev = rest[at - 1];
    const next = rest[at];
    let pos: number | null = null;
    if (!prev) pos = next ? next.position - 1000 : 0;
    else if (!next) pos = prev.position + 1000;
    else if (next.position - prev.position > 1e-6) pos = (prev.position + next.position) / 2;
    if (pos !== null) save(id, { position: pos });
    else {
      [...rest.slice(0, at), moving, ...rest.slice(at)].forEach((r, i) => {
        if (r.position !== (i + 1) * 1000) save(r.id, { position: (i + 1) * 1000 });
      });
    }
    setArrangeTick((n) => n + 1);
  };

  const remove = async (ids: string[]) => {
    try {
      await api.deletePossessions(ids);
      const drop = new Set(ids);
      setRows((rs) => rs && rs.filter((r) => !drop.has(r.id)));
      setSelected((s) => new Set([...s].filter((id) => !drop.has(id))));
      setArmBulk(false);
      toast(pt('deleted', { n: ids.length }));
    } catch (e) {
      fail(e);
    }
  };

  const importRows = async (drafts: PossessionDraft[]) => {
    try {
      const added = await api.addPossessions(drafts);
      setRows((rs) => [...(rs ?? []), ...added]);
      // Show what was just imported: its item type when they share one, otherwise everything.
      const addedTypes = [...new Set(added.map((r) => r.item_type))];
      chooseType(addedTypes.length === 1 ? addedTypes[0] : null);
      setArrangeTick((n) => n + 1);
      setQ('');
      toast(pt('impDone', { n: added.length }));
    } catch (e) {
      fail(e);
      throw e;
    }
  };

  const pickPhoto = (id: string) => {
    photoTarget.current = id;
    fileRef.current?.click();
  };

  /**
   * Take a photo: phones open their own camera app (a file input with `capture`); computers get the webcam sheet,
   * since `capture` does nothing on a desktop browser.
   */
  const takePhoto = (id: string) => {
    photoTarget.current = id;
    if (window.matchMedia('(pointer: coarse)').matches) cameraRef.current?.click();
    else setCameraOpen(true);
  };

  /**
   * Cuts the item out of its photo, uploads the result and keeps the previous photo for Undo. The remover (and,
   * the first time, its model) loads only now.
   */
  const cutOutPhoto = async (id: string, source: Blob | string, previousUrl: string) => {
    setCutting({ id, label: pt('bgPreparing') });
    try {
      const { cutOut } = await import('./bgremove');
      const file = await cutOut(source, (p) =>
        setCutting({
          id,
          label: p.phase === 'download' ? pt('bgDownloading', { pct: Math.round(p.fraction * 100) }) : pt('bgWorking'),
        }),
      );
      const url = await api.uploadPossessionImage(file);
      save(id, { image_url: url });
      setUndoCut({ id, url: previousUrl });
      toast(pt('bgDone'));
    } catch (e) {
      toast(`${pt('bgFailed')}: ${errorText(e, t)}`);
    } finally {
      setCutting(null);
    }
  };

  const uploadPhoto = async (file: File | undefined) => {
    const id = photoTarget.current;
    if (!file || !id) return;
    setUploading(id);
    let small: File | null = null;
    let url = '';
    try {
      small = await shrinkImage(file);
      url = await api.uploadPossessionImage(small);
      save(id, { image_url: url });
      setUndoCut(null);
    } catch (e) {
      fail(e);
    } finally {
      setUploading(null);
    }
    if (small && url && autoCutOut) void cutOutPhoto(id, small, url);
  };

  const toggleCat = (name: string) =>
    setHiddenCats((h) => {
      const next = new Set(h);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const typeName = (s: string) => s || pt('noItemType');
  const catName = (s: string) => s || pt('uncategorized');
  const filterText = [
    type !== null ? typeName(type) : '',
    hiddenCats.size ? cats.filter((c) => !hiddenCats.has(c.name)).map((c) => catName(c.name)).join(', ') : '',
    q ? `“${q}”` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const photoItem = all.find((r) => r.id === photoId) ?? null;
  const change = sum(visible, 'value') - sum(visible, 'cost');
  const hiddenCount = layout.hidden.filter((id) => orderedColumns(extraKeys).includes(id)).length;

  if (rows === null) return <p className="loading">{t('loading')}</p>;
  if (missing) {
    return (
      <div className="poss-empty">
        <PackageOpen size={48} strokeWidth={1.4} aria-hidden />
        <p>{pt('notSetUp')}</p>
        <code dir="ltr">npm run db:update</code>
      </div>
    );
  }

  return (
    <div className="poss">
      <div className="poss-screen">
        <div className="poss-bar">
          <label className="poss-search">
            <Search size={18} aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={pt('search')} aria-label={pt('search')} dir="auto" />
          </label>
          <div className="poss-actions">
            <button type="button" className="btn ghost sm" onClick={() => setImporting(true)} title={pt('importLong')}>
              <FileUp size={16} /> {pt('import')}
            </button>
            {all.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => setColumnsOpen(true)}>
                <Columns3 size={16} /> {pt('columns')}
                {hiddenCount > 0 && <span className="poss-count">{pt('nHidden', { n: hiddenCount })}</span>}
              </button>
            )}
            <button type="button" className="btn ghost sm" onClick={() => setPrintOpen(true)} disabled={!visible.length}>
              <Printer size={16} /> {pt('print')}
            </button>
            <button type="button" className="btn primary sm" onClick={add}>
              <Plus size={16} /> {pt('add')}
            </button>
          </div>
        </div>

        {all.length === 0 ? (
          <div className="poss-empty">
            <PackageOpen size={48} strokeWidth={1.4} aria-hidden />
            <p>{pt('empty')}</p>
            <div className="poss-actions">
              <button type="button" className="btn primary" onClick={() => setImporting(true)}>
                <FileUp size={18} /> {pt('importLong')}
              </button>
              <button type="button" className="btn ghost" onClick={add}>
                <Plus size={18} /> {pt('add')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl className="poss-stats">
              <div>
                <dt>{pt('items')}</dt>
                <dd>{count(qty(visible), lang)}</dd>
              </div>
              <div>
                <dt>{pt('totalCost')}</dt>
                <dd>{money(sum(visible, 'cost'), currency, lang)}</dd>
              </div>
              <div>
                <dt>{pt('totalValue')}</dt>
                <dd>{money(sum(visible, 'value'), currency, lang)}</dd>
              </div>
              <div>
                <dt>{pt('change')}</dt>
                <dd className={change > 0 ? 'up' : change < 0 ? 'down' : undefined}>
                  {change > 0 ? '+' : ''}
                  {money(change, currency, lang)}
                </dd>
              </div>
              <label className="poss-currency">
                <span>{pt('currency')}</span>
                <select
                  value={currency}
                  onChange={(e) => {
                    const c = e.target.value as Currency;
                    setCurrency(c);
                    saveCurrency(c);
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </dl>

            <section className="poss-cats" aria-label={pt('itemTypes')}>
              <div className="poss-cats-row" role="group">
                <button type="button" className={`pc-card all${type === null ? ' on' : ''}`} onClick={() => chooseType(null)} aria-pressed={type === null}>
                  <span className="pc-name">{pt('allTypes')}</span>
                  <span className="pc-meta">
                    {pt('nItems', { n: count(qty(all), lang) })} · {money(sum(all, 'value'), currency, lang)}
                  </span>
                </button>
                {types.map((g) => (
                  <button
                    key={g.name || '-'}
                    type="button"
                    className={`pc-card${type === g.name ? ' on' : ''}`}
                    aria-pressed={type === g.name}
                    onClick={() => chooseType(type === g.name ? null : g.name)}
                  >
                    <span className="pc-name" dir="auto">
                      {typeName(g.name)}
                    </span>
                    <span className="pc-meta">
                      {pt('nItems', { n: count(g.n, lang) })} · {money(g.value, currency, lang)}
                    </span>
                  </button>
                ))}
              </div>
              {type === null ? (
                <p className="muted poss-hint">{pt('pickTypeHint')}</p>
              ) : (
                cats.length > 0 && (
                  <div className="poss-subcats" role="group" aria-label={pt('categories')}>
                    <span className="poss-subcats-label">{pt('categoriesOf', { type: typeName(type) })}</span>
                    {cats.map((c) => {
                      const on = !hiddenCats.has(c.name);
                      return (
                        <button
                          key={c.name || '-'}
                          type="button"
                          className={`chip sm${on ? ' on' : ' off'}`}
                          aria-pressed={on}
                          onClick={() => toggleCat(c.name)}
                          title={pt('hiddenHint')}
                        >
                          {on ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
                          <bdi>{catName(c.name)}</bdi>
                          <span className="muted">{count(c.n, lang)}</span>
                        </button>
                      );
                    })}
                    {cats.length > 1 && hiddenCats.size < cats.length && (
                      <button type="button" className="btn ghost sm" onClick={() => setHiddenCats(new Set(cats.map((c) => c.name)))}>
                        <EyeOff size={14} /> {pt('hideAll')}
                      </button>
                    )}
                    {hiddenCats.size > 0 && (
                      <button type="button" className="btn ghost sm" onClick={() => setHiddenCats(new Set())}>
                        <Eye size={14} /> {pt('showAll')}
                      </button>
                    )}
                  </div>
                )
              )}
            </section>

            {selected.size > 0 && (
              <div className="poss-selbar" role="region" aria-live="polite">
                <span>{pt('selected', { n: selected.size })}</span>
                <BulkEdit
                  lang={lang}
                  suggestions={{
                    item_type: typeNames,
                    category: [...new Set(all.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang)),
                    location: locations,
                  }}
                  onApply={(patch) => {
                    const ids = [...selected].filter((id) => all.some((r) => r.id === id));
                    ids.forEach((id) => save(id, patch));
                    toast(pt('appliedTo', { n: ids.length }));
                  }}
                />
                <button
                  type="button"
                  className={`btn sm ${armBulk ? 'primary danger-fill' : 'ghost danger'}`}
                  onClick={() => (armBulk ? void remove([...selected]) : setArmBulk(true))}
                >
                  <Trash2 size={15} /> {armBulk ? pt('sure') : pt('deleteN', { n: selected.size })}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    setSelected(new Set());
                    setArmBulk(false);
                  }}
                >
                  <X size={15} /> {pt('clear')}
                </button>
              </div>
            )}

            {sort.key !== OWN_ORDER && visible.length > 0 && (
              <div className="pt-order">
                <span className="muted">{pt('orderHint')}</span>
                <button type="button" className="btn ghost sm" onClick={() => setSort({ key: OWN_ORDER, dir: 1 })}>
                  <ArrowDownUp size={15} /> {pt('yourOrder')}
                </button>
              </div>
            )}

            {visible.length === 0 ? (
              <p className="empty">{type !== null && cats.length > 0 && hiddenCats.size === cats.length ? pt('allHidden') : pt('noMatch')}</p>
            ) : (
              <PossessionTable
                rows={visible}
                extraKeys={extraKeys}
                itemTypes={typeNames}
                categoriesFor={categoriesFor}
                locations={locations}
                sort={sort}
                onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
                selected={selected}
                onSelect={(ids, on) => {
                  setArmBulk(false);
                  setSelected((s) => {
                    const next = new Set(s);
                    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
                    return next;
                  });
                }}
                onSave={save}
                onDelete={(id) => void remove([id])}
                onPhoto={(p) => setPhotoId(p.id)}
                busyId={uploading ?? cutting?.id ?? null}
                currency={currency}
                lang={lang}
                editNew={editNew}
                layout={layout}
                onLayout={setLayout}
                onMoveRow={moveRow}
                reorder={sort.key === OWN_ORDER}
                reorderHint={pt('orderHint')}
              />
            )}
          </>
        )}
      </div>

      <PrintList
        rows={visible}
        currency={currency}
        lang={lang}
        owner={user?.display_name ?? ''}
        filter={filterText}
        options={printOptions}
      />
      <PrintSheet
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        options={printOptions}
        onOptions={(o) => {
          setPrintOptions(o);
          savePrintOptions(o);
        }}
        onPrint={() => {
          setPrintOpen(false);
          // Let the sheet close and the list re-render with the options before the print dialog opens.
          requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
        }}
        extraKeys={[...new Set(all.flatMap((r) => Object.keys(r.extra)))]}
        count={visible.length}
        lang={lang}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void uploadPhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void uploadPhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <CameraSheet
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onShot={(file) => {
          setCameraOpen(false);
          void uploadPhoto(file);
        }}
      />
      <ImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        onImport={importRows}
        itemTypes={typeNames}
        categoriesFor={categoriesFor}
        locations={locations}
        currency={currency}
      />
      <ColumnsSheet
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        order={orderedColumns(extraKeys, layout)}
        layout={layout}
        onLayout={setLayout}
        lang={lang}
      />
      <PhotoSheet
        item={photoItem}
        busy={uploading === photoId}
        onClose={() => setPhotoId(null)}
        onChoose={() => photoId && pickPhoto(photoId)}
        onCamera={() => photoId && takePhoto(photoId)}
        onCutOut={() => photoItem?.image_url && void cutOutPhoto(photoItem.id, photoItem.image_url, photoItem.image_url)}
        cutting={cutting && cutting.id === photoId ? cutting.label : null}
        onUndo={
          undoCut && undoCut.id === photoId
            ? () => {
                save(undoCut.id, { image_url: undoCut.url });
                setUndoCut(null);
              }
            : undefined
        }
        autoCutOut={autoCutOut}
        onAutoCutOut={(on) => {
          setAutoCutOut(on);
          saveAutoCutOut(on);
        }}
        onRemove={() => {
          if (photoId) save(photoId, { image_url: null });
          setPhotoId(null);
        }}
      />
    </div>
  );
}
