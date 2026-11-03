import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useSite } from '../lib/site';
import type { Post, PostQuery, Profile, TagCount } from '../lib/types';
import { can, inTagGroup, tagPath } from '../lib/util';
import { PostCard } from '../components/PostBits';
import { usePageTitle } from './usePageTitle';

/** On a tag-group site every list is limited to the group's public posts. */
function usePosts(q: PostQuery | null, deps: unknown[]) {
  const { user } = useApp();
  const { group } = useSite();
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    if (!q) return;
    let live = true;
    setPosts(null);
    api
      .listPosts(group ? { ...q, anyTags: group.tags } : q)
      .then((p) => live && setPosts(group ? p.filter((x) => inTagGroup(x, group)) : p))
      .catch(() => live && setPosts([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, user?.id, group?.id]);
  return posts;
}

function PostGrid({ posts, compact }: { posts: Post[] | null; compact?: boolean }) {
  const { t } = useApp();
  if (!posts) return <p className="loading">{t('loading')}</p>;
  if (!posts.length) return <p className="empty">{t('noResults')}</p>;
  return (
    <div className={`grid${compact ? ' compact' : ''}`}>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} compact={compact} />
      ))}
    </div>
  );
}

/** All tags with post counts; on a tag-group site only the group's own tags, counted over its posts. */
function useTags() {
  const { group } = useSite();
  const [tags, setTags] = useState<TagCount[]>([]);
  useEffect(() => {
    if (!group) {
      api.listTags().then(setTags).catch(() => {});
      return;
    }
    api
      .listPosts({ anyTags: group.tags, limit: 10000 })
      .then((posts) => {
        const counts = new Map<string, number>();
        posts
          .filter((p) => inTagGroup(p, group))
          .forEach((p) => p.tags.filter((t) => group.tags.includes(t)).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
        setTags([...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
      })
      .catch(() => {});
  }, [group]);
  return tags;
}

function TagCloud({ tags, limit, strip }: { tags: TagCount[]; limit?: number; strip?: boolean }) {
  const { link } = useSite();
  return (
    <div className={`tags ${strip ? 'strip' : 'cloud'}`}>
      {tags.slice(0, limit).map(({ tag, count }) => (
        <Link key={tag} to={link(tagPath(tag))} className="tag" dir="auto">
          #{tag} <small>{count}</small>
        </Link>
      ))}
    </div>
  );
}

function PageHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function Home() {
  const { t, user } = useApp();
  const posts = usePosts({}, []);
  const tags = useTags();
  const [loadedDrafts, setDrafts] = useState<Post[]>([]);
  const drafts = can.seeDrafts(user) ? loadedDrafts : [];
  usePageTitle();
  useEffect(() => {
    if (can.seeDrafts(user)) api.listPosts({ status: 'draft' }).then(setDrafts).catch(() => {});
  }, [user]);

  return (
    <>
      {/* Posts start right away: the site name lives in the top bar, so this heading is for screen readers only. */}
      <h1 className="sr-only">
        {t('siteName')} · {t('tagline')}
      </h1>
      <div className="home-bar">
        <Link to="/search" className="home-search" aria-label={t('search')}>
          <SearchIcon size={16} /> <span>{t('searchPlaceholder')}</span>
        </Link>
        <TagCloud tags={tags} limit={12} strip />
      </div>
      <section>
        {drafts.length > 0 && <h2 className="section-title">{t('latest')}</h2>}
        <PostGrid posts={posts} compact />
      </section>
      {drafts.length > 0 && (
        <section>
          <h2 className="section-title">{t('drafts')}</h2>
          <PostGrid posts={drafts} compact />
        </section>
      )}
    </>
  );
}

/** /<site>/posts — every post of a tag-group site, in the compact homepage layout. */
export function ArticlesPage() {
  const { t } = useApp();
  const { link } = useSite();
  const posts = usePosts({}, []);
  const tags = useTags();
  usePageTitle(t('articles'));
  return (
    <>
      <PageHead title={t('articles')} />
      <div className="home-bar">
        <Link to={link('/search')} className="home-search" aria-label={t('search')}>
          <SearchIcon size={16} /> <span>{t('searchPlaceholder')}</span>
        </Link>
        <TagCloud tags={tags} limit={12} strip />
      </div>
      <PostGrid posts={posts} compact />
    </>
  );
}

export function TagsPage() {
  const { t } = useApp();
  const tags = useTags();
  usePageTitle(t('allTags'));
  return (
    <>
      <PageHead title={t('allTags')} />
      <TagCloud tags={tags} />
    </>
  );
}

export function TagPage() {
  const { tag = '' } = useParams();
  usePageTitle(`#${tag}`);
  const posts = usePosts({ tags: [tag] }, [tag]);
  return (
    <>
      <PageHead title={<span dir="auto">#{tag}</span>} />
      <PostGrid posts={posts} />
    </>
  );
}

export function AuthorPage() {
  const { username = '' } = useParams();
  const { t } = useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const posts = usePosts({ author: username }, [username]);
  useEffect(() => {
    api.getProfile(username).then(setProfile);
  }, [username]);
  usePageTitle(profile?.display_name);
  return (
    <>
      <PageHead title={`${t('postsBy')} ${profile?.display_name ?? username}`} />
      <PostGrid posts={posts} />
    </>
  );
}

export function ArchivePage() {
  const { year, month } = useParams();
  const { t, prefs } = useApp();
  const y = Number(year);
  const m = month ? Number(month) : undefined;
  const posts = usePosts(y ? { year: y, month: m } : null, [y, m]);
  const label = m
    ? new Date(y, m - 1, 1).toLocaleDateString(prefs.uiLang === 'he' ? 'he-IL' : 'en-GB', { month: 'long', year: 'numeric' })
    : String(y);
  usePageTitle(`${t('archive')} ${label}`);
  return (
    <>
      <PageHead title={`${t('archive')} · ${label}`} />
      <PostGrid posts={posts} />
    </>
  );
}

/** /search?q=text&tag=a&tag=b — "#tag" typed in the box becomes a tag filter. */
export function SearchPage() {
  const { t } = useApp();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const selected = params.getAll('tag');
  const [input, setInput] = useState(q);
  const tags = useTags();
  usePageTitle(t('search'));

  useEffect(() => setInput(q), [q]);

  // Debounce typing into the URL (the URL is the source of truth, so results are shareable).
  useEffect(() => {
    const id = setTimeout(() => {
      const hashTags = [...input.matchAll(/#([^\s#]+)/g)].map((m) => m[1]);
      const text = input.replace(/#[^\s#]+/g, '').trim();
      if (text === q && !hashTags.length) return;
      const next = new URLSearchParams();
      if (text) next.set('q', text);
      [...new Set([...selected, ...hashTags])].forEach((tg) => next.append('tag', tg));
      if (hashTags.length) setInput(text);
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const query = useMemo(() => ({ q, tags: selected }), [q, selected.join('\u0000')]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = !!(q || selected.length);
  const posts = usePosts(active ? query : {}, [query]);

  const toggleTag = (tag: string) => {
    const next = new URLSearchParams(params);
    next.delete('tag');
    const set = new Set(selected);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    set.forEach((tg) => next.append('tag', tg));
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="search-box">
        <SearchIcon size={20} />
        <input
          type="search"
          dir="auto"
          autoFocus
          enterKeyHint="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
        />
        {input && (
          <button type="button" className="icon-btn" onClick={() => setInput('')} aria-label={t('cancel')}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="tags cloud filter">
        {tags.map(({ tag }) => (
          <button type="button" key={tag} className={`tag${selected.includes(tag) ? ' on' : ''}`} onClick={() => toggleTag(tag)} dir="auto">
            #{tag}
          </button>
        ))}
      </div>
      {active && posts && (
        <p className="muted">
          {posts.length} {t('results')}
        </p>
      )}
      <PostGrid posts={posts} />
    </>
  );
}
