/**
 * Cloudflare Turnstile ("are you human" check) on the sign-up and sign-in forms, when VITE_TURNSTILE_SITE_KEY is
 * set. Supabase checks the token on its side (Authentication → Attack Protection, README §8.8).
 */
const CONFIGURED_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';

/**
 * Turnstile only runs on the hostnames its widget lists (oded.me), so it's off where it can't work and would only
 * leave the sign-in button waiting: in demo mode (no Supabase, nothing to protect) and on local addresses
 * (localhost, an IP like the dev server opened from a phone, a .local name).
 */
const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[?[\da-f]*:[\da-f:]*\]?|.+\.local)$/i;
const DEMO = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
/** Opt-in for local testing against the live backend: localhost added to the widget's hostnames in Cloudflare. */
const ON_LOCAL = import.meta.env.VITE_TURNSTILE_ON_LOCALHOST === '1';
const LOCAL = LOCAL_HOST.test(location.hostname) && !ON_LOCAL;
export const TURNSTILE_SITE_KEY = CONFIGURED_KEY && !DEMO && !LOCAL ? CONFIGURED_KEY : '';
/**
 * The live backend wants the check (a key is configured), but this is a local address where it's off: Supabase
 * will turn the sign-in away, so the form says why up front.
 */
export const CAPTCHA_OFF_LOCALLY = !!CONFIGURED_KEY && !DEMO && LOCAL;

export interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once; later calls reuse it. */
export function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('auth/captcha')));
    s.onerror = () => {
      loading = null;
      reject(new Error('auth/captcha'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
