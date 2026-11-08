import { Suspense, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { useApp } from '../lib/app';
import { formatDate, pickText } from '../lib/util';
import { APPS, appTarget, findApp, isNew } from '../apps/registry';
import type { AppEntry } from '../apps/types';
import { NotFound } from './NotFound';
import { usePageTitle } from './usePageTitle';

/** Apps are for signed-in users: the store and every app ask anyone else to sign in. */
function SignInFirst({ from }: { from: string }) {
  const { t } = useApp();
  return (
    <div className="empty">
      <p>{t('appsSignIn')}</p>
      <Link className="btn primary" to="/login" state={{ from }}>
        {t('login')}
      </Link>
    </div>
  );
}

const gradient = (app: AppEntry) =>
  app.colors ? ({ '--app-c1': app.colors[0], '--app-c2': app.colors[1] } as CSSProperties) : undefined;

function AppIcon({ app, size = 'lg' }: { app: AppEntry; size?: 'lg' | 'sm' }) {
  if (typeof app.icon === 'string') {
    return <img className={`app-icon img ${size}`} src={app.icon} alt="" />;
  }
  const Icon = app.icon;
  return (
    <span className={`app-icon ${size}`} style={gradient(app)} aria-hidden>
      <Icon size={size === 'lg' ? 28 : 18} strokeWidth={2} />
    </span>
  );
}

function AppTile({ app }: { app: AppEntry }) {
  const { t, prefs } = useApp();
  const lang = prefs.uiLang;
  const target = appTarget(app);
  const tagline = pickText(app.tagline, lang);
  const category = pickText(app.category, lang);
  const meta = [app.version && `v${app.version}`, app.updated && formatDate(app.updated, lang)].filter(Boolean);

  const body: ReactNode = (
    <>
      <span className="app-cover" style={gradient(app)}>
        {app.image ? (
          <img src={app.image} alt="" loading="lazy" />
        ) : (
          typeof app.icon !== 'string' && (
            <span className="app-cover-mark" aria-hidden>
              <app.icon size={96} strokeWidth={1.25} />
            </span>
          )
        )}
        <span className="app-badges">
          {app.status === 'beta' && <span className="app-badge">{t('appBeta')}</span>}
          {app.status !== 'soon' && isNew(app) && <span className="app-badge new">{t('appNew')}</span>}
        </span>
      </span>
      <span className="app-main">
        <span className="app-head">
          <AppIcon app={app} />
          <span className="app-titles">
            <span className="app-name" dir="auto">
              {pickText(app.name, lang)}
            </span>
            {tagline && (
              <span className="app-tagline" dir="auto">
                {tagline}
              </span>
            )}
          </span>
        </span>
        <span className="app-desc" dir="auto">
          {pickText(app.description, lang)}
        </span>
        {(category || app.tags?.length) && (
          <span className="app-chips">
            {category && <span className="app-chip cat">{category}</span>}
            {app.tags?.map((tag) => (
              <span key={tag} className="app-chip" dir="auto">
                #{tag}
              </span>
            ))}
          </span>
        )}
        <span className="app-foot">
          <span className="app-meta">{meta.join(' · ')}</span>
          {target ? (
            <span className="btn primary sm">
              {t('appOpen')}
              {target.kind === 'external' && <ExternalLink size={14} />}
            </span>
          ) : (
            <span className="badge">{t('appSoon')}</span>
          )}
        </span>
      </span>
    </>
  );

  const cls = `app-tile${app.featured ? ' is-featured' : ''}${target ? '' : ' is-soon'}`;
  if (target?.kind === 'internal') {
    return (
      <Link to={target.to} className={cls}>
        {body}
      </Link>
    );
  }
  if (target?.kind === 'external') {
    return (
      <a href={target.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return (
    <div className={cls} aria-disabled>
      {body}
    </div>
  );
}

/** /apps — the app store, built from every folder in src/apps (see src/apps/README.md). */
export function AppsPage() {
  const { t, user, authReady, prefs } = useApp();
  const [category, setCategory] = useState('');
  usePageTitle(t('apps'));
  if (!authReady) return <p className="loading">{t('loading')}</p>;
  if (!user) return <SignInFirst from="/apps" />;
  const lang = prefs.uiLang;

  const categories = [...new Set(APPS.map((a) => pickText(a.category, lang)).filter(Boolean))];
  const shown = category ? APPS.filter((a) => pickText(a.category, lang) === category) : APPS;

  return (
    <div className="apps">
      <header className="page-head">
        <div>
          <h1>{t('apps')}</h1>
          <p className="muted">{t('appsIntro')}</p>
        </div>
      </header>
      {categories.length > 1 && (
        <div className="app-filter" role="group" aria-label={t('appCategories')}>
          {['', ...categories].map((c) => (
            <button
              key={c || '*'}
              type="button"
              className={`chip${c === category ? ' on' : ''}`}
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
            >
              {c || t('appAll')}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="empty">{t('appsEmpty')}</p>
      ) : (
        <ul className="app-grid">
          {shown.map((app) => (
            <li key={app.id} className={app.featured ? 'is-featured' : undefined}>
              <AppTile app={app} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** /apps/:app — one app, inside the blog's frame with a way back to the store. */
export function AppHostPage() {
  const { app: id } = useParams();
  const { t, user, authReady, prefs } = useApp();
  const app = findApp(id);
  const name = app ? pickText(app.name, prefs.uiLang) : undefined;
  usePageTitle(name);

  if (!authReady) return <p className="loading">{t('loading')}</p>;
  if (!user) return <SignInFirst from={`/apps/${id ?? ''}`} />;
  if (!app?.Component || appTarget(app)?.kind !== 'internal') return <NotFound />;
  const { Component } = app;
  const Back = prefs.uiLang === 'he' ? ArrowRight : ArrowLeft;

  return (
    <div className="app-host">
      <header className="app-host-head">
        <Link to="/apps" className="btn ghost sm">
          <Back size={16} /> {t('apps')}
        </Link>
        <AppIcon app={app} size="sm" />
        <h1 dir="auto">{name}</h1>
      </header>
      <Suspense fallback={<p className="loading">{t('loading')}</p>}>
        <Component />
      </Suspense>
    </div>
  );
}
