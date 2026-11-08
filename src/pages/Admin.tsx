import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, Ban, Bot, Check, ExternalLink, FileJson, Globe, KeyRound, PenSquare, Pencil, Plus, Search, Trash2, Upload, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import { downloadJsonBackup } from '../lib/export';
import type { Group, Post, Profile, Role, RoleRequest, TagGroup } from '../lib/types';
import { GroupSheet } from '../components/Audience';
import { ExportAllSheet } from '../components/ExportAllSheet';
import { TagGroupSheet } from '../components/TagGroupSheet';
import { VIS_ICON } from '../components/visIcons';
import { PasswordSheet, UserSheet } from '../components/UserSheets';
import { absoluteUrl, can, formatDate, needsReview, normalizeSearch, publicInTagGroup, pickText, postPath, ROLES, titleDir } from '../lib/util';
import { usePageTitle } from './usePageTitle';

/** /admin — posts (incl. drafts) for writers and reviewers, users & roles for the manager. */
export function AdminPage() {
  const { t, user, authReady, prefs, toast } = useApp();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  type Tab = 'posts' | 'users' | 'requests' | 'groups' | 'sites';
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'posts';
  const setTab = (next: Tab) => setParams(next === 'posts' ? {} : { tab: next }, { replace: true });
  const [tagGroups, setTagGroups] = useState<TagGroup[] | null>(null);
  const [editingTagGroup, setEditingTagGroup] = useState<TagGroup | null | undefined>(undefined);
  const [exportGroup, setExportGroup] = useState<TagGroup | null>(null);
  // "Edit site" in a tag-group site's footer links here as ?tab=sites&edit=<id>: open that group's sheet.
  const editParam = params.get('edit');
  if (editParam && tagGroups && editingTagGroup === undefined) {
    const g = tagGroups.find((x) => x.id === editParam);
    if (g) setEditingTagGroup(g);
  }
  const closeTagGroupSheet = () => {
    setEditingTagGroup(undefined);
    if (editParam) setParams({ tab: 'sites' }, { replace: true });
  };
  const [groups, setGroups] = useState<Group[]>([]);
  const [editingGroup, setEditingGroup] = useState<Group | null | undefined>(undefined);
  const [userQuery, setUserQuery] = useState('');
  /** A role, '' for everyone, or 'review' for accounts that look automated or are on hold. */
  const [roleFilter, setRoleFilter] = useState<Role | '' | 'review'>('');
  const [armDeleteAll, setArmDeleteAll] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null | undefined>(undefined);
  const [pwUser, setPwUser] = useState<Profile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  usePageTitle(t('admin'));

  const load = () => {
    api.listPosts({ status: 'all', limit: 1000 }).then(setPosts);
    if (can.manageGroups(user)) api.listGroups().then(setGroups).catch(() => {});
    if (can.manageTagGroups(user)) api.listTagGroups().then(setTagGroups).catch(() => setTagGroups([]));
    if (can.manageUsers(user)) {
      api.listUsers().then(setUsers).catch((e) => toast(errorText(e, t)));
      api.listRoleRequests().then(setRequests).catch(() => {});
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [user]);

  if (!authReady) return <p className="loading">{t('loading')}</p>;
  if (!can.seeDrafts(user)) {
    return (
      <div className="empty">
        <p>{t('forbidden')}</p>
        {!user && (
          <Link className="btn primary" to="/login" state={{ from: '/admin' }}>
            {t('login')}
          </Link>
        )}
      </div>
    );
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  async function decide(id: string, approve: boolean) {
    try {
      await api.decideRoleRequest(id, approve);
      load();
    } catch (e) {
      toast(errorText(e, t));
    }
  }

  /** Run a user action, then reload; errors become toasts. */
  async function userAction(fn: () => Promise<void>, done?: string) {
    try {
      await fn();
      if (done) toast(done);
      load();
    } catch (e) {
      toast(errorText(e, t));
    }
  }

  // Accounts that need a look: held at sign-up for a machine-made name, or older ones whose name or e-mail looks
  // like that. Never yourself or another manager.
  const suspicious = (users ?? []).filter((u) => u.id !== user?.id && u.role !== 'admin' && needsReview(u));

  async function deleteSuspicious() {
    setArmDeleteAll(false);
    let n = 0;
    for (const u of suspicious) {
      try {
        await api.deleteUser(u.id);
        n++;
      } catch (e) {
        toast(errorText(e, t));
        break;
      }
    }
    toast(t('deletedUsers', { n }));
    setRoleFilter('');
    load();
  }

  const shownUsers = (users ?? []).filter((u) => {
    if (roleFilter === 'review') {
      if (!suspicious.includes(u)) return false;
    } else if (roleFilter && u.role !== roleFilter) return false;
    const q = normalizeSearch(userQuery).replace(/^@/, '');
    return !q || normalizeSearch(`${u.display_name} ${u.email ?? ''} ${u.username}`).includes(q);
  });

  async function importBackup(file: File) {
    try {
      const data = JSON.parse(await file.text()) as { posts?: Post[] };
      let n = 0;
      for (const p of data.posts ?? []) {
        await api.savePost({
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
          content_html: p.content_html,
          cover_url: p.cover_url,
          tags: p.tags,
          lang: p.lang,
          status: p.status,
          visibility: p.visibility ?? 'public',
          allowed_users: p.allowed_users ?? [],
          allowed_groups: p.allowed_groups ?? [],
        });
        n++;
      }
      toast(`${t('imported')}: ${n}`);
      load();
    } catch (e) {
      toast(errorText(e, t));
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>{t('admin')}</h1>
        <div className="row wrap">
          {can.write(user) && (
            <Link className="btn primary" to="/posts/new">
              <PenSquare size={18} /> {t('newPost')}
            </Link>
          )}
          {can.export(user) && (
            <>
              <button type="button" className="btn ghost" onClick={() => posts && downloadJsonBackup(posts)}>
                <FileJson size={18} /> {t('exportJson')}
              </button>
              <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
                <Upload size={18} /> {t('importJson')}
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
            </>
          )}
        </div>
      </header>

      {can.manageGroups(user) && (
        <div className="seg tabs">
          <button type="button" className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>
            {t('allPosts')}
          </button>
          {can.manageUsers(user) && (
            <>
              <button type="button" className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>
                {t('users')}
                {suspicious.length > 0 && (
                  <span className="count warn" title={t('reviewCount', { n: suspicious.length })}>
                    {suspicious.length}
                  </span>
                )}
              </button>
              <button type="button" className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
                {t('requests')}
                {pendingCount > 0 && <span className="count">{pendingCount}</span>}
              </button>
            </>
          )}
          <button type="button" className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>
            {t('groups')}
          </button>
          {can.manageTagGroups(user) && (
            <button type="button" className={tab === 'sites' ? 'on' : ''} onClick={() => setTab('sites')}>
              {t('tagGroups')}
            </button>
          )}
        </div>
      )}

      {tab === 'posts' && (
        <ul className="admin-list">
          {posts?.map((p) => (
            <li key={p.id}>
              <Link to={postPath(p.slug)} dir="auto" className="grow">
                <strong dir={titleDir(p.title, p.lang)}>{p.title}</strong>
                <small className="muted">
                  {p.author?.display_name} · {formatDate(p.updated_at, prefs.uiLang)}
                </small>
              </Link>
              {p.visibility && p.visibility !== 'public' && (() => {
                const Icon = VIS_ICON[p.visibility];
                return <Icon size={16} className="muted" aria-label={t(`vis_${p.visibility}`)} />;
              })()}
              <span className={`badge${p.status === 'published' ? ' ok' : ''}`}>{p.status === 'published' ? t('published') : t('draft')}</span>
              {can.editPost(user, p) && (
                <Link className="btn ghost sm" to={postPath(p.slug, '/edit')}>
                  {t('edit')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === 'users' && (
        <>
          <dl className="role-help">
            {ROLES.map((r) => (
              <div key={r}>
                <dt>
                  {t(`role_${r}`)} <span className="muted">· {users?.filter((u) => u.role === r).length ?? 0}</span>
                </dt>
                <dd>{t(`roleHelp_${r}`)}</dd>
              </div>
            ))}
          </dl>
          <div className="user-tools">
            <label className="search-box grow">
              <Search size={18} className="muted" />
              <input type="search" value={userQuery} placeholder={t('searchUsers')} aria-label={t('searchUsers')} onChange={(e) => setUserQuery(e.target.value)} />
            </label>
            <select value={roleFilter} aria-label={t('role')} onChange={(e) => setRoleFilter(e.target.value as Role | '' | 'review')}>
              <option value="">{t('allRoles')}</option>
              {suspicious.length > 0 && <option value="review">{t('needsReviewFilter', { n: suspicious.length })}</option>}
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role_${r}`)}
                </option>
              ))}
            </select>
            <button type="button" className="btn primary" onClick={() => setEditingUser(null)}>
              <UserPlus size={18} /> {t('addUser')}
            </button>
          </div>
          {suspicious.length > 0 && (
            <div className="review-bar" role="status">
              <Bot size={20} aria-hidden />
              <span className="grow">{t('reviewBar', { n: suspicious.length })}</span>
              {roleFilter !== 'review' && (
                <button type="button" className="btn ghost sm" onClick={() => setRoleFilter('review')}>
                  {t('showThem')}
                </button>
              )}
              <button
                type="button"
                className={`btn sm ${armDeleteAll ? 'primary danger-fill' : 'ghost danger'}`}
                onClick={() => (armDeleteAll ? void deleteSuspicious() : setArmDeleteAll(true))}
                onBlur={() => setArmDeleteAll(false)}
              >
                <Trash2 size={15} /> {armDeleteAll ? t('sureDeleteAll', { n: suspicious.length }) : t('deleteAll', { n: suspicious.length })}
              </button>
            </div>
          )}
          <ul className="admin-list">
            {users && !shownUsers.length && <p className="hint">{t('noUsersMatch')}</p>}
            {shownUsers.map((u) => {
              const self = u.id === user?.id;
              return (
                <li key={u.id} className={`user-row${u.suspended ? ' is-suspended' : ''}`}>
                  <span className="avatar">{u.display_name.slice(0, 1)}</span>
                  <span className="grow">
                    <strong dir="auto">
                      {u.display_name}
                      {self && <span className="badge ok">{t('you')}</span>}
                      {u.review_reason && u.review_reason !== 'approved' ? (
                        <span className="badge status-rejected">{t('onHold')}</span>
                      ) : (
                        u.suspended && <span className="badge status-rejected">{t('suspended')}</span>
                      )}
                      {suspicious.includes(u) && (
                        <span className="badge warn" title={t('looksAutomatedHelp')}>
                          <Bot size={12} /> {t('looksAutomated')}
                        </span>
                      )}
                      {u.must_change_password && <span className="badge">{t('tempPasswordBadge')}</span>}
                    </strong>
                    <small className="muted" dir="ltr">
                      {u.email} · @{u.username}
                    </small>
                    <small className="muted">
                      {t('joined')} {formatDate(u.created_at, prefs.uiLang)} ·{' '}
                      {u.last_sign_in_at ? `${t('lastSignIn')} ${formatDate(u.last_sign_in_at, prefs.uiLang)}` : t('neverSignedIn')}
                    </small>
                  </span>
                  <span className="user-actions">
                    <select
                      value={u.role}
                      disabled={self}
                      aria-label={t('role')}
                      onChange={(e) => userAction(() => api.setRole(u.id, e.target.value as Role))}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`role_${r}`)}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="icon-btn" aria-label={t('edit')} title={t('edit')} onClick={() => setEditingUser(u)}>
                      <Pencil size={16} />
                    </button>
                    {!self && suspicious.includes(u) && (
                      <>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => userAction(() => api.setSuspended(u.id, false), t('approved'))}
                          title={t('approveHelp')}
                        >
                          <Check size={15} /> {t('approve')}
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost danger"
                          onClick={() => userAction(() => api.deleteUser(u.id), t('userDeleted'))}
                        >
                          <Trash2 size={15} /> {t('delete')}
                        </button>
                      </>
                    )}
                    {!self && !suspicious.includes(u) && (
                      <>
                        <button type="button" className="icon-btn" aria-label={t('resetPassword')} title={t('resetPassword')} onClick={() => setPwUser(u)}>
                          <KeyRound size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={u.suspended ? t('unsuspend') : t('suspend')}
                          title={u.suspended ? t('unsuspend') : t('suspend')}
                          onClick={() => {
                            if (!u.suspended && !window.confirm(t('confirmSuspend'))) return;
                            userAction(() => api.setSuspended(u.id, !u.suspended));
                          }}
                        >
                          {u.suspended ? <UserCheck size={16} /> : <Ban size={16} />}
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          aria-label={t('delete')}
                          title={t('delete')}
                          onClick={() => {
                            if (window.confirm(t('confirmDeleteUser'))) userAction(() => api.deleteUser(u.id), t('userDeleted'));
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <UserSheet open={editingUser !== undefined} user={editingUser ?? null} onClose={() => setEditingUser(undefined)} onSaved={load} />
          <PasswordSheet user={pwUser} onClose={() => setPwUser(null)} onSaved={load} />
        </>
      )}
      {tab === 'requests' && (
        <ul className="admin-list">
          {!requests.length && <p className="hint">{t('noRequests')}</p>}
          {requests.map((r) => (
            <li key={r.id} className="request">
              <span className="avatar">{r.user?.display_name.slice(0, 1) ?? '?'}</span>
              <span className="grow">
                <strong dir="auto">{r.user?.display_name ?? '—'}</strong>
                <small className="muted">
                  {r.user ? t(`role_${r.user.role}`) : ''} {prefs.uiLang === 'he' ? '←' : '→'} <b>{t(`role_${r.requested_role}`)}</b> · {formatDate(r.created_at, prefs.uiLang)}
                </small>
                {r.message && (
                  <small dir="auto" className="request-msg">
                    {r.message}
                  </small>
                )}
              </span>
              {r.status === 'pending' ? (
                <span className="row">
                  <button type="button" className="btn primary sm" onClick={() => decide(r.id, true)}>
                    <Check size={16} /> {t('approve')}
                  </button>
                  <button type="button" className="btn ghost sm danger" onClick={() => decide(r.id, false)}>
                    <X size={16} /> {t('reject')}
                  </button>
                </span>
              ) : (
                <span className={`badge status-${r.status}`}>{t(`status_${r.status}`)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {tab === 'groups' && can.manageGroups(user) && (
        <>
          <div className="row end">
            <button type="button" className="btn primary sm" onClick={() => setEditingGroup(null)}>
              <Plus size={16} /> {t('newGroup')}
            </button>
          </div>
          <ul className="admin-list" style={{ marginTop: 10 }}>
            {!groups.length && <p className="hint">{t('noGroups')}</p>}
            {groups.map((g) => (
              <li key={g.id}>
                <span className="avatar">
                  <Users size={18} />
                </span>
                <span className="grow">
                  <strong dir="auto">{g.name}</strong>
                  <small className="muted" dir="auto">
                    {g.member_ids.length} {t('members')}
                    {g.created_by && g.created_by !== user?.id && users
                      ? ` · ${t('by')} ${users.find((u) => u.id === g.created_by)?.display_name ?? '—'}`
                      : ''}
                    {g.description ? ` · ${g.description}` : ''}
                  </small>
                </span>
                <button type="button" className="icon-btn" aria-label={t('edit')} onClick={() => setEditingGroup(g)}>
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={t('delete')}
                  onClick={async () => {
                    if (!window.confirm(t('confirmDeleteGroup'))) return;
                    try {
                      await api.deleteGroup(g.id);
                      load();
                    } catch (e) {
                      toast(errorText(e, t));
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <GroupSheet open={editingGroup !== undefined} group={editingGroup ?? null} onClose={() => setEditingGroup(undefined)} onSaved={load} />
        </>
      )}
      {tab === 'sites' && can.manageTagGroups(user) && (
        <>
          <p className="hint">{t('tg_intro')}</p>
          <div className="row end">
            <button type="button" className="btn primary sm" onClick={() => setEditingTagGroup(null)}>
              <Plus size={16} /> {t('tg_new')}
            </button>
          </div>
          <ul className="admin-list" style={{ marginTop: 10 }}>
            {tagGroups && !tagGroups.length && <p className="hint">{t('tg_none')}</p>}
            {tagGroups?.map((g) => {
              const count = (posts ?? []).filter((p) => publicInTagGroup(p, g)).length;
              return (
                <li key={g.id} className="tg-row">
                  <span className="avatar" style={{ background: g.config.accent }}>
                    <Globe size={18} />
                  </span>
                  <span className="grow">
                    <strong dir="auto">{pickText(g.config.name, prefs.uiLang) || g.slug}</strong>
                    <small className="muted">
                      <a href={absoluteUrl(`/${g.slug}`)} target="_blank" rel="noopener noreferrer" dir="ltr" className="tg-addr">
                        {location.host}/{g.slug} <ExternalLink size={12} className="inline-ico" />
                      </a>{' '}
                      · {count} {t('tg_postsMatch')}
                    </small>
                    {/* One element per tag, each with its own direction, so "#" lands right for Hebrew and English. */}
                    <small className="muted tg-row-tags">
                      {g.tags.map((tg) => (
                        <span key={tg} dir="auto">
                          #{tg}
                        </span>
                      ))}
                    </small>
                  </span>
                  <span className="tg-row-actions">
                    <button type="button" className="icon-btn" aria-label={t('tg_export')} title={t('tg_export')} onClick={() => setExportGroup(g)}>
                      <Archive size={16} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={t('edit')} title={t('edit')} onClick={() => setEditingTagGroup(g)}>
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={t('delete')}
                      title={t('delete')}
                      onClick={async () => {
                        if (!window.confirm(t('tg_confirmDelete'))) return;
                        try {
                          await api.deleteTagGroup(g.id);
                          load();
                        } catch (e) {
                          toast(errorText(e, t));
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <TagGroupSheet open={editingTagGroup !== undefined} group={editingTagGroup ?? null} posts={posts ?? []} onClose={closeTagGroupSheet} onSaved={load} />
          <ExportAllSheet open={!!exportGroup} group={exportGroup} onClose={() => setExportGroup(null)} />
        </>
      )}
    </>
  );
}
