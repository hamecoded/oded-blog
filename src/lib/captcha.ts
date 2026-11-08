/**
 * Cloudflare Turnstile ("are you human" check) on the sign-up and sign-in forms, when VITE_TURNSTILE_SITE_KEY is
 * set. Supabase checks the token on its side (Authentication → Attack Protection, README §8.8).
 */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';

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
