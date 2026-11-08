import { useState, type ReactNode } from 'react';
import type { Lang, Possession } from '../../lib/types';
import { count, day, money, type Currency } from './format';
import { groupLabel, groupValue, type PrintOptions } from './printing';
import { usePt } from './strings';

const sum = (rows: Possession[], k: 'value' | 'cost') => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
const qty = (rows: Possession[]) => rows.reduce((s, r) => s + r.quantity, 0);

/**
 * Pieces of text joined with " · ", each in its own <bdi>: Hebrew and English show correctly side by side while
 * the line keeps the page's direction and alignment. (dir="auto" on the line itself would align English lines
 * left and Hebrew ones right, so a mixed list wouldn't line up.)
 */
function joined(parts: (string | null | undefined)[]) {
  return parts
    .filter((x): x is string => !!x)
    .map((x, i) => (
      <span key={i}>
        {i > 0 && ' · '}
        <bdi>{x}</bdi>
      </span>
    ));
}

/** Distinct values of a grouping, in order: alphabetical (numbers by value), blank last. */
function groups(rows: Possession[], by: (r: Possession) => string, lang: Lang): string[] {
  return [...new Set(rows.map(by))].sort((a, b) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, lang, { numeric: true }),
  );
}

/**
 * The printed list: hidden on screen, it replaces the app when printing (see "App: possessions" in index.css).
 * Prints what's on screen (the chosen item type, shown categories and search), in the on-screen order, grouped
 * by the column chosen in the print options: item type groups get category sub-headings; any other column gives
 * one level; "none" prints one list. Each group has its count, value and subtotal.
 */
export function PrintList({
  rows,
  currency,
  lang,
  owner,
  filter,
  options,
}: {
  rows: Possession[];
  currency: Currency;
  lang: Lang;
  owner: string;
  filter: string;
  options: PrintOptions;
}) {
  const pt = usePt();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const m = (n: number | null) => money(n, currency, lang);
  const withPhotos = options.photos && rows.some((r) => r.image_url);
  const by = options.groupBy;
  const byName = groupLabel(by, lang, pt('printYear'));
  const blankName = (key: string) =>
    key === 'item_type' ? pt('noItemType') : key === 'category' ? pt('uncategorized') : pt('printNoValue', { col: groupLabel(key, lang, pt('printYear')) });

  const table = (list: Possession[]) => (
    <table className="pp-table">
      <tbody>
        {list.map((p) => {
          const extras = Object.entries(p.extra);
          return (
            <tr key={p.id}>
              {withPhotos && <td className="pp-img">{p.image_url && <img src={p.image_url} alt="" />}</td>}
              <td className="pp-main">
                <div className="pp-title">
                  <bdi>{p.title || '—'}</bdi>
                  {p.quantity !== 1 && <span className="pp-qty"> ×{count(p.quantity, lang)}</span>}
                </div>
                {(p.maker || (by !== 'item_type' && p.item_type) || (by !== 'item_type' && by !== 'category' && p.category)) && (
                  <div className="pp-sub">
                    {joined([p.maker, by !== 'item_type' ? p.item_type : '', by !== 'item_type' && by !== 'category' ? p.category : ''])}
                  </div>
                )}
                {p.description && (
                  <div className="pp-desc">
                    <bdi>{p.description}</bdi>
                  </div>
                )}
                {(extras.length > 0 || p.location || p.condition || p.notes) && (
                  <div className="pp-extra">
                    {joined([
                      by !== 'location' ? p.location : '',
                      by !== 'condition' ? p.condition : '',
                      ...extras.filter(([k]) => by !== `x:${k}`).map(([k, v]) => `${k}: ${v}`),
                      p.notes,
                    ])}
                  </div>
                )}
              </td>
              <td className="pp-date">{day(p.date_purchased, lang)}</td>
              <td className="pp-num">
                {p.cost != null && <div className="pp-cost">{m(p.cost)}</div>}
                <div className="pp-value">{m(p.value)}</div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const section = (key: string, name: string, list: Possession[], inner: ReactNode) => (
    <section key={key || '-'} className="pp-group">
      <h2>
        <bdi>{name}</bdi>
        <small>
          {pt('nItems', { n: count(qty(list), lang) })} · {m(sum(list, 'value'))}
        </small>
      </h2>
      {inner}
      <p className="pp-subtotal">
        {pt('subtotal')}: {m(sum(list, 'cost'))} → <strong>{m(sum(list, 'value'))}</strong>
      </p>
    </section>
  );

  let body: ReactNode;
  if (by === 'none') body = table(rows);
  else if (by === 'item_type') {
    body = groups(rows, (r) => r.item_type, lang).map((type) => {
      const ofType = rows.filter((r) => r.item_type === type);
      const cats = groups(ofType, (r) => r.category, lang);
      const split = cats.length > 1 || cats[0] !== '';
      return section(
        type,
        type || blankName('item_type'),
        ofType,
        split
          ? cats.map((cat) => {
              const list = ofType.filter((r) => r.category === cat);
              return (
                <div key={cat || '-'} className="pp-sub-group">
                  <h3>
                    <bdi>{cat || pt('uncategorized')}</bdi>
                    <small>
                      {count(qty(list), lang)} · {m(sum(list, 'value'))}
                    </small>
                  </h3>
                  {table(list)}
                </div>
              );
            })
          : table(ofType),
      );
    });
  } else {
    body = groups(rows, (r) => groupValue(r, by), lang).map((v) => {
      const list = rows.filter((r) => groupValue(r, by) === v);
      return section(v, v || blankName(by), list, table(list));
    });
  }

  return (
    <section className="pp" aria-hidden>
      <header className="pp-head">
        <div>
          <h1>{pt('printTitle')}</h1>
          <p>
            {pt('printFor', { name: owner })} · {pt('printedOn', { date: day(today, lang) })}
            {filter && (
              <>
                {' · '}
                <bdi>{pt('printFilter', { what: filter })}</bdi>
              </>
            )}
            {by !== 'none' && (
              <>
                {' · '}
                <bdi>{pt('printGroupedBy', { col: byName })}</bdi>
              </>
            )}
          </p>
        </div>
        <dl className="pp-totals">
          <div>
            <dt>{pt('items')}</dt>
            <dd>{count(qty(rows), lang)}</dd>
          </div>
          <div>
            <dt>{pt('totalCost')}</dt>
            <dd>{m(sum(rows, 'cost'))}</dd>
          </div>
          <div>
            <dt>{pt('totalValue')}</dt>
            <dd>{m(sum(rows, 'value'))}</dd>
          </div>
        </dl>
      </header>

      {body}

      <p className="pp-grand">
        {pt('total')}: {m(sum(rows, 'cost'))} → <strong>{m(sum(rows, 'value'))}</strong>
      </p>
    </section>
  );
}
