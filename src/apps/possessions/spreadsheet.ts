/**
 * Reads spreadsheets in the browser: Excel (.xlsx, also what Numbers and Google Sheets export), CSV and TSV.
 * Every cell comes back as text; Excel dates come back as 'YYYY-MM-DD'.
 */
export interface SheetData {
  name: string;
  /** First row is the header. */
  rows: string[][];
}

export async function readSpreadsheet(file: File): Promise<SheetData[]> {
  const base = file.name.replace(/\.[^.]+$/, '');
  if (/\.(xlsx|xlsm)$/i.test(file.name)) return readXlsx(file);
  if (/\.xls$/i.test(file.name)) throw new Error('possessions/xls');
  const text = await file.text();
  return [{ name: base, rows: parseDelimited(text) }];
}

// ───── CSV / TSV ─────

/** RFC 4180 CSV, with the delimiter guessed from the first line (comma, semicolon or tab). */
export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = ['\t', ';', ','].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return trimRows(rows);
}

function trimRows(rows: string[][]): string[][] {
  const out = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
  const width = Math.max(0, ...out.map((r) => r.length));
  return out.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);
}

// ───── XLSX ─────

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

async function readXlsx(file: File): Promise<SheetData[]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const xml = async (path: string) => {
    const f = zip.file(path);
    return f ? new DOMParser().parseFromString(await f.async('text'), 'application/xml') : null;
  };
  const byTag = (doc: Document | Element, tag: string) => [...doc.getElementsByTagNameNS('*', tag)];

  const workbook = await xml('xl/workbook.xml');
  if (!workbook) throw new Error('possessions/unreadable');
  const rels = await xml('xl/_rels/workbook.xml.rels');
  const targets = new Map(rels ? byTag(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']) : []);

  const shared: string[] = [];
  const sst = await xml('xl/sharedStrings.xml');
  if (sst) {
    for (const si of byTag(sst, 'si')) {
      // Rich text has several <t> runs; phonetic hints (<rPh>) are not part of the text.
      shared.push(byTag(si, 't').filter((t) => (t.parentNode as Element)?.localName !== 'rPh').map((t) => t.textContent ?? '').join(''));
    }
  }

  // Which cell styles are dates: built-in date formats plus custom ones that contain d/m/y and no text sections.
  const dateStyles = new Set<number>();
  const styles = await xml('xl/styles.xml');
  if (styles) {
    const custom = new Map(byTag(styles, 'numFmt').map((n) => [Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode') ?? '']));
    const cellXfs = byTag(styles, 'cellXfs')[0];
    if (cellXfs) {
      [...cellXfs.children].forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId') ?? 0);
        const code = (custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
        if (BUILTIN_DATE_FORMATS.has(id) || (/[dmy]/i.test(code) && !/[#0@]/.test(code))) dateStyles.add(i);
      });
    }
  }

  const sheets: SheetData[] = [];
  for (const s of byTag(workbook, 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id');
    let target = targets.get(rid) ?? '';
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const doc = await xml(target);
    if (!doc) continue;
    const grid: string[][] = [];
    for (const row of byTag(doc, 'row')) {
      const r = Number(row.getAttribute('r') ?? grid.length + 1) - 1;
      const cells: string[] = (grid[r] = grid[r] ?? []);
      let next = 0;
      for (const c of byTag(row, 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? colIndex(ref) : next;
        next = col + 1;
        const type = c.getAttribute('t');
        const v = byTag(c, 'v')[0]?.textContent ?? '';
        let text: string;
        if (type === 's') text = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') text = byTag(c, 't').map((t) => t.textContent ?? '').join('');
        else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
        else if ((type === null || type === 'n') && v !== '' && dateStyles.has(Number(c.getAttribute('s') ?? -1)))
          text = excelDate(Number(v));
        else if (v !== '' && Number.isFinite(Number(v))) text = String(Number(Number(v).toPrecision(15)));
        else text = v;
        cells[col] = text;
      }
    }
    const rows = Array.from(grid, (r) => Array.from(r ?? [], (c) => c ?? ''));
    sheets.push({ name: s.getAttribute('name') ?? `Sheet ${sheets.length + 1}`, rows: trimRows(rows) });
  }
  return sheets.filter((s) => s.rows.length > 0);
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '').toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/** Excel's day number (1900 date system) → 'YYYY-MM-DD'. */
export function excelDate(serial: number): string {
  if (!Number.isFinite(serial)) return '';
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}
