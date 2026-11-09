export type Role = 'admin' | 'editor' | 'reviewer' | 'commenter' | 'reader';
export type Lang = 'he' | 'en';
/** Sign-in services offered next to email. Each must also be enabled in Supabase → Authentication → Providers. */
export type OAuthProvider = 'google' | 'facebook' | 'apple' | 'github';
export type PostStatus = 'draft' | 'published';
/** public: everyone · members: any signed-in user · private: author + admin · restricted: chosen people and groups. */
export type Visibility = 'public' | 'members' | 'private' | 'restricted';

export interface Group {
  id: string;
  name: string;
  description: string;
  member_ids: string[];
  /** Owner. Each author manages their own groups; the admin sees all of them. */
  created_by: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  username: string;
  role: Role;
  created_at: string;
  email?: string;
  /** Set on the prebuilt admin, and on accounts the admin created or reset, until the password is changed. */
  must_change_password?: boolean;
  /** Suspended accounts cannot sign in. Admin-only field. */
  suspended?: boolean;
  /** Admin-only field. */
  last_sign_in_at?: string | null;
  /**
   * Why a new account is on hold for the admin to check ('name': its name looks machine-made), or 'approved' once
   * the admin has checked it. Held accounts are suspended; approving lifts both. Admin-only field.
   */
  review_reason?: string | null;
}

export interface NewUser {
  email: string;
  display_name: string;
  role: Role;
  /** Temporary: the user is asked to change it on first sign-in. */
  password: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface RoleRequest {
  id: string;
  user_id: string;
  requested_role: Role;
  message: string;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  user?: { display_name: string; username: string; role: Role } | null;
}

export interface AuthorRef {
  display_name: string;
  username: string;
}

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Canonical body: sanitized semantic HTML5 (see README "Post format"). */
  content_html: string;
  /** Plain-text projection of the body, used for search. */
  content_text: string;
  cover_url: string | null;
  tags: string[];
  lang: Lang;
  status: PostStatus;
  visibility: Visibility;
  allowed_users: string[];
  allowed_groups: string[];
  author_id: string;
  author?: AuthorRef | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  /** Number of likes. Filled in by listPosts only (cards); the post page uses getLikes. */
  like_count?: number;
}

export type PostDraft = Pick<
  Post,
  'title' | 'excerpt' | 'content_html' | 'cover_url' | 'tags' | 'lang' | 'status' | 'visibility' | 'allowed_users' | 'allowed_groups'
> & { id?: string; slug?: string };

export interface Comment {
  id: string;
  post_id: string;
  /** null for a visitor's comment on a tag-group site (see guest_name). */
  user_id: string | null;
  /** Name a visitor typed instead of signing in. Only on tag-group sites. */
  guest_name?: string | null;
  parent_id: string | null;
  /** W3C TextQuoteSelector-style anchor into the rendered post text. */
  quote: string;
  prefix: string;
  suffix: string;
  body: string;
  resolved: boolean;
  created_at: string;
  author?: AuthorRef | null;
}

export interface NewComment {
  post_id: string;
  parent_id?: string | null;
  quote: string;
  prefix: string;
  suffix: string;
  body: string;
  /** Visitors (not signed in) on a tag-group site comment under a name instead of an account. */
  guest_name?: string;
}

export interface PostQuery {
  q?: string;
  /** Posts that have all of these tags. */
  tags?: string[];
  /** Posts that have at least one of these tags (tag-group sites). An empty list matches nothing. */
  anyTags?: string[];
  author?: string;
  status?: PostStatus | 'all';
  year?: number;
  month?: number;
  limit?: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface LikeInfo {
  count: number;
  liked: boolean;
}

/** One text in both interface languages. */
export interface Bilingual {
  he: string;
  en: string;
}

/** What the default landing page shows. Custom landings (src/landings) may read the same fields. */
export interface TagGroupConfig {
  /** Brand shown in the header and the browser tab, e.g. "Oded Sagir — Coaching". */
  name: Bilingual;
  tagline: Bilingual;
  about: Bilingual;
  /** YouTube link for the welcome video ('' = none). */
  video_url: string;
  video_heading: Bilingual;
  /** Images the background shifts between while scrolling. */
  backgrounds: string[];
  cta_title: Bilingual;
  cta_label: Bilingual;
  /** Where the call-to-action button goes: https://…, mailto:…, https://wa.me/… */
  cta_url: string;
  /** Accent color, #rrggbb. */
  accent: string;
}

/**
 * A "site inside the site": /<slug> shows only posts that carry at least one of `tags`,
 * with its own landing page and no blog chrome. Admin-managed.
 */
export interface TagGroup {
  id: string;
  slug: string;
  tags: string[];
  /** 'default', or a key of CUSTOM_LANDINGS in src/landings/index.ts. */
  landing: string;
  config: TagGroupConfig;
  created_at: string;
  updated_at: string;
}

export type TagGroupDraft = Pick<TagGroup, 'slug' | 'tags' | 'landing' | 'config'> & { id?: string };

/**
 * One thing a user owns, in the Possessions app (src/apps/possessions). Private to its owner: see the
 * "possessions own" policy in supabase/schema.sql and the owner checks in api/local.ts.
 */
export interface Possession {
  id: string;
  owner_id: string;
  /** What kind of thing it is ("Book", "Laptop"). The app's top-level filter. */
  item_type: string;
  /** A sub-type within the item type ("Health" for a book). Filtered once an item type is chosen. */
  category: string;
  title: string;
  /** Author, brand, artist or manufacturer. */
  maker: string;
  description: string;
  quantity: number;
  /** What it's worth now. */
  value: number | null;
  /** What was paid for it. */
  cost: number | null;
  /** 'YYYY-MM-DD' */
  date_purchased: string | null;
  location: string;
  condition: string;
  notes: string;
  image_url: string | null;
  /** The owner's own order within the item type (rows are dragged into place); lower comes first. */
  position: number;
  /** Spreadsheet columns that don't match a field above, kept as they were ("ISBN", "Publisher"). */
  extra: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export type PossessionDraft = Partial<Omit<Possession, 'id' | 'owner_id' | 'created_at' | 'updated_at'>> & {
  id?: string;
};

/**
 * Where a task stands in its workflow: discovered → researched → defined → in progress → completed, with
 * blocked and on hold as pauses along the way. 'completed' and 'quit' close it.
 */
export type TodoStatus = 'discovered' | 'researched' | 'defined' | 'blocked' | 'onhold' | 'inprogress' | 'completed' | 'quit';

/** What a task is for: understanding something, learning something, or getting something done. */
export type TodoType =
  | 'understanding'
  | 'learning'
  | 'achieving'
  | 'decisions'
  | 'checking'
  | 'opportunities'
  | 'enrichments'
  | 'planning';

/** A named value kept on a task ("Budget: 400", "Order no.: 1182"). */
export interface TodoDatum {
  key: string;
  value: string;
}
/** Someone the task involves. Every field is optional except the name. */
export interface TodoContact {
  name: string;
  phone: string;
  email: string;
  note: string;
}
export interface TodoComment {
  at: string;
  text: string;
}
/**
 * The task's history: written by the app when it's created, changes stage or moves between day lists and the
 * pool (`from` / `to`), plus notes the user adds (kind 'note', `text`).
 */
export interface TodoLogEntry {
  at: string;
  kind: 'created' | 'status' | 'day' | 'note';
  from?: string | null;
  to?: string | null;
  text?: string;
}

/**
 * One task in the To-do app (src/apps/todo). Private to its owner: see the "todos own" policy in
 * supabase/schema.sql and the owner checks in api/local.ts.
 * Tasks form a workflow by depth: a task with no root_id is a root purpose, its children (root_id = it) are its
 * steps, and a step's children are its actions.
 */
export interface Todo {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  type: TodoType;
  status: TodoStatus;
  /** How much it matters: 0 not set, 1 low, 2 medium, 3 high. */
  priority: number;
  /** How soon it has to happen: 0 not set, 1 can wait, 2 soon, 3 urgent. */
  urgency: number;
  /** How big it is: 0 not set, 1–5 = XS, S, M, L, XL. */
  complexity: number;
  /** 'YYYY-MM-DD': when it's planned to be done. */
  due_date: string | null;
  /** 'YYYY-MM-DD': when it's estimated it will actually be done. */
  estimate_date: string | null;
  /** 'YYYY-MM-DD': the latest it can be done. */
  deadline: string | null;
  /** 'YYYY-MM-DD': from that day on, a pooled task is offered again on the Today screen. */
  remind_on: string | null;
  /** The day list it's on ('YYYY-MM-DD'). null: the general pool. */
  day: string | null;
  /** Labels to group by. */
  tags: string[];
  /** Named lists it belongs to: a list is simply every task that names it. */
  lists: string[];
  /** Tasks that have to be finished first. */
  depends_on: string[];
  /** The task this one was derived from (null: a root purpose). */
  root_id: string | null;
  /** The sibling before and after it among its root's children. */
  prev_id: string | null;
  next_id: string | null;
  /** Lower comes first among equals. */
  position: number;
  /** When it was completed. */
  done_at: string | null;
  /** Named values, people involved, comments and history (newest last). */
  data: TodoDatum[];
  contacts: TodoContact[];
  comments: TodoComment[];
  log: TodoLogEntry[];
  created_at: string;
  updated_at: string;
}

export type TodoDraft = Partial<Omit<Todo, 'id' | 'owner_id' | 'created_at' | 'updated_at'>> & { id?: string };

export interface Api {
  mode: 'supabase' | 'local';
  // auth
  currentUser(): Promise<Profile | null>;
  onAuthChange(cb: (p: Profile | null) => void): () => void;
  /**
   * `captchaToken` comes from the Cloudflare Turnstile check on the sign-up/sign-in form (when configured).
   * A sign-up whose name looks machine-made is created on hold: it throws 'auth/held'.
   */
  signUp(email: string, password: string, displayName: string, captchaToken?: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string, captchaToken?: string): Promise<void>;
  /** The configured sign-in services that actually work right now (live: switched on in Supabase). */
  oauthProviders(): Promise<OAuthProvider[]>;
  /** Leaves the page for the provider; on return the session is picked up from the URL. `returnTo` is an app path. */
  signInWithOAuth(provider: OAuthProvider, returnTo: string): Promise<void>;
  signOut(): Promise<void>;
  changePassword(newPassword: string): Promise<void>;
  // posts
  listPosts(q?: PostQuery): Promise<Post[]>;
  getPost(slug: string): Promise<Post | null>;
  savePost(draft: PostDraft): Promise<Post>;
  deletePost(id: string): Promise<void>;
  listTags(): Promise<TagCount[]>;
  uploadMedia(file: File): Promise<string>;
  // social
  listComments(postId: string): Promise<Comment[]>;
  addComment(c: NewComment): Promise<Comment>;
  setCommentResolved(id: string, resolved: boolean): Promise<void>;
  deleteComment(id: string): Promise<void>;
  getLikes(postId: string): Promise<LikeInfo>;
  /** Signed in: the account's like. Otherwise a visitor's like on a tag-group site (anonymous browser id). */
  toggleLike(postId: string): Promise<LikeInfo>;
  // users
  getProfile(username: string): Promise<Profile | null>;
  listUsers(): Promise<Profile[]>;
  setRole(userId: string, role: Role): Promise<void>;
  /** Admin only. Creates a confirmed account with a temporary password. */
  createUser(u: NewUser): Promise<Profile>;
  /** Admin only. */
  updateUser(userId: string, patch: Pick<Profile, 'display_name' | 'username'>): Promise<void>;
  /** Admin only. Sets a temporary password the user must change on next sign-in. */
  resetPassword(userId: string, password: string): Promise<void>;
  /** Admin only. Suspended users cannot sign in; existing sessions end. */
  setSuspended(userId: string, suspended: boolean): Promise<void>;
  /** Admin only. Removes the account, its comments, likes and requests; its posts move to the acting admin. */
  deleteUser(userId: string): Promise<void>;
  /** Public profile fields of all users, for audience pickers (no emails). */
  listPeople(): Promise<Profile[]>;
  // groups (admin + editors)
  listGroups(): Promise<Group[]>;
  saveGroup(g: Pick<Group, 'name' | 'description' | 'member_ids'> & { id?: string }): Promise<Group>;
  deleteGroup(id: string): Promise<void>;
  // tag groups (anyone reads; admin writes)
  listTagGroups(): Promise<TagGroup[]>;
  getTagGroup(slug: string): Promise<TagGroup | null>;
  saveTagGroup(g: TagGroupDraft): Promise<TagGroup>;
  deleteTagGroup(id: string): Promise<void>;
  // role requests
  requestRole(role: Role, message: string): Promise<void>;
  listMyRoleRequests(): Promise<RoleRequest[]>;
  /** Admin only: all requests, pending first. */
  listRoleRequests(): Promise<RoleRequest[]>;
  decideRoleRequest(id: string, approve: boolean): Promise<void>;
  // possessions app (signed-in users, each sees only their own)
  listPossessions(): Promise<Possession[]>;
  /** Creates (no id) or updates one; returns the saved row. */
  savePossession(p: PossessionDraft): Promise<Possession>;
  /** Creates many at once (spreadsheet import). */
  addPossessions(rows: PossessionDraft[]): Promise<Possession[]>;
  deletePossessions(ids: string[]): Promise<void>;
  /** Uploads a photo into the user's own folder and returns its URL. */
  uploadPossessionImage(file: File): Promise<string>;
  // to-do app (signed-in users, each sees only their own)
  listTodos(): Promise<Todo[]>;
  /** Creates (no id) or updates one; returns the saved row. */
  saveTodo(t: TodoDraft): Promise<Todo>;
  deleteTodos(ids: string[]): Promise<void>;
}
