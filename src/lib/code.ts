import type { HLJSApi } from 'highlight.js';

/**
 * Code snippets are stored as plain `<pre><code class="language-xx">…</code></pre>` (TipTap's
 * code block), so they stay readable in exports. Syntax colours are painted on screen only,
 * by highlight.js, which is loaded on demand so posts without code don't pay for it.
 */

/** Languages offered in the editor; ids are highlight.js names. Empty id = detect automatically. */
export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: '', label: 'Auto' },
  { id: 'plaintext', label: 'Text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'xml', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'bash', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'swift', label: 'Swift' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
];

export const codeLanguageLabel = (id: string | null | undefined) =>
  CODE_LANGUAGES.find((l) => l.id === (id ?? ''))?.label ?? id ?? '';

let hljs: HLJSApi | null = null;
let loading: Promise<HLJSApi> | null = null;

export function loadHighlighter(): Promise<HLJSApi> {
  return (loading ??= import('highlight.js/lib/common').then((m) => (hljs = m.default)));
}

const langOf = (code: Element) => code.className.match(/(?:^|\s)language-([\w+#-]+)/)?.[1] ?? '';

/**
 * Colour every `pre > code` under root. Returns false when the highlighter still has to load
 * (the caller re-runs once `loadHighlighter()` resolves). Only adds spans, never text, so
 * comment anchors (text offsets) are unaffected.
 */
export function highlightCode(root: HTMLElement): boolean {
  const blocks = root.querySelectorAll<HTMLElement>('pre > code');
  if (!blocks.length) return true;
  if (!hljs) return false;
  blocks.forEach((code) => {
    const text = code.textContent ?? '';
    const lang = langOf(code);
    const res = lang && hljs!.getLanguage(lang) ? hljs!.highlight(text, { language: lang }) : hljs!.highlightAuto(text);
    code.innerHTML = res.value; // highlight.js escapes the source text
    code.classList.add('hljs');
  });
  return true;
}

/** Label + copy button for each code block. The label is CSS-generated, so no text is added. */
export function decorateCode(root: HTMLElement, labels: { copy: string; copied: string }) {
  root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code || pre.parentElement?.classList.contains('code-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    wrap.dir = 'ltr';
    const lang = langOf(code);
    if (lang && lang !== 'plaintext') wrap.dataset.lang = codeLanguageLabel(lang);
    pre.before(wrap);
    wrap.append(pre);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.dataset.label = labels.copy;
    btn.setAttribute('aria-label', labels.copy);
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent ?? '');
        btn.dataset.label = labels.copied;
        btn.classList.add('done');
        setTimeout(() => {
          btn.dataset.label = labels.copy;
          btn.classList.remove('done');
        }, 1500);
      } catch {
        /* clipboard blocked: nothing to do */
      }
    });
    wrap.append(btn);
  });
}
