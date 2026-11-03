import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { useApp } from './app';
import type { Post, TagGroup } from './types';
import { inTagGroup, pickText } from './util';

// Tag-group sites ("sites inside the site"): /<slug>/… shows only the group's posts, with its own chrome.
// The layout component is src/site/SiteLayout.tsx; this file holds the context and hooks (non-components),
// so React Fast Refresh keeps working.

export interface SiteCtxValue {
  /** null on the main blog. */
  group: TagGroup | null;
  /** '' on the main blog, '/coach' on a tag-group site. */
  base: string;
}

export const SiteCtx = createContext<SiteCtxValue>({ group: null, base: '' });

export function useSite() {
  const { group, base } = useContext(SiteCtx);
  const { prefs } = useApp();
  return {
    group,
    base,
    /** App path → path inside the current site: link('/posts/x') is '/coach/posts/x' on the coach site. */
    link: (path: string) => (base ? (path === '/' ? base : `${base}${path}`) : path),
    /** The site's name in the interface language ('' on the main blog). */
    siteName: group ? pickText(group.config.name, prefs.uiLang) || group.slug : '',
  };
}

/** The current tag group's posts, newest first (null while loading). */
export function useGroupPosts(group: TagGroup | null, limit = 1000): Post[] | null {
  const { user } = useApp();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const key = `${group?.id}|${group?.tags.join('\u0000')}|${user?.id ?? ''}`;
  const [loadedFor, setLoadedFor] = useState(key);
  if (loadedFor !== key) {
    setLoadedFor(key);
    setPosts(null);
  }
  useEffect(() => {
    if (!group) return;
    let live = true;
    api
      .listPosts({ anyTags: group.tags, limit })
      .then((ps) => live && setPosts(ps.filter((p) => inTagGroup(p, group))))
      .catch(() => live && setPosts([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit]);
  return posts;
}
