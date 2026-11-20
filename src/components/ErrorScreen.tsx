import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';
import { Bug, Check, ChevronDown, Copy, Heart, House, RefreshCw, RotateCcw } from 'lucide-react';
import { DICTS, type TKey } from '../lib/i18n';
import type { Lang } from '../lib/types';
import { copyText, errorReport, readError } from '../lib/errorReport';

/**
 * The page's language, read straight from the saved preferences: the error page may be drawn outside the app's
 * context (AppProvider itself can be what broke), so it can't use `useApp()`.
 */
function pageLang(): Lang {
  try {
    const v = (JSON.parse(localStorage.getItem('blog.prefs') ?? '{}') as { uiLang?: string }).uiLang;
    if (v === 'en' || v === 'he') return v;
  } catch {
    /* no storage: fall back */
  }
  return document.documentElement.lang === 'en' ? 'en' : 'he';
}

/**
 * What a crash looks like: a game-style "glitch" screen that says in plain words what went wrong and what to do,
 * shows what the browser actually said, and copies a full technical report for the developer. Used by the router
 * (`RouteError`, any page that throws while drawing or loading) and by `AppErrorBoundary` around everything.
 */
export function ErrorScreen({ error, componentStack, onRetry }: { error: unknown; componentStack?: string; onRetry?: () => void }) {
  const lang = pageLang();
  const d = DICTS[lang];
  const t = (k: TKey, vars?: Record<string, string>) => d[k].replace(/\{(\w+)\}/g, (_, v: string) => vars?.[v] ?? '');
  const info = readError(error, componentStack);
  const report = errorReport(error, componentStack);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const reload = () => location.reload();
  const home = () => location.assign(import.meta.env.BASE_URL || '/');
  const primary = info.kind === 'update' || info.kind === 'offline' || !onRetry ? 'reload' : 'retry';

  return (
    <div className="err-screen" dir={lang === 'he' ? 'rtl' : 'ltr'} lang={lang} role="alert">
      <div className="err-card">
        <div className="err-badge" aria-hidden>
          <Bug size={44} strokeWidth={2.2} />
        </div>
        <div className="err-lives" aria-hidden>
          <Heart size={20} className="is-full" />
          <Heart size={20} className="is-full" />
          <Heart size={20} className="is-lost" />
        </div>
        <h1 className="err-title">{t('errTitle')}</h1>
        <p className="err-lives-l">{t('errLives')}</p>

        <p className="err-what">{t(`errWhat_${info.kind}`, { field: info.field ?? '' })}</p>
        <p className="err-fix">{t(`errFix_${info.kind}`)}</p>

        <figure className="err-said">
          <figcaption>{t('errSaid')}</figcaption>
          <blockquote dir="ltr">
            <strong>{info.name}</strong>
            <span>{info.message}</span>
          </blockquote>
          {info.where && (
            <p className="err-where">
              {t('errWhere')} <code dir="ltr">{info.where}</code>
            </p>
          )}
        </figure>

        <div className="err-actions">
          {primary === 'retry' ? (
            <button type="button" className="err-btn is-primary" onClick={onRetry}>
              <RotateCcw size={18} aria-hidden /> {t('errRetry')}
            </button>
          ) : (
            <button type="button" className="err-btn is-primary" onClick={reload}>
              <RefreshCw size={18} aria-hidden /> {t('errReload')}
            </button>
          )}
          {primary === 'retry' && (
            <button type="button" className="err-btn" onClick={reload}>
              <RefreshCw size={18} aria-hidden /> {t('errReload')}
            </button>
          )}
          <button type="button" className="err-btn" onClick={home}>
            <House size={18} aria-hidden /> {t('backHome')}
          </button>
        </div>

        <button
          type="button"
          className={`err-copy${copied === 'ok' ? ' is-done' : ''}`}
          onClick={async () => setCopied((await copyText(report)) ? 'ok' : 'fail')}
        >
          {copied === 'ok' ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied === 'ok' ? t('errCopied') : t('errCopy')}
        </button>
        {copied === 'fail' && <p className="err-copy-fail">{t('errCopyFailed')}</p>}

        <details className="err-details" open={copied === 'fail' || undefined}>
          <summary>
            <ChevronDown size={16} aria-hidden /> {t('errDetails')}
          </summary>
          <pre dir="ltr">{report}</pre>
        </details>
      </div>
    </div>
  );
}

/** The router's error page: whatever a route threw while loading or drawing. Its way back is a reload. */
export function RouteError() {
  return <ErrorScreen error={useRouteError()} />;
}

/**
 * Catches anything that breaks outside the router's reach (the app's own setup, AppProvider): the last line of
 * defence, around everything in main.tsx. "Try again" draws the app once more.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown; stack?: string; failed: boolean }> {
  state = { error: null as unknown, stack: undefined as string | undefined, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? undefined });
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorScreen error={this.state.error} componentStack={this.state.stack} onRetry={() => this.setState({ error: null, stack: undefined, failed: false })} />;
  }
}
