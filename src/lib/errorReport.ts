/**
 * Turning a crash into something a person can read (the error page, components/ErrorScreen.tsx) and something a
 * developer can use (the report it copies). Kept apart from the component so the page file only exports components.
 */

export type ErrorKind = 'update' | 'offline' | 'notFound' | 'database' | 'data' | 'bug';

export interface ReadableError {
  kind: ErrorKind;
  /** The error's own name and message, tidied ("TypeError", "Cannot read properties of undefined…"). */
  name: string;
  message: string;
  /** For a missing value: the property the code tried to read ("title"). */
  field?: string;
  /** Where it happened, when that can be told: a source file and line, or the component that was drawing. */
  where?: string;
}

/** Whatever was thrown (an Error, a router error response, a string…) as name + message + stack. */
export function unpack(err: unknown): { name: string; message: string; stack: string; status?: number } {
  if (err instanceof Error) return { name: err.name || 'Error', message: err.message || String(err), stack: err.stack ?? '' };
  if (err && typeof err === 'object') {
    const o = err as { status?: number; statusText?: string; data?: unknown; message?: string; name?: string };
    if (typeof o.status === 'number') {
      const data = typeof o.data === 'string' ? o.data : o.data ? JSON.stringify(o.data) : '';
      return { name: `HTTP ${o.status}`, message: [o.statusText, data].filter(Boolean).join(' · ') || 'Route error', stack: '', status: o.status };
    }
    if (typeof o.message === 'string') return { name: o.name || 'Error', message: o.message, stack: '' };
    try {
      return { name: 'Error', message: JSON.stringify(err), stack: '' };
    } catch {
      /* fall through */
    }
  }
  return { name: 'Error', message: String(err), stack: '' };
}

/** The first frame of our own code in a stack ("TaskSheet.tsx, line 120"), skipping libraries. */
function ownFrame(stack: string, componentStack?: string): string | undefined {
  for (const line of stack.split('\n')) {
    const m = /\/src\/([^?:)\s]+)(?:\?[^:)\s]*)?:(\d+)/.exec(line);
    if (m) return `${m[1].split('/').pop()}:${m[2]}`;
  }
  // A production build has no source paths: name the component that was being drawn instead.
  const c = componentStack && /(?:at |^\s*)([A-Z][\w$]*)/m.exec(componentStack.trim());
  return c ? `<${c[1]}>` : undefined;
}

/** Sorts a crash into a kind the page can explain in plain words. */
export function readError(err: unknown, componentStack?: string): ReadableError {
  const { name, message, stack, status } = unpack(err);
  const text = `${name} ${message}`;
  const base = { name, message, where: ownFrame(stack, componentStack) };
  if (status === 404) return { ...base, kind: 'notFound' };
  if (/dynamically imported module|Importing a module script failed|ChunkLoadError|Loading (?:CSS )?chunk|error loading dynamically/i.test(text))
    return { ...base, kind: 'update' };
  if (/Failed to fetch|NetworkError|Load failed|network request failed|ERR_INTERNET|offline/i.test(text) || (typeof navigator !== 'undefined' && !navigator.onLine))
    return { ...base, kind: 'offline' };
  if (/schema cache|column .* does not exist|relation .* does not exist|PGRST\d+|42P01|42703/i.test(text)) return { ...base, kind: 'database' };
  const missing =
    /reading ['"]([^'"]+)['"]/.exec(message) ?? /evaluating ['"][^'"]*?\.([\w$]+)['"]/.exec(message) ?? /(?:^|\s)([\w$.]+) is (?:undefined|null)/.exec(message);
  if (name === 'TypeError' && missing) return { ...base, kind: 'data', field: missing[1] };
  return { ...base, kind: 'bug' };
}

/** The full technical report the "Copy for the developer" button copies: everything needed to reproduce it. */
export function errorReport(err: unknown, componentStack?: string): string {
  const { name, message, stack } = unpack(err);
  const lines = [
    `Error report · ${location.host}`,
    `Time: ${new Date().toISOString()}`,
    `Page: ${location.href}`,
    `Error: ${name}: ${message}`,
    '',
    'Stack:',
    stack || '(none)',
  ];
  if (componentStack) lines.push('', 'Component stack:', componentStack.trim());
  lines.push(
    '',
    `Browser: ${navigator.userAgent}`,
    `Screen: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x · language ${navigator.language} · ${navigator.onLine ? 'online' : 'offline'}`,
    `Build: ${import.meta.env.MODE}`,
  );
  return lines.join('\n');
}

/**
 * Copies text. The Clipboard API only exists on secure pages (https, localhost); on a phone testing over the
 * Wi-Fi (plain http) a hidden text area and execCommand do it instead.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* try the old way */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;inset-block-start:-1000px;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
