import { Link } from 'react-router-dom';
import { Clock, Heart } from 'lucide-react';
import { VIS_ICON } from './Audience';
import { useApp } from '../lib/app';
import type { Post } from '../lib/types';
import { formatDate, postPath, readingMinutes, tagPath, titleDir } from '../lib/util';

export function TagChips({ tags, active }: { tags: string[]; active?: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="tags">
      {tags.map((tag) => (
        <Link key={tag} to={tagPath(tag)} className={`tag${active?.includes(tag) ? ' on' : ''}`} dir="auto">
          #{tag}
        </Link>
      ))}
    </div>
  );
}

/** Author · published · updated · reading time. */
export function PostMeta({ post }: { post: Post }) {
  const { t, prefs } = useApp();
  const pub = post.published_at ?? post.created_at;
  const edited = new Date(post.updated_at).getTime() - new Date(pub).getTime() > 60_000;
  // Its words ("by", "published", dates) are in the interface language, so the row follows that language,
  // not the post's: Hebrew interface → right-aligned, even on an English post.
  return (
    <div className="post-meta" dir={prefs.uiLang === 'he' ? 'rtl' : 'ltr'} lang={prefs.uiLang}>
      {post.author && (
        <Link to={`/authors/${encodeURIComponent(post.author.username)}`} className="author">
          <span className="avatar" aria-hidden>
            {post.author.display_name.slice(0, 1)}
          </span>
          <span>
            <span className="muted">{t('by')} </span>
            {/* bdi: a name in the other script doesn't jumble the row's order */}
            <bdi>{post.author.display_name}</bdi>
          </span>
        </Link>
      )}
      <span className="meta-dates">
        {post.visibility && post.visibility !== 'public' && (() => {
          const Icon = VIS_ICON[post.visibility];
          return (
            <span className="badge vis" title={t(`visHelp_${post.visibility}`)}>
              <Icon size={12} className="inline-ico" /> {t(`vis_${post.visibility}`)}
            </span>
          );
        })()}{' '}
        {post.status === 'draft' ? (
          <span className="badge">{t('draft')}</span>
        ) : (
          <time dateTime={pub}>
            {t('published')} {formatDate(pub, prefs.uiLang)}
          </time>
        )}
        {edited && (
          <time dateTime={post.updated_at} className="muted">
            {' · '}
            {t('updated')} {formatDate(post.updated_at, prefs.uiLang)}
          </time>
        )}
        <span className="muted">
          {' · '}
          <span className="nowrap">
            <Clock size={13} className="inline-ico" /> {readingMinutes(post.content_text)} {t('minRead')}
          </span>
        </span>
        {!!post.like_count && (
          <span className="muted like-count" title={t('likesCount')} aria-label={`${post.like_count} ${t('likesCount')}`}>
            {' · '}
            <span className="nowrap">
              <Heart size={13} className="inline-ico" /> {post.like_count}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

/** compact: a dense row with a side thumbnail, so more posts fit on screen. */
export function PostCard({ post, compact }: { post: Post; compact?: boolean }) {
  const dir = post.lang === 'he' ? 'rtl' : 'ltr';
  return (
    <article className={`card${compact ? ' compact' : ''}`} dir={dir} lang={post.lang}>
      {post.cover_url && (
        <Link to={postPath(post.slug)} className="card-cover" tabIndex={-1}>
          <img src={post.cover_url} alt="" loading="lazy" />
        </Link>
      )}
      <div className="card-body">
        <h2 dir={titleDir(post.title, post.lang)}>
          <Link to={postPath(post.slug)}>{post.title}</Link>
        </h2>
        <PostMeta post={post} />
        {/* Same rule as the title (and the editor's summary box): any Hebrew → RTL, else the post's language. */}
        {post.excerpt && (
          <p className="excerpt" dir={titleDir(post.excerpt, post.lang)}>
            {post.excerpt}
          </p>
        )}
        <TagChips tags={post.tags} />
      </div>
    </article>
  );
}
