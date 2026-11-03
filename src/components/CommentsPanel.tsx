import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CornerDownLeft, RotateCcw, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { Comment } from '../lib/types';
import { can, commentAuthorName, formatDate } from '../lib/util';

export function CommentsPanel({
  open,
  onClose,
  comments,
  orphans,
  active,
  setActive,
  showResolved,
  setShowResolved,
  onChanged,
  postId,
}: {
  open: boolean;
  onClose: () => void;
  comments: Comment[];
  orphans: Set<string>;
  active: string | null;
  setActive: (id: string | null) => void;
  showResolved: boolean;
  setShowResolved: (v: boolean) => void;
  onChanged: () => void;
  postId: string;
}) {
  const { t, user, prefs, toast } = useApp();
  const listRef = useRef<HTMLDivElement>(null);
  const roots = comments.filter((c) => !c.parent_id && (showResolved || !c.resolved));

  useEffect(() => {
    if (open && active) listRef.current?.querySelector(`[data-thread="${active}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, active]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast(errorText(e, t));
    }
  }

  return (
    <aside className={`drawer${open ? ' open' : ''}`} aria-hidden={!open} aria-label={t('comments')}>
      <header className="drawer-head">
        <h2>
          {t('comments')} <span className="count">{comments.filter((c) => !c.resolved && !c.parent_id).length}</span>
        </h2>
        <label className="check small">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          {t('showResolved')}
        </label>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}>
          <X size={20} />
        </button>
      </header>
      <div className="drawer-body" ref={listRef}>
        {!roots.length && <p className="hint">{t('noComments')}</p>}
        {roots.map((c) => (
          <div
            key={c.id}
            data-thread={c.id}
            className={`thread${active === c.id ? ' active' : ''}${c.resolved ? ' resolved' : ''}`}
            onClick={() => {
              setActive(c.id);
              document.querySelector(`mark[data-cid="${c.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }}
          >
            {c.quote && (
              <blockquote dir="auto" className={orphans.has(c.id) ? 'orphan' : ''}>
                {c.quote.length > 160 ? `${c.quote.slice(0, 160)}…` : c.quote}
                {orphans.has(c.id) && <small> · {t('orphaned')}</small>}
              </blockquote>
            )}
            <CommentItem c={c} />
            {comments
              .filter((r) => r.parent_id === c.id)
              .map((r) => (
                <CommentItem key={r.id} c={r} reply />
              ))}
            <div className="thread-actions">
              {can.resolve(user) || c.user_id === user?.id ? (
                <button type="button" className="link-btn" onClick={(e) => (e.stopPropagation(), act(() => api.setCommentResolved(c.id, !c.resolved)))}>
                  {c.resolved ? <RotateCcw size={14} /> : <Check size={14} />} {c.resolved ? t('reopen') : t('resolve')}
                </button>
              ) : null}
            </div>
            {can.comment(user) && active === c.id && <ReplyBox onSend={(body) => act(() => api.addComment({ post_id: postId, parent_id: c.id, quote: '', prefix: '', suffix: '', body }))} />}
          </div>
        ))}
        {!user && (
          <p className="hint">
            <Link to="/login">{t('loginToComment')}</Link>
          </p>
        )}
        {user && !can.comment(user) && (
          <p className="hint">
            <Link to="/account">{t('needCommenter')}</Link>
          </p>
        )}
      </div>
    </aside>
  );

  function CommentItem({ c, reply }: { c: Comment; reply?: boolean }) {
    const mine = c.user_id === user?.id;
    return (
      <div className={`comment${reply ? ' reply' : ''}`}>
        <div className="comment-head">
          <span className="avatar sm">{commentAuthorName(c).slice(0, 1)}</span>
          <strong dir="auto">{commentAuthorName(c)}</strong>
          <time className="muted">{formatDate(c.created_at, prefs.uiLang)}</time>
          {(mine || user?.role === 'admin') && (
            <button
              type="button"
              className="icon-btn sm"
              aria-label={t('delete')}
              onClick={(e) => {
                e.stopPropagation();
                act(() => api.deleteComment(c.id));
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <p dir="auto">{c.body}</p>
      </div>
    );
  }
}

function ReplyBox({ onSend }: { onSend: (body: string) => void }) {
  const { t } = useApp();
  const [body, setBody] = useState('');
  return (
    <form
      className="reply-box"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        onSend(body.trim());
        setBody('');
      }}
    >
      <input dir="auto" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('reply')} />
      <button className="icon-btn" aria-label={t('reply')} disabled={!body.trim()}>
        <CornerDownLeft size={18} />
      </button>
    </form>
  );
}
