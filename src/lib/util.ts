import type { Post, Profile, Role } from './types';

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
