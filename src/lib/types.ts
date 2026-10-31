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
  user_id: string;
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
}

export interface PostQuery {
  q?: string;
  tags?: string[];
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

export interface Api {
  mode: 'supabase' | 'local';
  // auth
  currentUser(): Promise<Profile | null>;
  onAuthChange(cb: (p: Profile | null) => void): () => void;
  signUp(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
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
  // role requests
  requestRole(role: Role, message: string): Promise<void>;
  listMyRoleRequests(): Promise<RoleRequest[]>;
  /** Admin only: all requests, pending first. */
  listRoleRequests(): Promise<RoleRequest[]>;
  decideRoleRequest(id: string, approve: boolean): Promise<void>;
}
