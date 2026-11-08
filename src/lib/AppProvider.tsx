import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { Ctx, type Prefs } from './app';
import { DICTS, type TKey } from './i18n';
import { DEFAULT_FONT, ensureFonts, fontStack } from './fonts';
import type { Profile } from './types';

const PREFS_KEY = 'blog.prefs';

// Read before Supabase consumes it: the email-confirmation link lands with its result in the URL hash
// (#access_token=…&type=signup, or #error=…&error_code=otp_expired).
const AUTH_HASH = new URLSearchParams(location.hash.slice(1));
// A failed Google (or other provider) sign-in returns ?error=…&error_description=… (or the same in the hash).
const AUTH_QUERY = new URLSearchParams(location.search);

const DEFAULT_PREFS: Prefs = {
  uiLang: 'he',
  font: DEFAULT_FONT,
  fontSize: 18,
  lineHeight: 1.3,
  theme: 'dark',
};

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    api.currentUser().then((u) => {
      setUser(u);
      setAuthReady(true);
    });
    return api.onAuthChange((u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
    const root = document.documentElement;
    root.lang = prefs.uiLang;
    root.dir = prefs.uiLang === 'he' ? 'rtl' : 'ltr';
    if (prefs.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = prefs.theme;
    ensureFonts([prefs.font]);
    root.style.setProperty('--read-font', fontStack(prefs.font));
    root.style.setProperty('--read-size', `${prefs.fontSize}px`);
    root.style.setProperty('--read-lh', String(prefs.lineHeight));
  }, [prefs]);

  const setPrefs = useCallback((p: Partial<Prefs>) => setPrefsState((cur) => ({ ...cur, ...p })), []);
  const resetPrefs = useCallback(() => setPrefsState((cur) => ({ ...DEFAULT_PREFS, uiLang: cur.uiLang })), []);
  // `t('deletedUsers', { n: 3 })` fills {n} in the text.
  const t = useCallback(
    (k: TKey, vars?: Record<string, string | number>) => {
      const text = DICTS[prefs.uiLang][k] ?? k;
      return vars ? text.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? '')) : text;
    },
    [prefs.uiLang],
  );

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
  }, []);

  useEffect(() => {
    if (AUTH_HASH.get('type') === 'signup' && AUTH_HASH.has('access_token')) toast(DICTS[prefs.uiLang].emailConfirmed);
    else {
      const params = [AUTH_HASH, AUTH_QUERY].find((p) => p.has('error_code') || p.has('error_description'));
      if (params) {
        const d = DICTS[prefs.uiLang];
        const desc = params.get('error_description') ?? '';
        toast(
          params.get('error_code') === 'otp_expired' || /email link|otp/i.test(desc)
            ? d.linkExpired
            : /banned/i.test(desc)
              ? d.accountSuspended
              : d.oauthFailed,
        );
        const q = new URLSearchParams(location.search);
        ['error', 'error_code', 'error_description'].forEach((k) => q.delete(k));
        history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUser = useCallback(async () => setUser(await api.currentUser()), []);

  const value = useMemo(
    () => ({ user, authReady, prefs, setPrefs, resetPrefs, t, toast, toastMsg, refreshUser }),
    [user, authReady, prefs, setPrefs, resetPrefs, t, toast, toastMsg, refreshUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
