import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import { OAUTH_LABELS } from '../lib/util';
import type { OAuthProvider } from '../lib/types';
import { usePageTitle } from './usePageTitle';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { t, user } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  usePageTitle(mode === 'login' ? t('login') : t('signup'));

  useEffect(() => {
    if (user) nav(from, { replace: true });
  }, [user, from, nav]);

  useEffect(() => {
    api.oauthProviders().then(setProviders);
  }, []);

  async function oauth(provider: OAuthProvider) {
    setErr('');
    setBusy(true);
    try {
      await api.signInWithOAuth(provider, from);
      // Live site: the browser is now leaving for the provider, so stay busy. Demo: signed in already.
    } catch (e2) {
      setErr(errorText(e2, t));
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await api.signIn(email, password);
      else {
        const r = await api.signUp(email, password, name);
        if (r.needsConfirmation) setInfo(t('checkEmail'));
      }
    } catch (e2) {
      setErr(errorText(e2, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>{mode === 'login' ? t('login') : t('signup')}</h1>
      {info ? (
        <p className="notice">{info}</p>
      ) : (
        <>
          <form className="form" onSubmit={submit}>
            {mode === 'signup' && (
              <label>
                {t('displayName')}
                <input dir="auto" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            <label>
              {mode === 'login' ? t('emailOrAdmin') : t('email')}
              <input
                type={mode === 'login' ? 'text' : 'email'}
                dir="ltr"
                required
                autoComplete={mode === 'login' ? 'username' : 'email'}
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              {t('password')}
              <input
                type="password"
                dir="ltr"
                required
                minLength={mode === 'signup' ? 6 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {err && <p className="error">{err}</p>}
            <button className="btn primary block" disabled={busy}>
              {mode === 'login' ? t('login') : t('signup')}
            </button>
            {mode === 'signup' && <p className="hint">{t('firstAdmin')}</p>}
          </form>
          {providers.length > 0 && (
            <>
              <p className="or-divider">
                <span>{t('orDivider')}</span>
              </p>
              <div className="oauth-buttons">
                {providers.map((p) => (
                  <button key={p} type="button" className={`btn ghost block oauth-${p}`} disabled={busy} onClick={() => oauth(p)}>
                    {t('continueWith')} <bdi dir="ltr">{OAUTH_LABELS[p]}</bdi>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <p className="center">
        {mode === 'login' ? t('noAccount') : t('haveAccount')}{' '}
        <Link to={mode === 'login' ? '/signup' : '/login'} state={loc.state}>
          {mode === 'login' ? t('signup') : t('login')}
        </Link>
      </p>
      <p className="center hint">
        <Link to="/privacy">{t('privacy')}</Link>
      </p>
    </div>
  );
}

export function Logout() {
  const nav = useNavigate();
  useEffect(() => {
    api.signOut().then(() => nav('/', { replace: true }));
  }, [nav]);
  return null;
}
