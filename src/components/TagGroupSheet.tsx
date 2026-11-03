import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ImagePlus, Link2, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { Bilingual, Post, TagCount, TagGroup, TagGroupConfig, TagGroupDraft } from '../lib/types';
import { emptyTagGroupConfig, normalizeSearch, publicInTagGroup, validSiteSlug } from '../lib/util';
import { videoFromUrl } from '../lib/video';
import { CUSTOM_LANDINGS } from '../landings';
import { Sheet } from './Sheet';

type TextKey = 'name' | 'tagline' | 'about' | 'video_heading' | 'cta_title' | 'cta_label';

function blankDraft(): TagGroupDraft {
  return { slug: '', tags: [], landing: 'default', config: emptyTagGroupConfig() };
}

/** Create (group = null) or edit a tag group: its address, tags, landing page and the landing page's content. */
export function TagGroupSheet({
  open,
  group,
  posts,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: TagGroup | null;
  /** All posts (admin list), to show how many the chosen tags gather. */
  posts: Post[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, toast } = useApp();
  const [draft, setDraft] = useState<TagGroupDraft>(blankDraft);
  const [tagInput, setTagInput] = useState('');
  const [bgInput, setBgInput] = useState('');
  const [suggest, setSuggest] = useState<TagCount[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Refill the form each time the sheet opens (adjusted during render, not in an effect).
  const [shownFor, setShownFor] = useState<{ open: boolean; group: TagGroup | null }>({ open: false, group: null });
  if (shownFor.open !== open || shownFor.group !== group) {
    setShownFor({ open, group });
    if (open) {
      setDraft(group ? { id: group.id, slug: group.slug, tags: group.tags, landing: group.landing, config: group.config } : blankDraft());
      setTagInput('');
      setBgInput('');
    }
  }

  useEffect(() => {
    if (open) api.listTags().then(setSuggest).catch(() => {});
  }, [open]);

  const cfg = draft.config;
  const setCfg = (patch: Partial<TagGroupConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));
  const setText = (k: TextKey, lang: keyof Bilingual, v: string) => setCfg({ [k]: { ...cfg[k], [lang]: v } } as Partial<TagGroupConfig>);
  const addTag = (raw: string) => {
    const tag = raw.replace(/^#/, '').trim();
    if (tag && !draft.tags.includes(tag)) setDraft((d) => ({ ...d, tags: [...d.tags, tag] }));
    setTagInput('');
  };
  const addBackground = (url: string) => {
    const u = url.trim();
    if (u && !cfg.backgrounds.includes(u)) setCfg({ backgrounds: [...cfg.backgrounds, u] });
    setBgInput('');
  };

  // Suggestions under the field (not a <datalist>: phones, iOS Safari above all, often don't show one, least of
  // all inside a dialog). Typed text filters them; with nothing typed, the most-used tags.
  const typed = normalizeSearch(tagInput.replace(/^#/, ''));
  const suggestions = suggest
    .filter((s) => !draft.tags.includes(s.tag) && (!typed || normalizeSearch(s.tag).includes(typed)))
    .slice(0, typed ? 20 : 12);

  const slug = draft.slug.trim().toLowerCase();
  const slugOk = validSiteSlug(slug);
  const matching = posts.filter((p) => publicInTagGroup(p, draft)).length;
  const videoOk = !cfg.video_url || videoFromUrl(cfg.video_url)?.kind === 'embed';

  const bi = (k: TextKey, label: string, multiline = false) => (
    <fieldset className="bi-field">
      <legend>{label}</legend>
      {(['he', 'en'] as const).map((lang) =>
        multiline ? (
          <textarea
            key={lang}
            rows={4}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            lang={lang}
            value={cfg[k][lang]}
            placeholder={lang === 'he' ? 'עברית' : 'English'}
            aria-label={`${label} (${lang === 'he' ? 'עברית' : 'English'})`}
            onChange={(e) => setText(k, lang, e.target.value)}
          />
        ) : (
          <input
            key={lang}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            lang={lang}
            value={cfg[k][lang]}
            placeholder={lang === 'he' ? 'עברית' : 'English'}
            aria-label={`${label} (${lang === 'he' ? 'עברית' : 'English'})`}
            onChange={(e) => setText(k, lang, e.target.value)}
          />
        ),
      )}
    </fieldset>
  );

  return (
    <Sheet open={open} onClose={onClose} title={group ? t('tg_edit') : t('tg_new')} wide>
      <form
        className="form tg-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!slugOk) return;
          setBusy(true);
          try {
            const tags = tagInput.trim() ? [...draft.tags, tagInput.replace(/^#/, '').trim()] : draft.tags;
            await api.saveTagGroup({ ...draft, slug, tags });
            toast(t('saved'));
            onSaved();
            onClose();
          } catch (err) {
            toast(errorText(err, t));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3 className="tg-form-h">{t('tg_basics')}</h3>
        <label>
          {t('tg_address')}
          <span className="tg-slug" dir="ltr">
            <span className="muted">{location.host}/</span>
            <input
              dir="ltr"
              required
              value={draft.slug}
              placeholder="coach"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
            />
          </span>
          <small className={`hint${draft.slug && !slugOk ? ' error' : ''}`}>{t('tg_addressHelp')}</small>
        </label>
        {bi('name', t('tg_name'))}

        <label>
          {t('tags')}
          <div className="tag-input">
            {draft.tags.map((tg) => (
              <span key={tg} className="tag on" dir="auto">
                #{tg}
                <button type="button" aria-label={t('delete')} onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== tg) }))}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              dir="auto"
              value={tagInput}
              enterKeyHint="done"
              placeholder={t('addTag')}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === 'Backspace' && !tagInput && draft.tags.length) setDraft((d) => ({ ...d, tags: d.tags.slice(0, -1) }));
              }}
              onBlur={() => tagInput && addTag(tagInput)}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="tags tg-suggest" role="listbox" aria-label={t('tg_suggested')}>
              {suggestions.map(({ tag, count }) => (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="tag"
                  dir="auto"
                  // Keep focus in the field: otherwise its blur handler would first add the half-typed text as a tag.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(tag)}
                >
                  #{tag} <small>{count}</small>
                </button>
              ))}
            </div>
          )}
          <small className="hint">
            {t('tg_tagsHelp')} · <b>{matching}</b> {t('tg_postsMatch')}
          </small>
        </label>

        <label>
          {t('tg_landing')}
          <select value={draft.landing} onChange={(e) => setDraft((d) => ({ ...d, landing: e.target.value }))}>
            <option value="default">{t('tg_landingDefault')}</option>
            {Object.entries(CUSTOM_LANDINGS).map(([key, l]) => (
              <option key={key} value={key}>
                {l.label}
              </option>
            ))}
          </select>
          <small className="hint">{t('tg_landingHelp')}</small>
        </label>

        <h3 className="tg-form-h">{t('tg_landingContent')}</h3>
        {bi('tagline', t('tg_tagline'))}
        <label>
          {t('tg_video')}
          <input dir="ltr" type="url" value={cfg.video_url} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setCfg({ video_url: e.target.value })} />
          <small className={`hint${videoOk ? '' : ' error'}`}>{videoOk ? t('tg_videoHelp') : t('tg_videoUnrecognised')}</small>
        </label>
        {bi('video_heading', t('tg_videoHeading'))}
        {bi('about', t('tg_about'), true)}

        <fieldset className="bi-field">
          <legend>{t('tg_backgrounds')}</legend>
          <small className="hint">{t('tg_backgroundsHelp')}</small>
          {cfg.backgrounds.length > 0 && (
            <ul className="tg-bgs">
              {cfg.backgrounds.map((src, i) => (
                <li key={`${i}-${src}`}>
                  <img src={src} alt="" />
                  <span className="grow mono" dir="ltr">
                    {src.startsWith('data:') ? t('tg_uploadedImage') : src}
                  </span>
                  {i > 0 && (
                    <button
                      type="button"
                      className="icon-btn sm"
                      aria-label={t('tg_moveUp')}
                      title={t('tg_moveUp')}
                      onClick={() => {
                        const b = [...cfg.backgrounds];
                        [b[i - 1], b[i]] = [b[i], b[i - 1]];
                        setCfg({ backgrounds: b });
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                  )}
                  <button type="button" className="icon-btn sm danger" aria-label={t('delete')} onClick={() => setCfg({ backgrounds: cfg.backgrounds.filter((_, j) => j !== i) })}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="row">
            <input
              dir="ltr"
              type="url"
              value={bgInput}
              placeholder="https://…/image.jpg"
              aria-label={t('tg_imageUrl')}
              onChange={(e) => setBgInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addBackground(bgInput);
                }
              }}
            />
            <button type="button" className="icon-btn" aria-label={t('tg_addImageUrl')} title={t('tg_addImageUrl')} disabled={!bgInput.trim()} onClick={() => addBackground(bgInput)}>
              <Link2 size={18} />
            </button>
            <button type="button" className="btn ghost sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <ImagePlus size={16} /> {uploading ? t('preparing') : t('tg_upload')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setUploading(true);
                try {
                  addBackground(await api.uploadMedia(f));
                } catch (err) {
                  toast(errorText(err, t));
                } finally {
                  setUploading(false);
                }
              }}
            />
          </span>
        </fieldset>

        {bi('cta_title', t('tg_ctaTitle'))}
        {bi('cta_label', t('tg_ctaLabel'))}
        <label>
          {t('tg_ctaUrl')}
          <input dir="ltr" value={cfg.cta_url} placeholder="https://wa.me/972…  ·  mailto:…" onChange={(e) => setCfg({ cta_url: e.target.value })} />
        </label>
        <label className="tg-color">
          {t('tg_accent')}
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(cfg.accent) ? cfg.accent : '#e0a458'} onChange={(e) => setCfg({ accent: e.target.value })} />
        </label>

        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn primary" disabled={busy || !slugOk}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
