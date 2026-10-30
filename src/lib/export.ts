/**
 * Offline / portable exports.
 *  - HTML: one self-describing file per post. Opens in TextEdit, Safari, Word, LibreOffice,
 *    keeps RTL, alignment, fonts and images. Metadata lives in <meta> tags.
 *  - Markdown: YAML front matter + CommonMark body (alignment/fonts are dropped, math as $…$).
 *  - ZIP: everything above for all posts plus downloaded media and a JSON backup.
 */
import katex from 'katex';
import TurndownService from 'turndown';
import type { Post } from './types';
import { fontHref, fontsInHtml } from './fonts';
import { absoluteUrl, downloadBlob, formatDate, postPath } from './util';

const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css`;

export const EXPORT_CSS = `
body{margin:0 auto;max-width:760px;padding:24px 18px;font-family:Heebo,'Arial Hebrew',Arial,sans-serif;font-size:18px;line-height:1.75;color:#1f2330;background:#fff}
h1{font-size:2em;line-height:1.25;margin:.2em 0}
.meta{color:#666;font-size:.85em;margin-bottom:1.5em}
.tags span{display:inline-block;border:1px solid #ccc;border-radius:99px;padding:0 .6em;margin:0 .2em;font-size:.8em}
img,video,iframe{max-width:100%;height:auto}
figure{margin:1.2em auto}
figure img,figure video{width:100%;border-radius:8px;display:block}
figcaption{font-size:.85em;color:#666;text-align:center;margin-top:.4em}
.align-center{margin-inline:auto}
.align-full,.align-hero{width:100%!important}
.align-hero img{aspect-ratio:21/9;object-fit:cover}
article[dir=rtl] .align-inline-start,article[dir=ltr] .align-inline-end{float:right;margin:.3em 0 .6em 1.2em}
article[dir=ltr] .align-inline-start,article[dir=rtl] .align-inline-end{float:left;margin:.3em 1.2em .6em 0}
.embed{position:relative;aspect-ratio:16/9}.embed.vertical{aspect-ratio:9/16;max-width:340px;margin:auto}
.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
blockquote{border-inline-start:4px solid #c7c9d9;margin:1em 0;padding-inline-start:1em;color:#444}
mark{background:#fff3a3}
pre,code{font-family:ui-monospace,Menlo,monospace;background:#f4f4f6;border-radius:4px;padding:.1em .3em}
.math-display{display:block;text-align:center;margin:.8em 0}
figure audio{width:100%}.audio-embed iframe{width:100%;height:166px;border:0}.audio-embed.p-spotify iframe{height:152px}.audio-embed.p-mixcloud iframe{height:60px}.audio-embed.p-archive iframe{height:60px}
hr{border:0;border-top:1px solid #ddd;margin:2em 0}
.cover{width:100%;border-radius:12px;aspect-ratio:1200/630;object-fit:cover}
article{clear:both;overflow:hidden}
@media print{body{max-width:none;padding:0}a{color:inherit}.page-break{break-before:page}}
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Replace LaTeX spans with KaTeX output, keeping the LaTeX source as data-latex. */
export function renderMathInHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll<HTMLElement>('span[data-type="math"]').forEach((el) => {
    el.innerHTML = katex.renderToString(el.dataset.latex ?? '', {
      throwOnError: false,
      displayMode: el.dataset.display === 'true',
      output: 'htmlAndMathml',
    });
  });
  return doc.body.firstElementChild!.innerHTML;
}

function articleHtml(p: Post, lang: 'he' | 'en'): string {
  const dir = p.lang === 'he' ? 'rtl' : 'ltr';
  const updated = p.updated_at !== p.published_at ? ` · ${lang === 'he' ? 'עודכן' : 'Updated'} ${formatDate(p.updated_at, lang)}` : '';
  return `<article dir="${dir}" lang="${p.lang}">
${p.cover_url ? `<img class="cover" src="${esc(p.cover_url)}" alt="">` : ''}
<h1>${esc(p.title)}</h1>
<div class="meta">${esc(p.author?.display_name ?? '')} · ${formatDate(p.published_at ?? p.created_at, lang)}${updated}
${p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}</div>
${renderMathInHtml(p.content_html)}
</article>`;
}

export function htmlDocument(posts: Post[], title: string, uiLang: 'he' | 'en'): string {
  const fonts = [...new Set(['Heebo', ...posts.flatMap((p) => fontsInHtml(p.content_html))])];
  const single = posts.length === 1 ? posts[0] : null;
  const meta = single
    ? [
        ['author', single.author?.display_name ?? ''],
        ['date', single.published_at ?? single.created_at],
        ['dcterms.modified', single.updated_at],
        ['keywords', single.tags.join(', ')],
        ['description', single.excerpt],
        ['blog:slug', single.slug],
        ['blog:url', absoluteUrl(postPath(single.slug))],
      ]
        .map(([n, c]) => `<meta name="${n}" content="${esc(c)}">`)
        .join('\n')
    : '';
  const dir = (single?.lang ?? uiLang) === 'he' ? 'rtl' : 'ltr';
  return `<!doctype html>
<html lang="${single?.lang ?? uiLang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${meta}
<link rel="stylesheet" href="${fontHref(fonts)}">
<link rel="stylesheet" href="${KATEX_CSS}">
<style>${EXPORT_CSS}</style>
</head>
<body>
${posts.map((p, i) => (i ? '<hr class="page-break">' : '') + articleHtml(p, uiLang)).join('\n')}
</body>
</html>`;
}

function turndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  td.addRule('math', {
    filter: (n) => n.nodeName === 'SPAN' && (n as HTMLElement).dataset.type === 'math',
    replacement: (_c, n) => {
      const el = n as HTMLElement;
      const latex = el.dataset.latex ?? '';
      return el.dataset.display === 'true' ? `\n\n$$${latex}$$\n\n` : `$${latex}$`;
    },
  });
  td.addRule('figure', {
    filter: (n) => n.nodeName === 'FIGURE',
    replacement: (_c, n) => {
      const el = n as HTMLElement;
      const cap = el.querySelector('figcaption')?.textContent ?? '';
      if (el.dataset.type === 'audio') {
        const src = el.dataset.src ?? '';
        return `\n\n[🔊 ${cap || src}](${src})\n\n`;
      }
      if (el.dataset.type === 'video') {
        const src = el.dataset.src ?? '';
        return `\n\n[▶ ${cap || src}](${src})\n\n`;
      }
      const img = el.querySelector('img');
      return `\n\n![${img?.alt || cap}](${img?.getAttribute('src') ?? ''})${cap ? `\n*${cap}*` : ''}\n\n`;
    },
  });
  td.addRule('mark', { filter: ['mark'], replacement: (c) => `==${c}==` });
  td.addRule('underline', { filter: ['u'], replacement: (c) => `<u>${c}</u>` });
  return td;
}

export function postToMarkdown(p: Post): string {
  const yaml = (v: string) => JSON.stringify(v);
  const front = [
    '---',
    `title: ${yaml(p.title)}`,
    `slug: ${yaml(p.slug)}`,
    `author: ${yaml(p.author?.display_name ?? '')}`,
    `date: ${p.published_at ?? p.created_at}`,
    `updated: ${p.updated_at}`,
    `lang: ${p.lang}`,
    `dir: ${p.lang === 'he' ? 'rtl' : 'ltr'}`,
    `status: ${p.status}`,
    `visibility: ${p.visibility ?? 'public'}`,
    `tags: [${p.tags.map(yaml).join(', ')}]`,
    p.cover_url ? `cover: ${yaml(p.cover_url)}` : '',
    '---',
  ]
    .filter(Boolean)
    .join('\n');
  return `${front}\n\n# ${p.title}\n\n${turndown().turndown(p.content_html)}\n`;
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'post';
}

export function downloadPostHtml(p: Post, uiLang: 'he' | 'en') {
  downloadBlob(new Blob([htmlDocument([p], p.title, uiLang)], { type: 'text/html;charset=utf-8' }), `${safeFileName(p.slug)}.html`);
}

export function downloadPostMarkdown(p: Post) {
  downloadBlob(new Blob([postToMarkdown(p)], { type: 'text/markdown;charset=utf-8' }), `${safeFileName(p.slug)}.md`);
}

export function downloadJsonBackup(posts: Post[]) {
  const data = { format: 'bilingual-blog/v1', exported_at: new Date().toISOString(), posts };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `blog-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

/** Full offline archive: HTML + Markdown per post, downloaded media, index and JSON backup. */
export async function downloadZip(posts: Post[], uiLang: 'he' | 'en', siteName: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const media = new Map<string, string>();

  async function localize(src: string): Promise<string> {
    if (media.has(src)) return media.get(src)!;
    try {
      const blob = await (await fetch(src)).blob();
      const name = `media/${media.size + 1}.${EXT[blob.type] ?? src.split('?')[0].split('.').pop()?.slice(0, 5) ?? 'bin'}`;
      zip.file(name, blob);
      media.set(src, name);
      return name;
    } catch {
      return src; // keep the remote link if it can't be fetched (CORS / offline)
    }
  }

  async function localizeHtml(html: string, prefix: string): Promise<string> {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    for (const el of doc.querySelectorAll<HTMLElement>('img[src], video[src], audio[src]')) {
      const local = await localize(el.getAttribute('src')!);
      if (local !== el.getAttribute('src')) el.setAttribute('src', prefix + local);
      if (el.closest('figure')?.dataset.src === el.getAttribute('src')) el.closest('figure')!.dataset.src = prefix + local;
    }
    return doc.body.firstElementChild!.innerHTML;
  }

  const offline: Post[] = [];
  for (const p of posts) {
    const cover = p.cover_url ? await localize(p.cover_url) : null;
    const local: Post = {
      ...p,
      cover_url: cover && cover !== p.cover_url ? `../${cover}` : p.cover_url,
      content_html: await localizeHtml(p.content_html, '../'),
    };
    offline.push(local);
    const file = safeFileName(p.slug);
    zip.file(`posts/${file}.html`, htmlDocument([local], p.title, uiLang));
    zip.file(`markdown/${file}.md`, postToMarkdown(local));
  }

  const dir = uiLang === 'he' ? 'rtl' : 'ltr';
  const index = `<!doctype html><html lang="${uiLang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(siteName)}</title><style>${EXPORT_CSS}li{margin:.4em 0}</style></head><body><h1>${esc(siteName)}</h1><ul>${posts
    .map((p) => `<li dir="${p.lang === 'he' ? 'rtl' : 'ltr'}"><a href="posts/${encodeURIComponent(safeFileName(p.slug))}.html">${esc(p.title)}</a> — <small>${formatDate(p.published_at ?? p.created_at, uiLang)}${p.tags.length ? ' · #' + p.tags.map(esc).join(' #') : ''}</small></li>`)
    .join('')}</ul></body></html>`;
  zip.file('index.html', index);
  zip.file('all-posts.html', htmlDocument(offline.map((p) => ({ ...p, content_html: p.content_html.replaceAll('../media/', 'media/'), cover_url: p.cover_url?.replace('../media/', 'media/') ?? null })), siteName, uiLang));
  zip.file('posts.json', JSON.stringify({ format: 'bilingual-blog/v1', exported_at: new Date().toISOString(), posts }, null, 2));
  zip.file(
    'README.txt',
    `${siteName} — offline archive\n\nindex.html      list of posts (open in any browser)\nall-posts.html  every post in one file (opens in TextEdit / Word)\nposts/*.html    one file per post, metadata in <meta> tags\nmarkdown/*.md   Markdown with YAML front matter\nmedia/          images and videos\nposts.json      full backup, can be restored from the Manage page\n`,
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${safeFileName(siteName)}-${new Date().toISOString().slice(0, 10)}.zip`);
}
