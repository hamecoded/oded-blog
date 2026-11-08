import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import { OAUTH_LABELS } from '../lib/util';
import { TURNSTILE_SITE_KEY } from '../lib/captcha';
import { Turnstile } from '../components/Turnstile';
import type { OAuthProvider } from '../lib/types';
import { usePageTitle } from './usePageTitle';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { t, user, prefs } = useApp();
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
  // Bot defences: the Turnstile token (when configured), a field only bots fill in, and when the form appeared.
  const [captcha, setCaptcha] = useState('');
  const [captchaRound, setCaptchaRound] = useState(0);
  const [captchaDown, setCaptchaDown] = useState(false);
  const [trap, setTrap] = useState('');
  const [openedAt] = useState(() => Date.now());
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
    // A filled-in hidden field, or a form sent within two seconds of appearing: a bot. Pretend it worked.
    if (mode === 'signup' && (trap || Date.now() - openedAt < 2000)) {
      setInfo(t('checkEmail'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await api.signIn(email, password, captcha || undefined);
      else {
        const r = await api.signUp(email, password, name, captcha || undefined);
        if (r.needsConfirmation) setInfo(t('checkEmail'));
      }
    } catch (e2) {
      const m = e2 instanceof Error ? e2.message : '';
      if (m === 'auth/held') setInfo(t('accountHeld'));
      else setErr(errorText(e2, t));
      // Each Turnstile token works once: get a fresh one for the next try.
      setCaptcha('');
      setCaptchaRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  // Wait for the check's token, unless Cloudflare couldn't be reached (Supabase then decides on its own).
  const waitingForCheck = !!TURNSTILE_SITE_KEY && !captcha && !captchaDown;

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
            {mode === 'signup' && (
              // Hidden from people (and from screen readers and the keyboard); bots fill in every field.
              <input
                className="trap-field"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
              />
            )}
            <Turnstile onToken={setCaptcha} onUnavailable={() => setCaptchaDown(true)} resetKey={captchaRound} lang={prefs.uiLang} />
            {err && <p className="error">{err}</p>}
            <button className="btn primary block" disabled={busy || waitingForCheck}>
              {mode === 'login' ? t('login') : t('signup')}
            </button>
            {waitingForCheck && <p className="hint center">{t('humanCheck')}</p>}
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
                    {/* The provider's official mark, from its branding kit (public/brand/<provider>.svg).
                        Hidden if the file isn't there, so the button still reads fine without it. */}
                    <img
                      className="oauth-logo"
                      src={`${import.meta.env.BASE_URL}brand/${p}.svg`}
                      alt=""
                      width={24}
                      height={24}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
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
