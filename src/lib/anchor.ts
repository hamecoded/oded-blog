/**
 * Text-quote anchors (quote + surrounding context) for comments on highlighted text.
 * Survives small edits to the post: we re-locate the quote using its prefix/suffix.
 */
export interface TextAnchor {
  quote: string;
  prefix: string;
  suffix: string;
}

const CONTEXT = 32;

function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
  return out;
}

export function anchorFromRange(root: HTMLElement, range: Range): TextAnchor | null {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const full = root.textContent ?? '';
  const pre = document.createRange();
  pre.setStart(root, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const quote = range.toString();
  if (!quote.trim()) return null;
  const end = start + quote.length;
  return { quote, prefix: full.slice(Math.max(0, start - CONTEXT), start), suffix: full.slice(end, end + CONTEXT) };
}

function commonSuffixLen(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function commonPrefixLen(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function locate(root: HTMLElement, a: TextAnchor): [number, number] | null {
  const full = root.textContent ?? '';
  let best: [number, number] | null = null;
  let bestScore = -1;
  for (let i = full.indexOf(a.quote); i >= 0; i = full.indexOf(a.quote, i + 1)) {
    const score =
      commonSuffixLen(full.slice(Math.max(0, i - CONTEXT), i), a.prefix) +
      commonPrefixLen(full.slice(i + a.quote.length, i + a.quote.length + CONTEXT), a.suffix);
    if (score > bestScore) {
      bestScore = score;
      best = [i, i + a.quote.length];
    }
  }
  return best;
}

/** Wrap [start, end) of root's text in <mark class="cmt-hl"> elements. */
export function highlight(root: HTMLElement, start: number, end: number, id: string, resolved: boolean) {
  let pos = 0;
  for (const node of textNodes(root)) {
    const len = node.data.length;
    const s = Math.max(start, pos);
    const e = Math.min(end, pos + len);
    pos += len;
    if (s >= e) continue;
    if (node.parentElement?.closest('.katex-mathml')) continue;
    let target = node;
    if (s - (pos - len) > 0) target = target.splitText(s - (pos - len));
    if (e - s < target.data.length) target.splitText(e - s);
    const mark = document.createElement('mark');
    mark.className = resolved ? 'cmt-hl resolved' : 'cmt-hl';
    mark.dataset.cid = id;
    target.parentNode!.insertBefore(mark, target);
    mark.append(target);
    if (pos >= end) break;
  }
}
