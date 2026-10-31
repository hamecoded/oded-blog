import { createContext, useContext } from 'react';
import type { TKey } from './i18n';
import type { Lang, Profile } from './types';

// The provider component lives in AppProvider.tsx; this file holds only the context, hook and helpers,
// so React Fast Refresh keeps working (a file should export either components or non-components).

export interface Prefs {
  uiLang: Lang;
  font: string;
  fontSize: number;
  lineHeight: number;
  theme: 'auto' | 'light' | 'dark';
}

export interface AppCtx {
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

export const Ctx = createContext<AppCtx | null>(null);

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
