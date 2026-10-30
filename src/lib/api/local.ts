/**
 * Demo backend: everything lives in this browser's IndexedDB.
 * Used automatically when no Supabase keys are configured, so the site runs
 * with zero setup (`npm run dev`) and on any static host for a quick preview.
 */
import type { Api, Comment, Group, LikeInfo, Post, PostDraft, Profile, Role, RoleRequest } from '../types';
import { ADMIN_EMAIL, can, canViewPost, htmlToText, loginEmail, makeExcerpt, normalizeSearch, RESERVED_SLUGS, slugify, uid, USERNAME_RE } from '../util';
import { sanitizeHtml } from '../sanitize';
import { seedPosts, SEED_AUTHOR } from './seed';

interface LocalUser extends Profile {
  email: string;
  pw: string;
}

interface Db {
  users: LocalUser[];
  posts: Post[];
  comments: Comment[];
  likes: { post_id: string; user_id: string }[];
  roleRequests: RoleRequest[];
  groups: Group[];
}

const DB_NAME = 'bilingual-blog';
const SESSION_KEY = 'blog.session';
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: session lasts for this tab only */
  }
}

function publicProfile(u: LocalUser): Profile {
  const { email: _e, pw: _p, suspended: _s, last_sign_in_at: _l, ...rest } = u;
  return rest;
}

function adminProfile(u: LocalUser): Profile {
  const { pw: _p, ...rest } = u;
  return { suspended: false, last_sign_in_at: null, ...rest };
}

function uniqueUsername(d: Db, email: string): string {
  const base = slugify(email.split('@')[0]).replace(/[^a-z0-9-]/g, '') || 'user';
  let username = base;
  for (let i = 2; d.users.some((u) => u.username === username); i++) username = `${base}${i}`;
  return username;
}

/** Prebuilt manager account: sign in as "admin" / "admin", then change the password. */
async function ensureAdmin(d: Db): Promise<boolean> {
  if (d.users.some((u) => u.email === ADMIN_EMAIL)) return false;
  let username = 'admin';
  for (let i = 2; d.users.some((u) => u.username === username); i++) username = `admin${i}`;
  d.users.push({
    id: uid(),
    email: ADMIN_EMAIL,
    pw: await sha256(`${ADMIN_EMAIL}:admin`),
    display_name: 'Admin',
    username,
    role: 'admin',
    created_at: new Date().toISOString(),
    must_change_password: true,
  });
  return true;
}

export function createLocalApi(): Api {
  let cache: Db | null = null;
  let sessionId = readSession();
  const listeners = new Set<(p: Profile | null) => void>();

  async function db(): Promise<Db> {
    if (cache) return cache;
    const stored = await idbGet<Db>('db');
    if (stored) {
      cache = { ...stored, roleRequests: stored.roleRequests ?? [], groups: stored.groups ?? [] };
      if (await ensureAdmin(cache)) await idbSet('db', cache);
    } else {
      const now = Date.now();
      cache = {
        users: [{ ...SEED_AUTHOR, email: '', pw: '' }],
        posts: seedPosts().map((p, i) => {
          const t = new Date(now - (i + 1) * 86400000 * 3).toISOString();
          const text = htmlToText(p.content_html);
          return {
            ...p,
            id: uid(),
            content_text: text,
            excerpt: p.excerpt || makeExcerpt(htmlToText(p.content_html, true)),
            author_id: SEED_AUTHOR.id,
            created_at: t,
            updated_at: t,
            published_at: t,
          };
        }),
        comments: [],
        likes: [],
        roleRequests: [],
        groups: [],
      };
      await ensureAdmin(cache);
      await idbSet('db', cache);
    }
    return cache;
  }

  async function persist() {
    if (cache) await idbSet('db', cache);
  }

  async function me(): Promise<LocalUser | null> {
    if (!sessionId) return null;
    const u = (await db()).users.find((x) => x.id === sessionId) ?? null;
    if (!u || u.suspended) {
      // Deleted or suspended while signed in: end the session.
      sessionId = null;
      writeSession(null);
      return null;
    }
    return u;
  }

  async function requireAdmin(): Promise<LocalUser> {
    const u = await requireMe();
    if (!can.manageUsers(u)) throw new Error('auth/forbidden');
    return u;
  }

  /** A target user other than the acting admin. */
  async function otherUser(userId: string): Promise<{ d: Db; admin: LocalUser; u: LocalUser }> {
    const admin = await requireAdmin();
    if (userId === admin.id) throw new Error('user/self');
    const d = await db();
    const u = d.users.find((x) => x.id === userId && x.email);
    if (!u) throw new Error('user/not-found');
    return { d, admin, u };
  }

  async function requireMe(): Promise<LocalUser> {
    const u = await me();
    if (!u) throw new Error('auth/required');
    return u;
  }

  function visible(d: Db, user: Profile | null, p: Post): boolean {
    const mine = user ? d.groups.filter((g) => g.member_ids.includes(user.id)).map((g) => g.id) : [];
    return canViewPost(user, p, mine);
  }

  async function requireVisible(postId: string, user: Profile | null): Promise<void> {
    const d = await db();
    const p = d.posts.find((x) => x.id === postId);
    if (!p || !visible(d, user, p)) throw new Error('auth/forbidden');
  }

  function withAuthor(d: Db, p: Post): Post {
    const u = d.users.find((x) => x.id === p.author_id);
    return { ...p, author: u ? { display_name: u.display_name, username: u.username } : null };
  }

  function emit(p: Profile | null) {
    listeners.forEach((cb) => cb(p));
  }

  const api: Api = {
    mode: 'local',

    async currentUser() {
      const u = await me();
      return u ? publicProfile(u) : null;
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async signUp(email, password, displayName) {
      const d = await db();
      const e = email.trim().toLowerCase();
      if (d.users.some((u) => u.email === e)) throw new Error('auth/exists');
      const username = uniqueUsername(d, e);
      const user: LocalUser = {
        id: uid(),
        email: e,
        pw: await sha256(`${e}:${password}`),
        display_name: displayName.trim() || username,
        username,
        role: 'reader',
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      };
      d.users.push(user);
      await persist();
      sessionId = user.id;
      writeSession(user.id);
      emit(publicProfile(user));
      return { needsConfirmation: false };
    },

    async signIn(email, password) {
      const d = await db();
      const e = loginEmail(email);
      const hash = await sha256(`${e}:${password}`);
      const u = d.users.find((x) => x.email === e && x.pw === hash);
      if (!u) throw new Error('auth/invalid');
      if (u.suspended) throw new Error('auth/suspended');
      u.last_sign_in_at = new Date().toISOString();
      await persist();
      sessionId = u.id;
      writeSession(u.id);
      emit(publicProfile(u));
    },

    async signOut() {
      sessionId = null;
      writeSession(null);
      emit(null);
    },

    async changePassword(newPassword) {
      const u = await requireMe();
      u.pw = await sha256(`${u.email}:${newPassword}`);
      u.must_change_password = false;
      await persist();
      emit(publicProfile(u));
    },

    async listPosts(q = {}) {
      const d = await db();
      const user = await me();
      const status = q.status ?? 'published';
      let posts = d.posts.filter((p) => {
        if (status !== 'all' && p.status !== status) return false;
        return visible(d, user, p);
      });
      if (q.author) {
        const a = d.users.find((u) => u.username === q.author);
        posts = posts.filter((p) => p.author_id === a?.id);
      }
      if (q.tags?.length) posts = posts.filter((p) => q.tags!.every((t) => p.tags.includes(t)));
      if (q.year) {
        posts = posts.filter((p) => {
          const dt = new Date(p.published_at ?? p.created_at);
          return dt.getFullYear() === q.year && (!q.month || dt.getMonth() + 1 === q.month);
        });
      }
      if (q.q?.trim()) {
        const terms = normalizeSearch(q.q).split(' ');
        posts = posts.filter((p) => {
          const hay = normalizeSearch(`${p.title} ${p.content_text} ${p.tags.join(' ')}`);
          return terms.every((t) => hay.includes(t));
        });
      }
      posts.sort((a, b) => (b.published_at ?? b.updated_at).localeCompare(a.published_at ?? a.updated_at));
      return posts.slice(0, q.limit ?? 100).map((p) => withAuthor(d, p));
    },

    async getPost(slug) {
      const d = await db();
      const user = await me();
      const p = d.posts.find((x) => x.slug === slug);
      if (!p || !visible(d, user, p)) return null;
      return withAuthor(d, p);
    },

    async savePost(draft: PostDraft) {
      const d = await db();
      const user = await requireMe();
      const now = new Date().toISOString();
      const html = sanitizeHtml(draft.content_html);
      const text = htmlToText(html);
      const existing = draft.id ? d.posts.find((p) => p.id === draft.id) : undefined;
      if (existing ? !can.editPost(user, existing) : !can.write(user)) throw new Error('auth/forbidden');

      let slug = slugify(draft.slug || draft.title);
      if (RESERVED_SLUGS.has(slug)) slug = `${slug}-post`;
      const base = slug;
      for (let i = 2; d.posts.some((p) => p.slug === slug && p.id !== existing?.id); i++) slug = `${base}-${i}`;

      const post: Post = {
        id: existing?.id ?? uid(),
        slug,
        title: draft.title.trim(),
        excerpt: draft.excerpt?.trim() || makeExcerpt(htmlToText(html, true)),
        content_html: html,
        content_text: text,
        cover_url: draft.cover_url,
        tags: [...new Set(draft.tags.map((t) => t.trim()).filter(Boolean))],
        lang: draft.lang,
        status: draft.status,
        visibility: draft.visibility ?? 'public',
        allowed_users: draft.visibility === 'restricted' ? [...new Set(draft.allowed_users ?? [])] : [],
        allowed_groups: draft.visibility === 'restricted' ? [...new Set(draft.allowed_groups ?? [])] : [],
        author_id: existing?.author_id ?? user.id,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        published_at: draft.status === 'published' ? (existing?.published_at ?? now) : null,
      };
      if (existing) d.posts[d.posts.indexOf(existing)] = post;
      else d.posts.push(post);
      await persist();
      return withAuthor(d, post);
    },

    async deletePost(id) {
      const d = await db();
      const user = await requireMe();
      const p = d.posts.find((x) => x.id === id);
      if (!p || !can.editPost(user, p)) throw new Error('auth/forbidden');
      d.posts = d.posts.filter((x) => x.id !== id);
      d.comments = d.comments.filter((c) => c.post_id !== id);
      d.likes = d.likes.filter((l) => l.post_id !== id);
      await persist();
    },

    async listTags() {
      const posts = await api.listPosts({ limit: 10000 });
      const counts = new Map<string, number>();
      posts.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    },

    async uploadMedia(file) {
      if (file.size > MAX_MEDIA_BYTES) throw new Error('media/too-large');
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
    },

    async listComments(postId) {
      const d = await db();
      return d.comments
        .filter((c) => c.post_id === postId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => {
          const u = d.users.find((x) => x.id === c.user_id);
          return { ...c, author: u ? { display_name: u.display_name, username: u.username } : null };
        });
    },

    async addComment(c) {
      const d = await db();
      const user = await requireMe();
      if (!can.comment(user)) throw new Error('auth/forbidden');
      await requireVisible(c.post_id, user);
      const comment: Comment = {
        id: uid(),
        post_id: c.post_id,
        user_id: user.id,
        parent_id: c.parent_id ?? null,
        quote: c.quote,
        prefix: c.prefix,
        suffix: c.suffix,
        body: c.body.trim(),
        resolved: false,
        created_at: new Date().toISOString(),
      };
      d.comments.push(comment);
      await persist();
      return { ...comment, author: { display_name: user.display_name, username: user.username } };
    },

    async setCommentResolved(id, resolved) {
      const d = await db();
      const user = await requireMe();
      if (!can.resolve(user)) throw new Error('auth/forbidden');
      const c = d.comments.find((x) => x.id === id);
      if (c) c.resolved = resolved;
      await persist();
    },

    async deleteComment(id) {
      const d = await db();
      const user = await requireMe();
      const c = d.comments.find((x) => x.id === id);
      if (!c || (c.user_id !== user.id && user.role !== 'admin')) throw new Error('auth/forbidden');
      d.comments = d.comments.filter((x) => x.id !== id && x.parent_id !== id);
      await persist();
    },

    async getLikes(postId): Promise<LikeInfo> {
      const d = await db();
      const likes = d.likes.filter((l) => l.post_id === postId);
      return { count: likes.length, liked: !!sessionId && likes.some((l) => l.user_id === sessionId) };
    },

    async toggleLike(postId) {
      const d = await db();
      const user = await requireMe();
      await requireVisible(postId, user);
      const i = d.likes.findIndex((l) => l.post_id === postId && l.user_id === user.id);
      if (i >= 0) d.likes.splice(i, 1);
      else d.likes.push({ post_id: postId, user_id: user.id });
      await persist();
      return api.getLikes(postId);
    },

    async getProfile(username) {
      const u = (await db()).users.find((x) => x.username === username);
      return u ? publicProfile(u) : null;
    },

    async listUsers() {
      await requireAdmin();
      return (await db()).users.filter((u) => u.email).map(adminProfile);
    },

    async createUser(n) {
      await requireAdmin();
      const d = await db();
      const e = n.email.trim().toLowerCase();
      if (d.users.some((u) => u.email === e)) throw new Error('auth/exists');
      const username = uniqueUsername(d, e);
      const user: LocalUser = {
        id: uid(),
        email: e,
        pw: await sha256(`${e}:${n.password}`),
        display_name: n.display_name.trim() || username,
        username,
        role: n.role,
        created_at: new Date().toISOString(),
        must_change_password: true,
        last_sign_in_at: null,
      };
      d.users.push(user);
      await persist();
      return adminProfile(user);
    },

    async updateUser(userId, patch) {
      await requireAdmin();
      const d = await db();
      const u = d.users.find((x) => x.id === userId && x.email);
      if (!u) throw new Error('user/not-found');
      const username = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) throw new Error('user/username-invalid');
      if (d.users.some((x) => x.username === username && x.id !== userId)) throw new Error('user/username-taken');
      u.display_name = patch.display_name.trim() || username;
      u.username = username;
      await persist();
      if (userId === sessionId) emit(publicProfile(u));
    },

    async resetPassword(userId, password) {
      const { u } = await otherUser(userId);
      u.pw = await sha256(`${u.email}:${password}`);
      u.must_change_password = true;
      await persist();
    },

    async setSuspended(userId, suspended) {
      const { u } = await otherUser(userId);
      u.suspended = suspended;
      await persist();
    },

    async deleteUser(userId) {
      const { d, admin } = await otherUser(userId);
      d.posts.forEach((p) => {
        if (p.author_id === userId) p.author_id = admin.id;
        p.allowed_users = (p.allowed_users ?? []).filter((x) => x !== userId);
      });
      d.comments = d.comments.filter((c) => c.user_id !== userId);
      d.likes = d.likes.filter((l) => l.user_id !== userId);
      d.roleRequests = d.roleRequests.filter((r) => r.user_id !== userId);
      d.groups.forEach((g) => {
        g.member_ids = g.member_ids.filter((x) => x !== userId);
        if (g.created_by === userId) g.created_by = null;
      });
      d.users = d.users.filter((u) => u.id !== userId);
      await persist();
    },

    async listPeople() {
      await requireMe();
      return (await db()).users.filter((u) => u.email).map(publicProfile);
    },

    async listGroups() {
      const user = await requireMe();
      const d = await db();
      // Each author sees the groups they created; the admin sees all of them.
      return d.groups
        .filter((g) => user.role === 'admin' || g.created_by === user.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async saveGroup(g) {
      const d = await db();
      const user = await requireMe();
      if (!can.manageGroups(user)) throw new Error('auth/forbidden');
      const existing = g.id ? d.groups.find((x) => x.id === g.id) : undefined;
      if (existing && !can.editGroup(user, existing)) throw new Error('auth/forbidden');
      const group: Group = {
        id: existing?.id ?? uid(),
        name: g.name.trim(),
        description: g.description.trim(),
        member_ids: [...new Set(g.member_ids)],
        created_by: existing ? (existing.created_by ?? null) : user.id,
        created_at: existing?.created_at ?? new Date().toISOString(),
      };
      if (existing) d.groups[d.groups.indexOf(existing)] = group;
      else d.groups.push(group);
      await persist();
      return group;
    },

    async deleteGroup(id) {
      const d = await db();
      const user = await requireMe();
      const group = d.groups.find((g) => g.id === id);
      if (!group || !can.editGroup(user, group)) throw new Error('auth/forbidden');
      d.groups = d.groups.filter((g) => g.id !== id);
      d.posts.forEach((p) => (p.allowed_groups = (p.allowed_groups ?? []).filter((x) => x !== id)));
      await persist();
    },

    async setRole(userId: string, role: Role) {
      const d = await db();
      const user = await requireAdmin();
      if (userId === user.id && role !== 'admin') throw new Error('user/self');
      const u = d.users.find((x) => x.id === userId);
      if (u) u.role = role;
      await persist();
      if (userId === sessionId && u) emit(publicProfile(u));
    },

    async requestRole(role, message) {
      const d = await db();
      const user = await requireMe();
      if (role === user.role) throw new Error('request/same-role');
      if (d.roleRequests.some((r) => r.user_id === user.id && r.status === 'pending')) throw new Error('request/pending');
      d.roleRequests.push({
        id: uid(),
        user_id: user.id,
        requested_role: role,
        message: message.trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
        decided_at: null,
      });
      await persist();
    },

    async listMyRoleRequests() {
      const d = await db();
      const user = await requireMe();
      return d.roleRequests.filter((r) => r.user_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async listRoleRequests() {
      const d = await db();
      if (!can.manageUsers(await requireMe())) throw new Error('auth/forbidden');
      return [...d.roleRequests]
        .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.created_at.localeCompare(a.created_at))
        .map((r) => {
          const u = d.users.find((x) => x.id === r.user_id);
          return { ...r, user: u ? { display_name: u.display_name, username: u.username, role: u.role } : null };
        });
    },

    async decideRoleRequest(id, approve) {
      const d = await db();
      const admin = await requireMe();
      if (!can.manageUsers(admin)) throw new Error('auth/forbidden');
      const r = d.roleRequests.find((x) => x.id === id);
      if (!r || r.status !== 'pending') return;
      r.status = approve ? 'approved' : 'rejected';
      r.decided_at = new Date().toISOString();
      const u = d.users.find((x) => x.id === r.user_id);
      if (approve && u) u.role = r.requested_role;
      await persist();
    },
  };
  return api;
}
