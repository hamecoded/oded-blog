import type {
  Bilingual,
  Comment,
  OAuthProvider,
  Possession,
  PossessionDraft,
  Post,
  Profile,
  Role,
  TagGroup,
  TagGroupConfig,
  Todo,
  TodoDraft,
  TodoLogEntry,
  TodoStatus,
  TodoType,
} from './types';

/** Role capabilities. Keep in sync with the RLS policies in supabase/schema.sql. */
export const can = {
  write: (p: Profile | null) => !!p && (p.role === 'admin' || p.role === 'editor'),
  editPost: (p: Profile | null, post: Pick<Post, 'author_id'>) =>
    !!p && (p.role === 'admin' || (p.role === 'editor' && p.id === post.author_id)),
  seeDrafts: (p: Profile | null) => !!p && ['admin', 'editor', 'reviewer'].includes(p.role),
  comment: (p: Profile | null) => !!p && p.role !== 'reader',
  like: (p: Profile | null) => !!p,
  resolve: (p: Profile | null) => !!p && ['admin', 'editor', 'reviewer'].includes(p.role),
  manageUsers: (p: Profile | null) => !!p && p.role === 'admin',
  manageGroups: (p: Profile | null) => !!p && (p.role === 'admin' || p.role === 'editor'),
  editGroup: (p: Profile | null, g: { created_by: string | null }) => !!p && (p.role === 'admin' || g.created_by === p.id),
  export: (p: Profile | null) => !!p && p.role === 'admin',
  /** Apps (/apps): any signed-in user. Each app's data is the user's own ("possessions own" policy in schema.sql). */
  useApps: (p: Profile | null) => !!p && !p.suspended,
  /** Tag groups (sites inside the site). Mirrors the "tag groups" policies in supabase/schema.sql. */
  manageTagGroups: (p: Profile | null) => !!p && p.role === 'admin',
};

/**
 * Who may read a post. Mirrors public.can_view_post() in supabase/schema.sql.
 * groupsOf: ids of the groups the user belongs to.
 */
export function canViewPost(
  user: Profile | null,
  post: Pick<Post, 'author_id' | 'status' | 'visibility' | 'allowed_users' | 'allowed_groups'>,
  groupsOf: string[] = [],
): boolean {
  if (user && (user.role === 'admin' || user.id === post.author_id)) return true;
  if (post.status === 'draft' && !can.seeDrafts(user)) return false;
  const vis = post.visibility ?? 'public';
  if (vis === 'public') return true;
  if (vis === 'private' || !user) return false;
  if (vis === 'members') return true;
  return (post.allowed_users ?? []).includes(user.id) || (post.allowed_groups ?? []).some((g) => groupsOf.includes(g));
}

/** Lowercase letters, digits, - and _; 2–30 characters. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,29}$/;

/** Readable temporary password (no 0/O, 1/l/I). */
export function tempPassword(len = 12): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

export const ROLES: Role[] = ['admin', 'editor', 'reviewer', 'commenter', 'reader'];

/** The prebuilt manager account. Typing just "admin" on the sign-in form maps to this email. */
export const ADMIN_EMAIL = ((import.meta.env.VITE_ADMIN_EMAIL as string | undefined) || 'admin@oded.me').toLowerCase();

export function loginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v === 'admin' ? ADMIN_EMAIL : v;
}

/** Slugs keep Hebrew/any-script letters so URLs stay readable: /posts/שלום-עולם */
export function slugify(title: string): string {
  const s = title
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '') // strip Hebrew niqqud / cantillation
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'post';
}

export const RESERVED_SLUGS = new Set(['new', 'print']);

/** Normalize text for search: case-fold, drop niqqud, collapse spaces. */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlToText(html: string, skipMedia = false): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (skipMedia) doc.querySelectorAll('figure').forEach((f) => f.remove());
  doc.querySelectorAll('[data-type="math"]').forEach((m) => {
    m.textContent = ` ${m.getAttribute('data-latex') ?? ''} `;
  });
  doc.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,figure,pre,br').forEach((el) => el.append(' '));
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function makeExcerpt(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > 120 ? sp : max)}…`;
}

export function hasHebrew(s: string): boolean {
  return /[֐-׿]/.test(s);
}

/**
 * Direction for a post title, from its own text: any Hebrew → right-to-left. Unlike dir="auto" (first strong
 * character only), "React בעברית" or "2026 — סיכום" still align right. Empty → `fallback` (the post language).
 */
export function titleDir(title: string, fallback: 'he' | 'en' = 'he'): 'rtl' | 'ltr' {
  if (!title.trim()) return fallback === 'he' ? 'rtl' : 'ltr';
  return hasHebrew(title) ? 'rtl' : 'ltr';
}

export const OAUTH_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
  github: 'GitHub',
};

/**
 * VITE_OAUTH_PROVIDERS: comma-separated, in display order. Unset → Google only; "none" → email only.
 * Facebook works in code but is off by default: Meta lets a new app go Live only after business verification.
 */
export const OAUTH_PROVIDERS: OAuthProvider[] = (() => {
  const raw = (import.meta.env.VITE_OAUTH_PROVIDERS as string | undefined)?.trim();
  if (!raw) return ['google'];
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((p): p is OAuthProvider => p in OAUTH_LABELS);
})();

export function uid(): string {
  return crypto.randomUUID();
}

export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).length / 200));
}

export function postPath(slug: string, suffix = ''): string {
  return `/posts/${encodeURIComponent(slug)}${suffix}`;
}

export function tagPath(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}`;
}

export function absoluteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${location.origin}${base}${path}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ───── Tag groups ─────

/** Tag-group addresses: /<slug>. Lowercase letters, digits and dashes, 2–40 characters. */
export const SITE_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** First path segments the blog itself uses (or the host serves), so no tag group can take them. Keep in step with tag_groups_slug_check in schema.sql. */
export const RESERVED_SITE_SLUGS = new Set([
  'posts', 'tags', 'authors', 'archive', 'search', 'login', 'signup', 'logout', 'account', 'privacy', 'admin', 'apps',
  'assets', 'brand', 'api', 'auth', 'index', 'static', 'public', '404',
]);

export function validSiteSlug(slug: string): boolean {
  return SITE_SLUG_RE.test(slug) && !RESERVED_SITE_SLUGS.has(slug);
}

const emptyText = (): Bilingual => ({ he: '', en: '' });

export function emptyTagGroupConfig(): TagGroupConfig {
  return {
    name: emptyText(),
    tagline: emptyText(),
    about: emptyText(),
    video_url: '',
    video_heading: emptyText(),
    backgrounds: [],
    cta_title: emptyText(),
    cta_label: emptyText(),
    cta_url: '',
    accent: '#e0a458',
  };
}

/** Fills in fields missing from a stored config (older rows, hand-edited JSON). */
export function normalizeTagGroup(g: TagGroup): TagGroup {
  const base = emptyTagGroupConfig();
  const c = (g.config ?? {}) as Partial<TagGroupConfig>;
  const text = (k: keyof TagGroupConfig) => ({ ...(base[k] as Bilingual), ...((c[k] as Bilingual | undefined) ?? {}) });
  return {
    ...g,
    tags: g.tags ?? [],
    landing: g.landing || 'default',
    config: {
      ...base,
      ...c,
      name: text('name'),
      tagline: text('tagline'),
      about: text('about'),
      video_heading: text('video_heading'),
      cta_title: text('cta_title'),
      cta_label: text('cta_label'),
      backgrounds: Array.isArray(c.backgrounds) ? c.backgrounds.filter(Boolean) : [],
    },
  };
}

/** The text in `lang`, else in the other language. */
export function pickText(b: Bilingual | undefined, lang: 'he' | 'en'): string {
  if (!b) return '';
  return (b[lang] || b[lang === 'he' ? 'en' : 'he'] || '').trim();
}

/**
 * Whether a post belongs to a tag group's site: published and carrying one of its tags. Who may read it is
 * decided as everywhere else (canViewPost / row-level security): the API returns only what the viewer may
 * see, so a signed-in reader also gets the members-only and restricted posts that are open to them.
 */
export function inTagGroup(post: Pick<Post, 'tags' | 'status'>, group: Pick<TagGroup, 'tags'>): boolean {
  return post.status === 'published' && post.tags.some((t) => group.tags.includes(t));
}

/** The part of a tag group's site that anonymous visitors see (and can comment on and like): its public posts. */
export function publicInTagGroup(post: Pick<Post, 'tags' | 'status' | 'visibility'>, group: Pick<TagGroup, 'tags'>): boolean {
  return inTagGroup(post, group) && (post.visibility ?? 'public') === 'public';
}

/**
 * A picture for a post card: its cover, else the first image in it, else its first YouTube video's thumbnail.
 * Same order as the social previews in scripts/prerender.mjs.
 */
export function postImage(post: Pick<Post, 'cover_url' | 'content_html'>): string | null {
  if (post.cover_url) return post.cover_url;
  const html = post.content_html ?? '';
  const img = html.match(/<img[^>]+src="([^"]+)"/i)?.[1];
  if (img) return img.replace(/&amp;/g, '&');
  const yt = html.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/)?.[1];
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null;
}

/** Who wrote a comment: the account's name, or the name a visitor typed. */
export function commentAuthorName(c: Pick<Comment, 'author' | 'guest_name'>): string {
  return c.author?.display_name ?? c.guest_name ?? '—';
}

const VISITOR_KEY = 'blog.visitor';
let memoryVisitor: string | null = null;

/** A random secret that stands for this browser, so a visitor can like (and unlike) without an account. */
export function visitorSecret(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = `${uid()}${uid()}`.replace(/-/g, '');
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    memoryVisitor ??= `${uid()}${uid()}`.replace(/-/g, '');
    return memoryVisitor;
  }
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const GUEST_NAME_KEY = 'blog.guestName';

/** The name a visitor last commented under, to prefill the next comment. */
export function savedGuestName(): string {
  try {
    return localStorage.getItem(GUEST_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveGuestName(name: string) {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name);
  } catch {
    /* storage unavailable */
  }
}

const clip = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);
const numOrNull = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/**
 * The editable fields of a possession, trimmed and with defaults, as both backends store them. `base` is the
 * existing row when updating, so fields missing from the draft keep their values.
 */
export function possessionFields(d: PossessionDraft, base?: Possession) {
  const pick = <K extends keyof PossessionDraft>(k: K) => (k in d ? d[k] : base?.[k as keyof Possession]);
  const extra: Record<string, string> = {};
  Object.entries((pick('extra') as Record<string, string> | undefined) ?? {}).forEach(([k, v]) => {
    const key = clip(k, 60);
    if (key) extra[key] = clip(v, 2000);
  });
  const date = clip(pick('date_purchased'), 10);
  const qty = numOrNull(pick('quantity'));
  return {
    item_type: clip(pick('item_type'), 80),
    category: clip(pick('category'), 80),
    title: clip(pick('title'), 300),
    maker: clip(pick('maker'), 200),
    description: clip(pick('description'), 4000),
    quantity: qty === null ? 1 : qty,
    value: numOrNull(pick('value')),
    cost: numOrNull(pick('cost')),
    date_purchased: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    location: clip(pick('location'), 200),
    condition: clip(pick('condition'), 120),
    notes: clip(pick('notes'), 4000),
    image_url: (pick('image_url') as string | null | undefined) || null,
    // New rows go last: the time in ms, so later rows sort after earlier ones until someone drags them.
    position: numOrNull(pick('position')) ?? Date.now(),
    extra,
  };
}

export const TODO_STATUSES: TodoStatus[] = ['discovered', 'researched', 'defined', 'blocked', 'onhold', 'inprogress', 'completed', 'quit'];
export const TODO_TYPES: TodoType[] = [
  'achieving',
  'learning',
  'understanding',
  'decisions',
  'checking',
  'opportunities',
  'enrichments',
  'planning',
];
const LOG_KINDS = ['created', 'status', 'day', 'note'] as const;

/** An array of small objects from a jsonb column: each one's string fields clipped, empty ones dropped, at most `max` (the newest). */
function records<T>(v: unknown, max: number, make: (o: Record<string, unknown>) => T | null): T[] {
  const out = (Array.isArray(v) ? v : [])
    .map((x) => (x && typeof x === 'object' ? make(x as Record<string, unknown>) : null))
    .filter((x): x is T => x !== null);
  return out.slice(-max);
}
const stamp = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString());
/** Statuses from the app's first draft, read as their nearest new ones. */
const OLD_TODO_STATUS: Record<string, TodoStatus> = { todo: 'defined', doing: 'inprogress', waiting: 'onhold', done: 'completed', dropped: 'quit' };

/** Tags and list names: trimmed, no leading # or @, no repeats (ignoring case), at most 30 of 60 characters. */
export function cleanLabels(v: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  (Array.isArray(v) ? v : []).forEach((x) => {
    const s = String(x ?? '').replace(/^[#@]+/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  });
  return out.slice(0, 30);
}

/** A to-do draft cleaned up for saving, on top of `base` (the stored row) when updating. Both backends use it. */
export function todoFields(d: TodoDraft, base?: Todo) {
  const pick = <K extends keyof TodoDraft>(k: K) => (k in d ? d[k] : base?.[k as keyof Todo]);
  const level = (k: 'priority' | 'urgency' | 'complexity', max: number) => {
    const n = Math.round(Number(pick(k) ?? 0));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  };
  const date = (k: 'due_date' | 'estimate_date' | 'deadline' | 'remind_on' | 'day') => {
    const v = clip(pick(k), 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const ref = (k: 'root_id' | 'prev_id' | 'next_id') => (pick(k) as string | null | undefined) || null;
  const raw = String(pick('status') ?? '');
  const status: TodoStatus = TODO_STATUSES.includes(raw as TodoStatus) ? (raw as TodoStatus) : (OLD_TODO_STATUS[raw] ?? 'discovered');
  const ty = pick('type') as TodoType | undefined;
  const deps = [...new Set(((pick('depends_on') as string[] | undefined) ?? []).filter((x) => typeof x === 'string' && x))];
  return {
    title: clip(pick('title'), 300),
    description: clip(pick('description'), 4000),
    type: ty && TODO_TYPES.includes(ty) ? ty : ('achieving' as TodoType),
    status,
    priority: level('priority', 3),
    urgency: level('urgency', 3),
    complexity: level('complexity', 5),
    due_date: date('due_date'),
    estimate_date: date('estimate_date'),
    deadline: date('deadline'),
    remind_on: date('remind_on'),
    day: date('day'),
    tags: cleanLabels(pick('tags')),
    lists: cleanLabels(pick('lists')),
    depends_on: deps.slice(0, 50),
    root_id: ref('root_id'),
    prev_id: ref('prev_id'),
    next_id: ref('next_id'),
    position: numOrNull(pick('position')) ?? Date.now(),
    // Stamped when it's completed, cleared when it's reopened.
    done_at: status === 'completed' ? (pick('done_at') as string | null | undefined) || new Date().toISOString() : null,
    data: records(pick('data'), 50, (o) => {
      const key = clip(o.key, 80).trim();
      const value = clip(o.value, 2000);
      return key || value.trim() ? { key, value } : null;
    }),
    contacts: records(pick('contacts'), 30, (o) => {
      const c = { name: clip(o.name, 120).trim(), phone: clip(o.phone, 40).trim(), email: clip(o.email, 200).trim(), note: clip(o.note, 500) };
      return c.name || c.phone || c.email ? c : null;
    }),
    comments: records(pick('comments'), 200, (o) => {
      const text = clip(o.text, 4000).trim();
      return text ? { at: stamp(o.at), text } : null;
    }),
    log: records(pick('log'), 300, (o) => {
      const kind = LOG_KINDS.find((k) => k === o.kind);
      if (!kind) return null;
      const e: TodoLogEntry = { at: stamp(o.at), kind };
      if ('from' in o) e.from = o.from == null ? null : clip(o.from, 20);
      if ('to' in o) e.to = o.to == null ? null : clip(o.to, 20);
      if (o.text) e.text = clip(o.text, 2000);
      return kind === 'note' && !e.text?.trim() ? null : e;
    }),
  };
}

/**
 * True when a name looks machine-made, like "cdBcejzKTYXUYQrtNTbE": one long run of Latin letters (10+) with
 * few vowels, long consonant clusters and capitals scattered inside. Real names, Hebrew names, spaced names,
 * camelCase and ordinary e-mail names don't match. Mirrors public.looks_machine_made() in supabase/schema.sql,
 * which holds such sign-ups for the admin; keep the two in step.
 */
export function looksMachineMade(text: string | null | undefined): boolean {
  for (const w of (text ?? '').split(/[\s._+-]+/)) {
    if (w.length < 10 || !/^[A-Za-z0-9]+$/.test(w)) continue;
    const letters = w.replace(/[^A-Za-z]/g, '').length;
    const vowels = w.replace(/[^AEIOUaeiou]/g, '').length;
    const switches = (w.match(/[a-z](?=[A-Z])/g) ?? []).length;
    const run = Math.max(0, ...(w.match(/[B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z]+/g) ?? []).map((m) => m.length));
    const score = (letters > 0 && vowels / letters < 0.25 ? 1 : 0) + (switches >= 3 ? 1 : 0) + (run >= 5 ? 1 : 0);
    if (score >= 2 && (switches >= 3 || w.length >= 14)) return true;
  }
  return false;
}

/**
 * An account that needs the admin's look: held at sign-up, or (older accounts) a machine-made name or e-mail.
 * Never one the admin has approved.
 */
export function needsReview(p: Pick<Profile, 'display_name' | 'username' | 'email' | 'review_reason'>): boolean {
  if (p.review_reason === 'approved') return false;
  return !!p.review_reason || looksMachineMade(p.display_name) || looksMachineMade(p.email?.split('@')[0]);
}
