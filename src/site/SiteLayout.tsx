import { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router-dom';
import { Languages, Pencil, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, usePrintLock } from '../lib/app';
import { SiteCtx, useSite } from '../lib/site';
import type { TagGroup } from '../lib/types';
import { can } from '../lib/util';
import { CUSTOM_LANDINGS } from '../landings';
import { NotFound } from '../pages/NotFound';
import { DefaultLanding } from './DefaultLanding';
import { useScrolledPast } from './useLanding';

const YEAR = new Date().getFullYear();

/** Black or white, whichever reads better on the accent color. */
function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.6 ? '#16161c' : '#fff';
}

/**
 * /<slug>/… — a tag group's site. Same posts and pages as the blog, limited to the group's tags, with its own
 * header and footer instead of the blog's top bar, sign-in and floating menu. Unknown slugs are a 404.
 */
export function SiteLayout() {
  const { site = '' } = useParams();
  const { user, toastMsg } = useApp();
  const loc = useLocation();
  const [group, setGroup] = useState<TagGroup | null | undefined>(undefined);
  usePrintLock(can.export(user));

  // Show the loading state again when the address changes (adjusted during render, not in an effect).
  const [loadedFor, setLoadedFor] = useState(site);
  if (loadedFor !== site) {
    setLoadedFor(site);
    setGroup(undefined);
  }
  useEffect(() => {
    let live = true;
    api
      .getTagGroup(site.toLowerCase())
      .then((g) => live && setGroup(g))
      .catch(() => live && setGroup(null));
    return () => {
      live = false;
    };
  }, [site]);

  const ctx = useMemo(() => ({ group: group ?? null, base: group ? `/${group.slug}` : '' }), [group]);

  if (group === undefined) return <div className="site-loading" aria-busy="true" />;
  if (group === null)
    return (
      <main className="container">
        <NotFound />
      </main>
    );

  const onLanding = loc.pathname.replace(/\/$/, '').toLowerCase() === `/${group.slug}`;
  const accent = /^#[0-9a-f]{6}$/i.test(group.config.accent) ? group.config.accent : '#e0a458';
  return (
    <SiteCtx.Provider value={ctx}>
      <div className="tg-site" style={{ '--site-accent': accent, '--site-on-accent': onColor(accent) } as React.CSSProperties}>
        <SiteHeader />
        {/* The landing page runs edge to edge; every other page sits in the blog's usual column. */}
        <main className={onLanding ? 'tg-main-landing' : 'container tg-main'}>
          <Outlet />
        </main>
        <SiteFooter />
        {toastMsg && (
          <div className="toast" role="status">
            {toastMsg}
          </div>
        )}
        <ScrollRestoration />
      </div>
    </SiteCtx.Provider>
  );
}

function SiteHeader() {
  const { t, prefs, setPrefs } = useApp();
  const { link, siteName, base } = useSite();
  const loc = useLocation();
  const onLanding = loc.pathname.replace(/\/$/, '').toLowerCase() === base;
  const scrolled = useScrolledPast(40);
  return (
    <header className={`tg-header${onLanding ? ' over' : ''}${onLanding && !scrolled ? ' clear' : ''}`}>
      <Link to={link('/')} className="tg-brand" dir="auto">
        {siteName}
      </Link>
      <nav>
        <Link to={link('/posts')}>{t('articles')}</Link>
        <Link to={link('/search')} aria-label={t('search')} className="icon-link">
          <Search size={20} />
        </Link>
        <button
          type="button"
          className="tg-lang"
          onClick={() => setPrefs({ uiLang: prefs.uiLang === 'he' ? 'en' : 'he' })}
          aria-label={prefs.uiLang === 'he' ? 'English' : 'עברית'}
          title={prefs.uiLang === 'he' ? 'English' : 'עברית'}
        >
          <Languages size={18} /> <span>{prefs.uiLang === 'he' ? 'EN' : 'עב'}</span>
        </button>
      </nav>
    </header>
  );
}

function SiteFooter() {
  const { t, user } = useApp();
  const { link, siteName, group } = useSite();
  return (
    <footer className="tg-footer">
      <span dir="auto">
        © {YEAR} {siteName}
      </span>
      <Link to={link('/posts')}>{t('articles')}</Link>
      {/* Only the admin sees this; visitors get no hint of the blog behind the site. */}
      {can.manageTagGroups(user) && group && (
        <Link to={`/admin?tab=sites&edit=${group.id}`} className="tg-edit">
          <Pencil size={14} /> {t('tg_editSite')}
        </Link>
      )}
    </footer>
  );
}

/** The index route of a site: the group's chosen custom landing, or the default one. */
export function Landing() {
  const { t } = useApp();
  const { group } = useSite();
  if (!group) return null;
  const custom = group.landing !== 'default' ? CUSTOM_LANDINGS[group.landing] : undefined;
  if (custom) {
    const C = custom.Component;
    return (
      <Suspense fallback={<p className="loading">{t('loading')}</p>}>
        <C group={group} />
      </Suspense>
    );
  }
  return <DefaultLanding group={group} />;
}
