import { useState } from 'react';
import { CornerDownLeft, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { Comment } from '../lib/types';
import { can, commentAuthorName, formatDate, savedGuestName, saveGuestName } from '../lib/util';

/**
 * Comments on a tag-group site: a plain list under the post, open to visitors who give a name instead of
 * signing in. (The main blog uses the select-to-comment drawer, CommentsPanel, which needs an account.)
 */
export function PublicComments({ postId, comments, onChanged }: { postId: string; comments: Comment[]; onChanged: () => void }) {
  const { t, prefs, user } = useApp();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const roots = comments.filter((c) => !c.parent_id);
  // Visitors write under a name. A signed-in account keeps its role: one that may not comment (a reader)
  // sees the comments but no form.
  const canWrite = !user || can.comment(user);

  return (
    <section className="public-comments" dir={prefs.uiLang === 'he' ? 'rtl' : 'ltr'} aria-labelledby="pc-title">
      <h2 id="pc-title">
        {t('publicComments')} {comments.length > 0 && <span className="count">{comments.length}</span>}
      </h2>
      {!roots.length && <p className="hint">{t('beFirstToComment')}</p>}
      <ol className="pc-list">
        {roots.map((c) => (
          <li key={c.id} className="pc-thread">
            <CommentItem c={c} onChanged={onChanged} />
            {comments
              .filter((r) => r.parent_id === c.id)
              .map((r) => (
                <CommentItem key={r.id} c={r} reply onChanged={onChanged} />
              ))}
            {!canWrite ? null : replyTo === c.id ? (
              <CommentForm
                postId={postId}
                parentId={c.id}
                compact
                onDone={() => {
                  setReplyTo(null);
                  onChanged();
                }}
              />
            ) : (
              <button type="button" className="link-btn pc-reply" onClick={() => setReplyTo(c.id)}>
                <CornerDownLeft size={14} /> {t('reply')}
              </button>
            )}
          </li>
        ))}
      </ol>
      {canWrite && (
        <>
          <h3 className="pc-form-title">{t('leaveComment')}</h3>
          <CommentForm postId={postId} onDone={onChanged} />
        </>
      )}
    </section>
  );
}

function CommentItem({ c, reply, onChanged }: { c: Comment; reply?: boolean; onChanged: () => void }) {
  const { t, user, prefs, toast } = useApp();
  const name = commentAuthorName(c);
  const canDelete = user?.role === 'admin' || (!!user && c.user_id === user.id);
  return (
    <div className={`comment${reply ? ' reply' : ''}`}>
      <div className="comment-head">
        <span className="avatar sm" aria-hidden>
          {name.slice(0, 1)}
        </span>
        <strong dir="auto">{name}</strong>
        <time className="muted" dateTime={c.created_at}>
          {formatDate(c.created_at, prefs.uiLang)}
        </time>
        {canDelete && (
          <button
            type="button"
            className="icon-btn sm"
            aria-label={t('delete')}
            onClick={async () => {
              try {
                await api.deleteComment(c.id);
                onChanged();
              } catch (e) {
                toast(errorText(e, t));
              }
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {c.quote && (
        <blockquote dir="auto" className="pc-quote">
          {c.quote.length > 160 ? `${c.quote.slice(0, 160)}…` : c.quote}
        </blockquote>
      )}
      <p dir="auto">{c.body}</p>
    </div>
  );
}

function CommentForm({ postId, parentId, compact, onDone }: { postId: string; parentId?: string; compact?: boolean; onDone: () => void }) {
  const { t, user, toast } = useApp();
  const [name, setName] = useState(savedGuestName);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const needsName = !user;
  const ready = !!body.trim() && (!needsName || !!name.trim());

  return (
    <form
      className={`form pc-form${compact ? ' compact' : ''}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        try {
          await api.addComment({
            post_id: postId,
            parent_id: parentId ?? null,
            quote: '',
            prefix: '',
            suffix: '',
            body: body.trim(),
            guest_name: needsName ? name.trim() : undefined,
          });
          if (needsName) saveGuestName(name.trim());
          setBody('');
          onDone();
        } catch (err) {
          toast(errorText(err, t));
        } finally {
          setBusy(false);
        }
      }}
    >
      {needsName && (
        <input
          dir="auto"
          value={name}
          maxLength={60}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
          placeholder={t('yourName')}
          aria-label={t('yourName')}
          required
        />
      )}
      <textarea
        dir="auto"
        rows={compact ? 2 : 4}
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={compact ? t('reply') : t('commentPlaceholder')}
        aria-label={compact ? t('reply') : t('commentPlaceholder')}
        required
      />
      <div className="row end">
        {needsName && !compact && <small className="hint grow">{t('guestCommentNote')}</small>}
        <button className="btn primary sm" disabled={!ready || busy}>
          {compact ? t('reply') : t('postComment')}
        </button>
      </div>
    </form>
  );
}
