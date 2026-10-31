import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ImagePlus, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { Lang, Post, PostDraft, PostStatus } from '../lib/types';
import { can, hasHebrew, postPath, titleDir } from '../lib/util';
import { RichEditor } from '../editor/RichEditor';
import { AudienceSheet } from '../components/Audience';
import { VIS_ICON } from '../components/visIcons';
import { NotFound } from './NotFound';
import { usePageTitle } from './usePageTitle';

const EMPTY: PostDraft = {
  title: '',
  excerpt: '',
  content_html: '',
  cover_url: null,
  tags: [],
  lang: 'he',
  status: 'draft',
  visibility: 'public',
  allowed_users: [],
  allowed_groups: [],
};

export function PostEditor() {
  const { slug } = useParams();
  const { t, user, authReady, prefs, toast } = useApp();
  const nav = useNavigate();
  const [orig, setOrig] = useState<Post | null | undefined>(slug ? undefined : null);
  const [draft, setDraft] = useState<PostDraft>({ ...EMPTY, lang: prefs.uiLang });
  const [dirty, setDirtyState] = useState(false);
  // Ref mirror so the navigation blocker sees "saved" synchronously before we redirect.
  const dirtyRef = useRef(false);
  const setDirty = (v: boolean) => {
    dirtyRef.current = v;
    setDirtyState(v);
  };
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [suggest, setSuggest] = useState<string[]>([]);
  const coverInput = useRef<HTMLInputElement>(null);
  usePageTitle(draft.title || t('newPost'));

  useEffect(() => {
    if (!slug) return;
    api.getPost(slug).then((p) => {
      setOrig(p);
      if (p)
        setDraft({
          id: p.id,
          slug: p.slug,
          title: p.title,
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
    });
  }, [slug]);

  useEffect(() => {
    api.listTags().then((tc) => setSuggest(tc.map((x) => x.tag))).catch(() => {});
  }, []);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(t('unsaved'))) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, t]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (!authReady || orig === undefined) return <p className="loading">{t('loading')}</p>;
  if (slug && orig === null) return <NotFound />;
  if (orig ? !can.editPost(user, orig) : !can.write(user)) {
    return (
      <div className="empty">
        <p>{t('forbidden')}</p>
        {!user && (
          <Link className="btn primary" to="/login" state={{ from: location.pathname }}>
            {t('login')}
          </Link>
        )}
      </div>
    );
  }

  const update = (p: Partial<PostDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const addTag = (raw: string) => {
    const tag = raw.replace(/^#/, '').trim();
    if (tag && !draft.tags.includes(tag)) update({ tags: [...draft.tags, tag] });
    setTagInput('');
  };

  async function save(status: PostStatus = draft.status) {
    if (!draft.title.trim()) return toast(t('titlePlaceholder'));
    setSaving(true);
    try {
      const saved = await api.savePost({ ...draft, tags: tagInput.trim() ? [...draft.tags, tagInput.trim()] : draft.tags, status });
      setTagInput('');
      setDirty(false);
      setOrig(saved);
      setDraft((d) => ({ ...d, id: saved.id, slug: saved.slug, status: saved.status }));
      toast(t('saved'));
      if (saved.slug !== slug) nav(postPath(saved.slug, '/edit'), { replace: true });
    } catch (e) {
      toast(errorText(e, t));
    } finally {
      setSaving(false);
    }
  }

  const Back = prefs.uiLang === 'he' ? ArrowRight : ArrowLeft;
  const dir = draft.lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="editor-page">
      <div className="editor-top">
        <button type="button" className="icon-btn" onClick={() => nav(orig ? postPath(orig.slug) : '/')} aria-label={t('cancel')}>
          <Back size={20} />
        </button>
        <span className={`badge${draft.status === 'published' ? ' ok' : ''}`}>{draft.status === 'published' ? t('published') : t('draft')}</span>
        <span className="grow" />
        {orig && (
          <button
            type="button"
            className="icon-btn danger"
            aria-label={t('delete')}
            onClick={async () => {
              if (!window.confirm(t('confirmDelete'))) return;
              await api.deletePost(orig.id).catch((e) => toast(errorText(e, t)));
              setDirty(false);
              nav('/');
            }}
          >
            <Trash2 size={18} />
          </button>
        )}
        <button type="button" className="btn ghost" disabled={saving} onClick={() => save()}>
          {saving ? t('saving') : t('save')}
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => save(draft.status === 'published' ? 'draft' : 'published')}>
          {draft.status === 'published' ? t('unpublish') : t('publish')}
        </button>
      </div>

      <div className="editor-meta" dir={dir}>
        {draft.cover_url ? (
          <div className="cover-edit">
            <img src={draft.cover_url} alt="" />
            <button type="button" className="icon-btn on-image" onClick={() => update({ cover_url: null })} aria-label={t('removeCover')}>
              <X size={18} />
            </button>
          </div>
        ) : (
          <button type="button" className="link-btn" onClick={() => coverInput.current?.click()}>
            <ImagePlus size={18} /> {t('cover')}
          </button>
        )}
        <input
          ref={coverInput}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              update({ cover_url: await api.uploadMedia(f) });
            } catch (err) {
              toast(errorText(err, t));
            }
          }}
        />
        <textarea
          className="title-input"
          rows={1}
          // Re-evaluated on every keystroke, so the field flips to the right as soon as Hebrew is typed.
          dir={titleDir(draft.title, draft.lang)}
          placeholder={t('titlePlaceholder')}
          value={draft.title}
          onChange={(e) => {
            const title = e.target.value.replace(/\n/g, ' ');
            // First characters of the title pick the post language when still empty.
            const langGuess: Lang | undefined = !draft.title && title ? (hasHebrew(title) ? 'he' : 'en') : undefined;
            update({ title, ...(langGuess && !orig ? { lang: langGuess } : {}) });
          }}
        />
        <div className="meta-row">
          <button type="button" className={`chip audience-chip vis-${draft.visibility}`} onClick={() => setAudienceOpen(true)}>
            {(() => {
              const Icon = VIS_ICON[draft.visibility];
              return <Icon size={16} />;
            })()}
            {t(`vis_${draft.visibility}`)}
            {draft.visibility === 'restricted' && <small>{draft.allowed_users.length + draft.allowed_groups.length}</small>}
          </button>
          <div className="seg small" role="radiogroup" aria-label={t('postLang')}>
            {(['he', 'en'] as const).map((l) => (
              <button type="button" key={l} className={draft.lang === l ? 'on' : ''} onClick={() => update({ lang: l })}>
                {l === 'he' ? t('hebrew') : t('english')}
              </button>
            ))}
          </div>
          <div className="tag-input">
            {draft.tags.map((tg) => (
              <span key={tg} className="tag on">
                #{tg}
                <button type="button" aria-label={t('delete')} onClick={() => update({ tags: draft.tags.filter((x) => x !== tg) })}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              dir="auto"
              list="tag-suggest"
              value={tagInput}
              enterKeyHint="done"
              placeholder={t('addTag')}
              onChange={(e) => (e.target.value.endsWith(',') ? addTag(e.target.value.slice(0, -1)) : setTagInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === 'Backspace' && !tagInput && draft.tags.length) update({ tags: draft.tags.slice(0, -1) });
              }}
              onBlur={() => tagInput && addTag(tagInput)}
            />
            <datalist id="tag-suggest">
              {suggest.filter((s) => !draft.tags.includes(s)).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>
        <details className="excerpt-edit">
          <summary>{t('excerpt')}</summary>
          {/* Same rule as the title: RTL when there's Hebrew (even if it starts with an English word), else the post's language. */}
          <textarea dir={titleDir(draft.excerpt, draft.lang)} rows={2} value={draft.excerpt} onChange={(e) => update({ excerpt: e.target.value })} />
        </details>
      </div>

      <div dir={dir}>
        <RichEditor
          initialHtml={draft.content_html}
          title={draft.title}
          lang={draft.lang}
          onChange={(html) => update({ content_html: html })}
          onSetCover={(url) => update({ cover_url: url })}
        />
      </div>
      <AudienceSheet
        open={audienceOpen}
        onClose={() => setAudienceOpen(false)}
        value={{ visibility: draft.visibility, allowed_users: draft.allowed_users, allowed_groups: draft.allowed_groups }}
        onChange={(v) => update(v)}
      />
    </div>
  );
}
