import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Printer, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import type { Post } from '../lib/types';
import type { TagGroup } from '../lib/types';
import { can, formatDate, pickText, titleDir } from '../lib/util';
import { PostContent } from '../components/PostContent';
import { TagChips } from '../components/PostBits';
import { NotFound } from './NotFound';

/**
 * Print-optimized rendering used for PDF export (/posts/:slug/print and /posts/print).
 * The browser's own PDF engine handles Hebrew shaping, RTL and fonts perfectly,
 * which client-side PDF libraries do not.
 */
export function PrintView() {
  const { slug } = useParams();
  const { t, prefs, user, authReady } = useApp();
  const allowed = can.export(user);
  const nav = useNavigate();
  const [posts, setPosts] = useState<Post[] | null>(null);
  // /posts/print?group=<slug>: every post of one tag group (admin → Tag groups → Export).
  const groupSlug = useSearchParams()[0].get('group');
  const [group, setGroup] = useState<TagGroup | null>(null);

  useEffect(() => {
    if (!allowed) return;
    if (slug) api.getPost(slug).then((p) => setPosts(p ? [p] : []));
    else if (groupSlug)
      api.getTagGroup(groupSlug).then(async (g) => {
        setGroup(g);
        setPosts(g ? [...(await api.listPosts({ limit: 10000, anyTags: g.tags }))].reverse() : []);
      });
    else api.listPosts({ limit: 10000 }).then((ps) => setPosts([...ps].reverse()));
  }, [slug, groupSlug, allowed]);
  const groupName = group ? pickText(group.config.name, prefs.uiLang) || group.slug : '';

  useEffect(() => {
    if (!posts?.length) return;
    document.title = slug ? posts[0].title : groupName || t('siteName');
    let cancelled = false;
    (async () => {
      // Lazy images never load off-screen; force them so every page has its pictures.
      document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
      await document.fonts.ready;
      const images = Promise.all(
        [...document.images]
          .filter((i) => !i.complete)
          .map(
            (i) =>
              new Promise((r) => {
                i.addEventListener('load', r, { once: true });
                i.addEventListener('error', r, { once: true });
              }),
          ),
      );
      await Promise.race([images, new Promise((r) => setTimeout(r, 6000))]);
      await new Promise((r) => setTimeout(r, 300));
      if (!cancelled) window.print();
    })();
    return () => {
      cancelled = true;
    };
  }, [posts, slug, t, groupName]);

  if (!authReady) return <p className="loading">{t('loading')}</p>;
  if (!allowed) return <p className="empty">{t('forbidden')}</p>;
  if (posts === null) return <p className="loading">{t('loading')}</p>;
  if (!posts.length) return <NotFound />;

  return (
    <div className="print-page">
      <div className="print-bar no-print">
        <button type="button" className="icon-btn" onClick={() => nav(-1)} aria-label={t('close')}>
          <X size={20} />
        </button>
        <span className="grow hint">{t('pdfHint')}</span>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          <Printer size={18} /> {t('printNow')}
        </button>
      </div>
      {!slug && (
        <header className="print-title">
          <h1 dir="auto">{groupName || t('siteName')}</h1>
          <p dir="auto">{group ? pickText(group.config.tagline, prefs.uiLang) : t('tagline')}</p>
        </header>
      )}
      {posts.map((p) => (
        <article key={p.id} className="post print-post" dir={p.lang === 'he' ? 'rtl' : 'ltr'} lang={p.lang}>
          {p.cover_url && <img className="post-cover" src={p.cover_url} alt="" />}
          <h1 dir={titleDir(p.title, p.lang)}>{p.title}</h1>
          <p className="muted print-meta" dir={prefs.uiLang === 'he' ? 'rtl' : 'ltr'} lang={prefs.uiLang}>
            <bdi>{p.author?.display_name}</bdi> · {t('published')} {formatDate(p.published_at ?? p.created_at, prefs.uiLang)}
            {p.updated_at !== p.published_at && ` · ${t('updated')} ${formatDate(p.updated_at, prefs.uiLang)}`}
          </p>
          <TagChips tags={p.tags} />
          <PostContent html={p.content_html} lang={p.lang} />
        </article>
      ))}
    </div>
  );
}
