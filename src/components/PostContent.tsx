import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { renderMath } from '../lib/math';
import { highlight, locate } from '../lib/anchor';
import { ensureFonts, fontsInHtml } from '../lib/fonts';
import { sanitizeHtml } from '../lib/sanitize';
import { useApp } from '../lib/app';
import type { Comment } from '../lib/types';

/**
 * Renders stored post HTML: sanitizes, typesets math and paints comment highlights.
 * Highlights are DOM decorations only — they never touch the stored HTML.
 */
export const PostContent = forwardRef<
  HTMLDivElement,
  {
    html: string;
    lang: 'he' | 'en';
    comments?: Comment[];
    showResolved?: boolean;
    activeComment?: string | null;
    onHighlightClick?: (id: string) => void;
    onOrphans?: (ids: Set<string>) => void;
  }
>(function PostContent({ html, lang, comments = [], showResolved, activeComment, onHighlightClick, onOrphans }, fwd) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useApp();
  useImperativeHandle(fwd, () => ref.current!);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    ensureFonts(fontsInHtml(html));
    el.innerHTML = sanitizeHtml(html);
    el.querySelectorAll<HTMLElement>('span[data-type="math"]').forEach((m) =>
      renderMath(m, m.dataset.latex ?? '', m.dataset.display === 'true'),
    );
    el.querySelectorAll('img').forEach((img) => img.setAttribute('decoding', 'async'));
    // "Watch on YouTube" under each YouTube embed: private videos play only on youtube.com, for the owner.
    // The label is CSS-generated (data-label), so it adds no text and comment anchors stay where they were.
    el.querySelectorAll<HTMLIFrameElement>('figure[data-type="video"] iframe').forEach((f) => {
      const id = f.src.match(/^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/)?.[1];
      if (!id) return;
      const a = document.createElement('a');
      a.className = 'yt-watch';
      a.href = `https://www.youtube.com/watch?v=${id}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.dataset.label = t('watchOnYoutube');
      a.setAttribute('aria-label', t('watchOnYoutube'));
      (f.closest('.embed') ?? f).after(a);
    });

    const orphans = new Set<string>();
    const roots = comments.filter((c) => !c.parent_id && c.quote && (showResolved || !c.resolved));
    // Locate every anchor first (on clean text), then paint from the end so offsets stay valid.
    const spans = roots
      .map((c) => ({ c, at: locate(el, c) }))
      .filter((x) => {
        if (!x.at) orphans.add(x.c.id);
        return !!x.at;
      })
      .sort((a, b) => b.at![0] - a.at![0]);
    spans.forEach(({ c, at }) => highlight(el, at![0], at![1], c.id, c.resolved));
    onOrphans?.(orphans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, comments, showResolved, t]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll('mark.cmt-hl.active').forEach((m) => m.classList.remove('active'));
    if (activeComment) el.querySelectorAll(`mark[data-cid="${activeComment}"]`).forEach((m) => m.classList.add('active'));
  }, [activeComment, html, comments, showResolved]);

  return (
    <div
      ref={ref}
      className="prose post-body"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      lang={lang}
      onClick={(e) => {
        const mark = (e.target as HTMLElement).closest<HTMLElement>('mark.cmt-hl');
        if (mark && onHighlightClick && !window.getSelection()?.toString()) onHighlightClick(mark.dataset.cid!);
      }}
    />
  );
});
