import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, FileCode2, FileDown, FileText, MessageSquarePlus, MessagesSquare, Pencil, Share2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import { anchorFromRange, type TextAnchor } from '../lib/anchor';
import { downloadPostHtml, downloadPostMarkdown } from '../lib/export';
import type { Comment, Post } from '../lib/types';
import { can, inTagGroup, postPath, titleDir } from '../lib/util';
import { useSite } from '../lib/site';
import { PublicComments } from '../site/PublicComments';
import { PostContent } from '../components/PostContent';
import { PostMeta, TagChips } from '../components/PostBits';
import { LikeButton, ShareSheet } from '../components/Social';
import { CommentsPanel } from '../components/CommentsPanel';
import { Sheet } from '../components/Sheet';
import { useFabActions } from '../components/fabActions';
import { NotFound } from './NotFound';
import { usePageTitle } from './usePageTitle';

export function PostView() {
  const { slug = '' } = useParams();
  const { t, user, toast, prefs } = useApp();
  // On a tag-group site: only the group's posts, and a plain comment section open to visitors instead of
  // the select-to-comment drawer.
  const { group } = useSite();
  const nav = useNavigate();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [orphans, setOrphans] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [sheet, setSheet] = useState<'share' | 'export' | 'comment' | null>(null);
  const [pending, setPending] = useState<TextAnchor | null>(null);
  const [selAnchor, setSelAnchor] = useState<TextAnchor | null>(null);
  const [draft, setDraft] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  usePageTitle(post?.title);

  // Show the spinner again when the slug or viewer changes (adjusted during render, not in an effect).
  const loadKey = `${slug}|${user?.id ?? ''}`;
  const [loadedFor, setLoadedFor] = useState(loadKey);
  if (loadedFor !== loadKey) {
    setLoadedFor(loadKey);
    setPost(undefined);
  }
  useEffect(() => {
    let stale = false;
    api
      .getPost(slug)
      .then((p) => !stale && setPost(p))
      .catch(() => !stale && setPost(null));
    return () => {
      stale = true;
    };
  }, [slug, user?.id]);

  const loadComments = useCallback(() => {
    if (post) api.listComments(post.id).then(setComments);
  }, [post]);
  useEffect(loadComments, [loadComments]);

  // Track text selection inside the article to offer "comment on this".
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      const root = contentRef.current;
      if (!sel || sel.isCollapsed || !root || !sel.rangeCount) return setSelAnchor(null);
      setSelAnchor(anchorFromRange(root, sel.getRangeAt(0)));
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  useFabActions(
    post
      ? [
          ...(can.editPost(user, post) ? [{ id: 'edit', label: t('edit'), icon: <Pencil />, onClick: () => nav(postPath(post.slug, '/edit')) }] : []),
          { id: 'comments', label: t('comments'), icon: <MessagesSquare />, onClick: () => setPanel(true) },
          { id: 'share', label: t('share'), icon: <Share2 />, onClick: () => setSheet('share') },
          ...(can.export(user)
            ? [{ id: 'export1', label: `${t('export')} PDF`, icon: <FileDown />, onClick: () => nav(postPath(post.slug, '/print')) }]
            : []),
        ]
      : [],
    [post, user, prefs.uiLang],
  );

  if (post === undefined) return <p className="loading">{t('loading')}</p>;
  if (post === null || (group && !inTagGroup(post, group))) return <NotFound />;

  const dir = post.lang === 'he' ? 'rtl' : 'ltr';
  const openCount = comments.filter((c) => !c.parent_id && !c.resolved).length;

  function startComment() {
    if (!user) {
      toast(t('loginToComment'));
      return nav('/login', { state: { from: postPath(post!.slug) } });
    }
    if (!can.comment(user)) {
      toast(t('needCommenter'));
      return;
    }
    setPending(selAnchor);
    setDraft('');
    setSheet('comment');
  }

  return (
    <div className={`post-page${panel ? ' with-drawer' : ''}`}>
      <article className="post" dir={dir} lang={post.lang}>
        {post.cover_url && <img className="post-cover" src={post.cover_url} alt="" />}
        <header className="post-header">
          <h1 dir={titleDir(post.title, post.lang)}>{post.title}</h1>
          <PostMeta post={post} />
          <TagChips tags={post.tags} />
        </header>

        <PostContent
          ref={contentRef}
          html={post.content_html}
          lang={post.lang}
          comments={group ? [] : comments}
          showResolved={showResolved}
          activeComment={active}
          onOrphans={setOrphans}
          onHighlightClick={(id) => {
            setActive(id);
            setPanel(true);
          }}
        />

        <footer className="post-actions" dir={prefs.uiLang === 'he' ? 'rtl' : 'ltr'}>
          <LikeButton post={post} />
          <button type="button" className="pill" onClick={() => setSheet('share')}>
            <Share2 size={18} /> {t('share')}
          </button>
          {!group && (
            <button type="button" className="pill" onClick={() => setPanel((p) => !p)}>
              <MessagesSquare size={18} /> {openCount || ''} {t('comments')}
            </button>
          )}
          {can.export(user) && !group && (
            <button type="button" className="pill" onClick={() => setSheet('export')}>
              <Download size={18} /> {t('export')}
            </button>
          )}
          {can.editPost(user, post) && (
            <Link className="pill" to={postPath(post.slug, '/edit')}>
              <Pencil size={18} /> {t('edit')}
            </Link>
          )}
        </footer>
        {!group && <p className="hint center">{t('selectToComment')}</p>}
      </article>

      {group && <PublicComments postId={post.id} comments={comments} onChanged={loadComments} />}

      {selAnchor && !group && (
        <button type="button" className="sel-comment" onMouseDown={(e) => e.preventDefault()} onClick={startComment}>
          <MessageSquarePlus size={18} /> {t('addComment')}
        </button>
      )}

      {!group && (
      <CommentsPanel
        open={panel}
        onClose={() => setPanel(false)}
        comments={comments}
        orphans={orphans}
        active={active}
        setActive={setActive}
        showResolved={showResolved}
        setShowResolved={setShowResolved}
        onChanged={loadComments}
        postId={post.id}
      />
      )}

      <ShareSheet post={post} open={sheet === 'share'} onClose={() => setSheet(null)} />

      <Sheet open={sheet === 'export'} onClose={() => setSheet(null)} title={t('export')}>
        <div className="menu-list">
          <button type="button" onClick={() => nav(postPath(post.slug, '/print'))}>
            <FileDown /> {t('exportPdf')}
          </button>
          <button type="button" onClick={() => (downloadPostHtml(post, prefs.uiLang), setSheet(null))}>
            <FileCode2 /> {t('exportHtml')}
          </button>
          <button type="button" onClick={() => (downloadPostMarkdown(post), setSheet(null))}>
            <FileText /> {t('exportMd')}
          </button>
        </div>
        <p className="hint">{t('pdfHint')}</p>
      </Sheet>

      <Sheet open={sheet === 'comment'} onClose={() => setSheet(null)} title={t('addComment')}>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pending || !draft.trim()) return;
            try {
              const c = await api.addComment({ post_id: post.id, ...pending, body: draft });
              setSheet(null);
              window.getSelection()?.removeAllRanges();
              loadComments();
              setActive(c.id);
              setPanel(true);
            } catch (err) {
              toast(errorText(err, t));
            }
          }}
        >
          <blockquote dir="auto" className="quote-preview">
            {pending?.quote}
          </blockquote>
          <textarea dir="auto" rows={4} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('commentPlaceholder')} />
          <div className="row end">
            <button className="btn primary" disabled={!draft.trim()}>
              {t('addComment')}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
