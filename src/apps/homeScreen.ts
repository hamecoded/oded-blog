import { useEffect } from 'react';

/**
 * Home-screen files of an app: `public/<id>-app/` (manifest, icons; made by scripts/app-icons.mjs). The build also
 * writes `apps/<id>.html` with them already in its <head> (scripts/spa-fallback.mjs): phones read those tags when a
 * page loads, so the "Home screen" button opens the app with a fresh page load.
 */
export const homeFiles = (id: string) => `${import.meta.env.BASE_URL}${id}-app/`;

/**
 * While an app is open, the page's manifest, touch icon and home-screen name are the app's own, so "Add to Home
 * Screen" adds the app (full screen, at /apps/<id>) and not the blog. For a page reached inside the blog (no fresh
 * load) this is the best that can be done; the blog's tags are put back when the app closes.
 */
export function useHomeScreenApp(id: string | undefined, name: string | undefined) {
  useEffect(() => {
    if (!id || !name) return;
    const base = homeFiles(id);
    const swap = (selector: string, attr: 'href' | 'content', value: string) => {
      const el = document.querySelector(selector);
      const before = el?.getAttribute(attr);
      el?.setAttribute(attr, value);
      return () => {
        if (el && before != null) el.setAttribute(attr, before);
      };
    };
    const undo = [
      swap('link[rel="manifest"]', 'href', `${base}manifest.webmanifest`),
      swap('link[rel="apple-touch-icon"]', 'href', `${base}icon-180.png`),
      swap('meta[name="apple-mobile-web-app-title"]', 'content', name),
    ];
    return () => undo.forEach((u) => u());
  }, [id, name]);
}

/** The browser's own install prompt (Chrome on Android and desktop), kept from when it was offered. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let offered: InstallPrompt | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offered = e as InstallPrompt;
  });
}
/** Shows the browser's install prompt if it offered one; false when there's none (iPhone, Firefox, Safari). */
export async function promptInstall(): Promise<boolean> {
  if (!offered) return false;
  const p = offered;
  offered = null;
  await p.prompt();
  return (await p.userChoice).outcome === 'accepted';
}
export const canPromptInstall = () => !!offered;

export type HomePlatform = 'ios-safari' | 'ios-chrome' | 'ios-other' | 'android' | 'desktop';
/** Which steps to show: they differ between iPhone browsers (Share is at the bottom in Safari, the top in Chrome). */
export function homePlatform(): HomePlatform {
  const ua = navigator.userAgent;
  const ios = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS/.test(ua) ? 'ios-chrome' : /FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
/** Already opened from the home screen (full screen, no browser bars). */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
