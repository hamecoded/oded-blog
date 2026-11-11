import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Api,
  Comment,
  Group,
  OAuthProvider,
  Possession,
  Post,
  PostDraft,
  Profile,
  RoleRequest,
  TagGroup,
  Todo,
} from '../types';
import {
  emptyTagGroupConfig,
  htmlToText,
  loginEmail,
  makeExcerpt,
  normalizeTagGroup,
  OAUTH_PROVIDERS,
  possessionFields,
  RESERVED_SLUGS,
  sha256Hex,
  slugify,
  todoFields,
  uid,
  USERNAME_RE,
  validSiteSlug,
  visitorSecret,
} from '../util';
import { sanitizeHtml } from '../sanitize';

const POST_SELECT = '*, author:profiles!posts_author_id_fkey(display_name, username)';
/** Lists also carry the like count (PostgREST embedded counts; the "likes read" policies apply). */
const POST_LIST_SELECT = `${POST_SELECT}, likes(count), guest_likes(count)`;
/** Before schema.sql has been re-run there is no guest_likes table; fall back so the blog keeps working. */
const POST_LIST_SELECT_OLD = `${POST_SELECT}, likes(count)`;
const COMMENT_SELECT = '*, author:profiles!comments_user_id_fkey(display_name, username)';
const BUCKET = 'media';
const REQUEST_SELECT = '*, user:profiles!role_requests_user_id_fkey(display_name, username, role)';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseApi(url: string, key: string): Api {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let profileCache: Profile | null = null;
  let guestLikesTable = true;
  let providersPromise: Promise<OAuthProvider[]> | null = null;

  async function loadProfile(userId: string | undefined): Promise<Profile | null> {
    if (!userId) return (profileCache = null);
    const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    // Suspended or on hold: a session may still exist (issued before the hold); end it.
    if ((data as Profile | null)?.suspended) {
      await sb.auth.signOut();
      return (profileCache = null);
    }
    return (profileCache = (data as Profile) ?? null);
  }

  async function uniqueSlug(title: string, slug: string | undefined, id?: string): Promise<string> {
    let s = slugify(slug || title);
    if (RESERVED_SLUGS.has(s)) s = `${s}-post`;
    const rows = check(await sb.from('posts').select('id, slug').like('slug', `${s}%`)) as { id: string; slug: string }[];
    const taken = new Set(rows.filter((r) => r.id !== id).map((r) => r.slug));
    let out = s;
    for (let i = 2; taken.has(out); i++) out = `${s}-${i}`;
    return out;
  }

  const api: Api = {
    mode: 'supabase',

    async currentUser() {
      const { data } = await sb.auth.getSession();
      return loadProfile(data.session?.user.id);
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_evt, session) => {
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => loadProfile(session?.user.id).then(cb), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp(email, password, displayName, captchaToken) {
      const res = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}`,
          captchaToken,
        },
      });
      if (res.error) throw new Error(/captcha/i.test(res.error.message) ? 'auth/captcha' : res.error.message);
      // A machine-made looking name is created on hold by the database (handle_new_user in schema.sql).
      const uid = res.data.user?.id;
      if (uid) {
        const { data } = await sb.from('profiles').select('suspended').eq('id', uid).maybeSingle();
        if (data?.suspended) {
          if (res.data.session) await sb.auth.signOut();
          throw new Error('auth/held');
        }
      }
      return { needsConfirmation: !res.data.session };
    },

    async signIn(email, password, captchaToken) {
      const res = await sb.auth.signInWithPassword({ email: loginEmail(email), password, options: { captchaToken } });
      if (res.error && /captcha/i.test(res.error.message)) throw new Error('auth/captcha');
      if (res.error) throw new Error(/banned/i.test(res.error.message) ? 'auth/suspended' : 'auth/invalid');
    },

    oauthProviders() {
      // A provider that isn't switched on in Supabase sends people to a raw JSON error page, so only show
      // buttons for those its public settings report as enabled. Checked once per page load.
      providersPromise ??= fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: key } })
        .then((r) => (r.ok ? r.json() : { external: {} }))
        .then((s: { external?: Record<string, boolean> }) => OAUTH_PROVIDERS.filter((p) => s.external?.[p]))
        .catch(() => []);
      return providersPromise;
    },

    async signInWithOAuth(provider, returnTo) {
      // Back to the page the visitor came from. Supabase only honours redirect URLs on its allow list
      // (Authentication → URL Configuration); anything else falls back to the Site URL, which is fine too.
      const res = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${location.origin}${import.meta.env.BASE_URL}${returnTo.replace(/^\//, '')}` },
      });
      if (res.error) throw new Error(res.error.message);
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async changePassword(newPassword) {
      const res = await sb.auth.updateUser({ password: newPassword });
      if (res.error) throw new Error(res.error.message);
      if (res.data.user) {
        check(await sb.from('profiles').update({ must_change_password: false }).eq('id', res.data.user.id));
        await loadProfile(res.data.user.id);
      }
    },

    async listPosts(q = {}) {
      if (q.anyTags && !q.anyTags.length) return [];
      const tags = q.tags ?? [];
      const select = guestLikesTable ? POST_LIST_SELECT : POST_LIST_SELECT_OLD;
      let query = q.q?.trim()
        ? sb.rpc('search_posts', { q: q.q.trim(), tag_list: tags }).select(select)
        : sb.from('posts').select(select);
      if (!q.q?.trim() && tags.length) query = query.contains('tags', tags);
      if (q.anyTags) query = query.overlaps('tags', q.anyTags);
      const status = q.status ?? 'published';
      if (status !== 'all') query = query.eq('status', status);
      if (q.author) {
        const p = await api.getProfile(q.author);
        if (!p) return [];
        query = query.eq('author_id', p.id);
      }
      if (q.year) {
        const from = new Date(Date.UTC(q.year, (q.month ?? 1) - 1, 1));
        const to = q.month ? new Date(Date.UTC(q.year, q.month, 1)) : new Date(Date.UTC(q.year + 1, 0, 1));
        query = query.gte('published_at', from.toISOString()).lt('published_at', to.toISOString());
      }
      const res = await query
        // Published posts newest first, then drafts (no published_at) by last edit.
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(q.limit ?? 100);
      if (res.error && guestLikesTable && /guest_likes/.test(res.error.message)) {
        guestLikesTable = false;
        return api.listPosts(q);
      }
      const rows = check(res) as unknown as (Post & { likes?: { count: number }[]; guest_likes?: { count: number }[] })[];
      return rows.map(({ likes, guest_likes, ...p }) => ({
        ...p,
        like_count: (likes?.[0]?.count ?? 0) + (guest_likes?.[0]?.count ?? 0),
      }));
    },

    async getPost(slug) {
      const res = await sb.from('posts').select(POST_SELECT).eq('slug', slug).maybeSingle();
      return (check(res) as unknown as Post) ?? null;
    },

    async savePost(draft: PostDraft) {
      const user = profileCache ?? (await api.currentUser());
      if (!user) throw new Error('auth/required');
      const html = sanitizeHtml(draft.content_html);
      const text = htmlToText(html);
      const row = {
        slug: await uniqueSlug(draft.title, draft.slug, draft.id),
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
      };
      const res = draft.id
        ? await sb.from('posts').update(row).eq('id', draft.id).select(POST_SELECT).single()
        : await sb.from('posts').insert({ ...row, author_id: user.id }).select(POST_SELECT).single();
      return check(res) as unknown as Post;
    },

    async deletePost(id) {
      check(await sb.from('posts').delete().eq('id', id));
    },

    async listTags() {
      return check(await sb.rpc('tag_counts')) as { tag: string; count: number }[];
    },

    async uploadMedia(file) {
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      const path = `${new Date().toISOString().slice(0, 7)}/${uid()}.${ext}`;
      const res = await sb.storage.from(BUCKET).upload(path, file, {
        cacheControl: '31536000',
        contentType: file.type || undefined,
      });
      if (res.error) throw new Error(res.error.message);
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },

    async listComments(postId) {
      const res = await sb.from('comments').select(COMMENT_SELECT).eq('post_id', postId).order('created_at');
      return check(res) as unknown as Comment[];
    },

    async addComment({ guest_name, ...c }) {
      const user = profileCache ?? (await api.currentUser());
      if (!user) {
        // A visitor on a tag-group site; the "comments insert guest" policy decides where that's allowed.
        const name = (guest_name ?? '').trim();
        if (!name || name.length > 60) throw new Error('comment/name-required');
        const res = await sb
          .from('comments')
          .insert({ ...c, parent_id: c.parent_id ?? null, user_id: null, guest_name: name })
          .select(COMMENT_SELECT)
          .single();
        return check(res) as unknown as Comment;
      }
      const res = await sb
        .from('comments')
        .insert({ ...c, parent_id: c.parent_id ?? null, user_id: user.id })
        .select(COMMENT_SELECT)
        .single();
      return check(res) as unknown as Comment;
    },

    async setCommentResolved(id, resolved) {
      check(await sb.from('comments').update({ resolved }).eq('id', id));
    },

    async deleteComment(id) {
      check(await sb.from('comments').delete().eq('id', id));
    },

    async getLikes(postId) {
      const res = await sb.from('likes').select('user_id', { count: 'exact', head: true }).eq('post_id', postId);
      let guests = 0;
      if (guestLikesTable) {
        const g = await sb.from('guest_likes').select('post_id', { count: 'exact', head: true }).eq('post_id', postId);
        if (g.error) guestLikesTable = false;
        else guests = g.count ?? 0;
      }
      const me = profileCache;
      let liked = false;
      if (me) {
        const mine = await sb.from('likes').select('user_id').eq('post_id', postId).eq('user_id', me.id).maybeSingle();
        liked = !!mine.data;
      } else if (guestLikesTable) {
        // Stored as a hash, so the public list of likes doesn't reveal anyone's secret.
        const hash = await sha256Hex(visitorSecret());
        const mine = await sb.from('guest_likes').select('post_id').eq('post_id', postId).eq('visitor_hash', hash).maybeSingle();
        liked = !!mine.data;
      }
      return { count: (res.count ?? 0) + guests, liked };
    },

    async toggleLike(postId) {
      const me = profileCache ?? (await api.currentUser());
      if (!me) {
        // Visitor on a tag-group site: guest_toggle_like() checks the post and stores the hash of the secret.
        check(await sb.rpc('guest_toggle_like', { p_post: postId, p_secret: visitorSecret() }));
        return api.getLikes(postId);
      }
      const cur = await api.getLikes(postId);
      if (cur.liked) check(await sb.from('likes').delete().eq('post_id', postId).eq('user_id', me.id));
      else check(await sb.from('likes').insert({ post_id: postId, user_id: me.id }));
      return api.getLikes(postId);
    },

    async getProfile(username) {
      const res = await sb.from('profiles').select('*').eq('username', username).maybeSingle();
      return (check(res) as Profile) ?? null;
    },

    async listUsers() {
      return check(await sb.rpc('admin_list_users')) as Profile[];
    },

    async setRole(userId, role) {
      check(await sb.from('profiles').update({ role }).eq('id', userId));
    },

    async createUser(n) {
      const id = check(
        await sb.rpc('admin_create_user', {
          p_email: n.email.trim().toLowerCase(),
          p_password: n.password,
          p_display_name: n.display_name.trim(),
          p_role: n.role,
        }),
      ) as string;
      const users = await api.listUsers();
      const created = users.find((u) => u.id === id);
      if (!created) throw new Error('user/not-found');
      return created;
    },

    async updateUser(userId, patch) {
      const username = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) throw new Error('user/username-invalid');
      const res = await sb
        .from('profiles')
        .update({ display_name: patch.display_name.trim() || username, username })
        .eq('id', userId);
      if (res.error) throw new Error(res.error.code === '23505' ? 'user/username-taken' : res.error.message);
      if (userId === profileCache?.id) await loadProfile(userId);
    },

    async resetPassword(userId, password) {
      check(await sb.rpc('admin_set_password', { p_user: userId, p_password: password }));
    },

    async setSuspended(userId, suspended) {
      check(await sb.rpc('admin_set_suspended', { p_user: userId, p_suspended: suspended }));
    },

    async deleteUser(userId) {
      check(await sb.rpc('admin_delete_user', { p_user: userId }));
    },

    async listPeople() {
      const res = await sb.from('profiles').select('id, display_name, username, role, created_at').order('display_name');
      return check(res) as Profile[];
    },

    async listGroups() {
      const res = await sb.from('groups').select('*, group_members(user_id)').order('name');
      const rows = check(res) as unknown as (Omit<Group, 'member_ids'> & { group_members: { user_id: string }[] })[];
      return rows.map(({ group_members, ...g }) => ({ ...g, member_ids: group_members.map((m) => m.user_id) }));
    },

    async saveGroup(g) {
      const row = { name: g.name.trim(), description: g.description.trim() };
      const saved = check(
        g.id
          ? await sb.from('groups').update(row).eq('id', g.id).select().single()
          : await sb.from('groups').insert(row).select().single(),
      ) as Omit<Group, 'member_ids'>;
      check(await sb.from('group_members').delete().eq('group_id', saved.id));
      const members = [...new Set(g.member_ids)];
      if (members.length) check(await sb.from('group_members').insert(members.map((user_id) => ({ group_id: saved.id, user_id }))));
      return { ...saved, member_ids: members };
    },

    async deleteGroup(id) {
      check(await sb.from('groups').delete().eq('id', id));
    },

    async listTagGroups() {
      const res = await sb.from('tag_groups').select('*').order('slug');
      return (check(res) as TagGroup[]).map(normalizeTagGroup);
    },

    async getTagGroup(slug) {
      const res = await sb.from('tag_groups').select('*').eq('slug', slug).maybeSingle();
      if (res.error) return null; // e.g. schema.sql not re-run yet: behave like an unknown address
      return res.data ? normalizeTagGroup(res.data as TagGroup) : null;
    },

    async saveTagGroup(g) {
      const slug = g.slug.trim().toLowerCase();
      if (!validSiteSlug(slug)) throw new Error('tagGroup/slug-invalid');
      const row = {
        slug,
        tags: [...new Set(g.tags.map((t) => t.trim()).filter(Boolean))],
        landing: g.landing || 'default',
        config: { ...emptyTagGroupConfig(), ...g.config },
      };
      const res = g.id
        ? await sb.from('tag_groups').update(row).eq('id', g.id).select().single()
        : await sb.from('tag_groups').insert(row).select().single();
      if (res.error) throw new Error(res.error.code === '23505' ? 'tagGroup/slug-taken' : res.error.message);
      return normalizeTagGroup(res.data as TagGroup);
    },

    async deleteTagGroup(id) {
      check(await sb.from('tag_groups').delete().eq('id', id));
    },

    async requestRole(role, message) {
      const me = profileCache ?? (await api.currentUser());
      if (!me) throw new Error('auth/required');
      const res = await sb.from('role_requests').insert({ user_id: me.id, requested_role: role, message: message.trim() });
      if (res.error) throw new Error(res.error.code === '23505' ? 'request/pending' : res.error.message);
    },

    async listMyRoleRequests() {
      const me = profileCache ?? (await api.currentUser());
      if (!me) return [];
      const res = await sb.from('role_requests').select('*').eq('user_id', me.id).order('created_at', { ascending: false });
      return check(res) as RoleRequest[];
    },

    async listRoleRequests() {
      const res = await sb.from('role_requests').select(REQUEST_SELECT).order('created_at', { ascending: false }).limit(200);
      const rows = check(res) as unknown as RoleRequest[];
      return rows.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
    },

    async decideRoleRequest(id, approve) {
      check(await sb.rpc('decide_role_request', { req_id: id, approve }));
    },

    // Possessions: row-level security ("possessions own") limits every query to the signed-in user's rows.
    async listPossessions() {
      const res = await sb.from('possessions').select('*').order('item_type').order('position');
      // Table or column missing: schema.sql hasn't been run since the Possessions app (or its latest columns) came.
      if (res.error && /possessions|schema cache|PGRST20[45]|42P01|42703/i.test(`${res.error.code ?? ''} ${res.error.message}`)) {
        throw new Error('possessions/missing');
      }
      return (check(res) as Possession[]).map((p) => ({ ...p, item_type: p.item_type ?? '', extra: p.extra ?? {} }));
    },

    async savePossession(p) {
      if (p.id) {
        const current = check(await sb.from('possessions').select('*').eq('id', p.id).single()) as Possession;
        const res = await sb.from('possessions').update(possessionFields(p, current)).eq('id', p.id).select().single();
        return check(res) as Possession;
      }
      return check(await sb.from('possessions').insert(possessionFields(p)).select().single()) as Possession;
    },

    async addPossessions(rows) {
      const out: Possession[] = [];
      const base = Date.now();
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r, j) => possessionFields({ ...r, position: r.position ?? base + i + j }));
        out.push(...(check(await sb.from('possessions').insert(chunk).select()) as Possession[]));
      }
      return out;
    },

    async deletePossessions(ids) {
      if (ids.length) check(await sb.from('possessions').delete().in('id', ids));
    },

    async uploadPossessionImage(file) {
      // Each user's photos go in possessions/<their id>/ ("media own possessions upload" policy in schema.sql).
      const { data } = await sb.auth.getUser();
      if (!data.user) throw new Error('auth/required');
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `possessions/${data.user.id}/${uid()}.${ext}`;
      const res = await sb.storage.from(BUCKET).upload(path, file, {
        cacheControl: '31536000',
        contentType: file.type || undefined,
      });
      if (res.error) throw new Error(res.error.message);
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },

    // To-dos: row-level security ("todos own") limits every query to the signed-in user's rows.
    async listTodos() {
      const res = await sb.from('todos').select('*').order('position');
      // Table missing: schema.sql hasn't been run since the To-do app came.
      if (res.error && /todos|schema cache|PGRST20[45]|42P01|42703/i.test(`${res.error.code ?? ''} ${res.error.message}`)) {
        throw new Error('todos/missing');
      }
      // Rows saved before a column existed come back with nulls: fill them in the same way saving would.
      return (check(res) as Todo[]).map((x) => ({ ...x, ...todoFields(x, x) }));
    },

    async saveTodo(t) {
      if (t.id) {
        const current = check(await sb.from('todos').select('*').eq('id', t.id).single()) as Todo;
        return check(await sb.from('todos').update(todoFields(t, current)).eq('id', t.id).select().single()) as Todo;
      }
      return check(await sb.from('todos').insert(todoFields(t)).select().single()) as Todo;
    },

    async deleteTodos(ids) {
      if (ids.length) check(await sb.from('todos').delete().in('id', ids));
    },
  };
  return api;
}
