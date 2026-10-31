import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { DICTS, type TKey } from './i18n';
import { DEFAULT_FONT, ensureFonts, fontStack } from './fonts';
import type { Lang, Profile } from './types';

export interface Prefs {
  uiLang: Lang;
  font: string;
  fontSize: number;
  lineHeight: number;
  theme: 'auto' | 'light' | 'dark';
}

const PREFS_KEY = 'blog.prefs';

// Read before Supabase consumes it: the email-confirmation link lands with its result in the URL hash
// (#access_token=…&type=signup, or #error=…&error_code=otp_expired).
const AUTH_HASH = new URLSearchParams(location.hash.slice(1));

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

interface AppCtx {
  user: Profile | null;
  authReady: boolean;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  resetPrefs: () => void;
  t: (k: TKey) => string;
  toast: (msg: string) => void;
  toastMsg: string | null;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

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
  const t = useCallback((k: TKey) => DICTS[prefs.uiLang][k] ?? k, [prefs.uiLang]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
  }, []);

  useEffect(() => {
    if (AUTH_HASH.get('type') === 'signup' && AUTH_HASH.has('access_token')) toast(DICTS[prefs.uiLang].emailConfirmed);
    else if (AUTH_HASH.has('error_code') || AUTH_HASH.has('error_description')) {
      toast(DICTS[prefs.uiLang].linkExpired);
      history.replaceState(null, '', location.pathname + location.search);
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

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

/** Map API error codes to translated messages. */
export function errorText(e: unknown, t: AppCtx['t']): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === 'auth/invalid') return t('invalidLogin');
  if (/auth\/exists|already registered/i.test(m)) return t('accountExists');
  if (m === 'auth/forbidden' || /row-level security|permission/i.test(m)) return t('forbidden');
  if (m === 'auth/required') return t('loginToComment');
  if (m === 'media/too-large') return t('ed_tooLarge');
  if (m === 'request/pending') return t('requestPending');
  if (m === 'auth/suspended') return t('accountSuspended');
  if (/user\/self/.test(m)) return t('notOnYourself');
  if (m === 'user/username-taken') return t('usernameTaken');
  if (m === 'user/username-invalid') return t('usernameInvalid');
  if (/youtubeSignupRequired/.test(m)) return t('yt_noChannel');
  if (/^(youtube\/(denied|popup_closed)|access_denied)$/.test(m)) return t('yt_denied');
  if (/quotaExceeded|uploadLimitExceeded/.test(m)) return t('yt_quota');
  return `${t('error')}: ${m}`;
}
