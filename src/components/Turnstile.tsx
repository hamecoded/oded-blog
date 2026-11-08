import { useEffect, useRef } from 'react';
import { loadTurnstile, TURNSTILE_SITE_KEY } from '../lib/captcha';

/**
 * The Cloudflare Turnstile check. Usually invisible ("interaction-only"): it shows a box only when Cloudflare
 * wants a click. Calls onToken with a one-time token ('' when it expires or fails). Change `resetKey` after a
 * failed sign-in to get a fresh token (each token works once). onUnavailable: Cloudflare's script couldn't load
 * (blocked, offline), so the form shouldn't wait for a token that will never come.
 */
export function Turnstile({
  onToken,
  onUnavailable,
  resetKey,
  lang,
}: {
  onToken: (token: string) => void;
  onUnavailable: () => void;
  resetKey: number;
  lang: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const unavailable = useRef(onUnavailable);
  useEffect(() => {
    callback.current = onToken;
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let id: string | null = null;
    let gone = false;
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return;
        id = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: 'auto',
          language: lang,
          callback: (t: string) => callback.current(t),
          'expired-callback': () => callback.current(''),
          'error-callback': () => callback.current(''),
        });
      })
      .catch(() => unavailable.current());
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [resetKey, lang]);

  return TURNSTILE_SITE_KEY ? <div ref={box} className="turnstile" /> : null;
}
