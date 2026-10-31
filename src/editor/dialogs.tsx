import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { errorText, useApp } from '../lib/app';
import { api } from '../lib/api';
import { renderMath } from '../lib/math';
import { audioFromUrl, videoFromUrl, type AudioSource, type VideoSource } from './extensions';

export function MediaDialog({
  kind,
  open,
  onClose,
  onInsert,
}: {
  kind: 'image' | 'video' | 'audio';
  open: boolean;
  onClose: () => void;
  onInsert: (a: { src: string; alt: string; caption: string; video?: VideoSource; audio?: AudioSource }) => void;
}) {
  const { t } = useApp();
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Start empty each time the dialog opens (adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(false);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setUrl('');
      setAlt('');
      setCaption('');
      setFile(null);
      setErr('');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      setBusy(true);
      if (file) {
        const src = await api.uploadMedia(file);
        onInsert({
          src,
          alt,
          caption,
          video: kind === 'video' ? { kind: 'file', src, vertical: false } : undefined,
          audio: kind === 'audio' ? { kind: 'file', src, provider: 'file' } : undefined,
        });
      } else if (url.trim()) {
        if (kind === 'audio') {
          const a = audioFromUrl(url);
          if (!a) return setErr(t('ed_badEmbed'));
          onInsert({ src: a.src, alt, caption, audio: a });
        } else if (kind === 'video') {
          const v = videoFromUrl(url);
          if (!v) return setErr(t('ed_badEmbed'));
          onInsert({ src: v.src, alt, caption, video: v });
        } else {
          onInsert({ src: url.trim(), alt, caption });
        }
      } else return;
      onClose();
    } catch (e2) {
      setErr(errorText(e2, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={kind === 'image' ? t('ed_image') : kind === 'video' ? t('ed_video') : t('ed_audio')}>
      <form className="form" onSubmit={submit}>
        <label className="file-drop">
          <input
            type="file"
            accept={`${kind}/*`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span>{file ? file.name : t('ed_upload')}</span>
        </label>
        <label>
          {kind === 'image' ? t('ed_url') : kind === 'video' ? t('ed_videoUrl') : t('ed_audioUrl')}
          <input type="url" dir="ltr" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" disabled={!!file} />
        </label>
        {kind === 'image' && (
          <label>
            {t('ed_alt')}
            <input dir="auto" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </label>
        )}
        <label>
          {t('ed_caption')}
          <input dir="auto" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </label>
        {err && <p className="error">{err}</p>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn primary" disabled={busy || (!file && !url.trim())}>
            {busy ? t('ed_uploading') : t('ed_insertBtn')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function LinkDialog({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onApply: (href: string | null) => void;
}) {
  const { t } = useApp();
  const [href, setHref] = useState(initial);
  const [shownFor, setShownFor] = useState<{ open: boolean; initial: string }>({ open: false, initial });
  if (shownFor.open !== open || shownFor.initial !== initial) {
    setShownFor({ open, initial });
    if (open) setHref(initial);
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('ed_link')}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = href.trim();
          onApply(v ? (/^(https?:|mailto:|\/)/.test(v) ? v : `https://${v}`) : null);
          onClose();
        }}
      >
        <label>
          {t('ed_linkUrl')}
          <input type="url" dir="ltr" inputMode="url" autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://" />
        </label>
        <div className="row end">
          {initial && (
            <button type="button" className="btn ghost danger" onClick={() => (onApply(null), onClose())}>
              {t('ed_removeLink')}
            </button>
          )}
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Sheet>
  );
}

const MATH_SNIPPETS = [
  ['x^{2}', 'x²'],
  ['\\frac{a}{b}', 'a/b'],
  ['\\sqrt{x}', '√x'],
  ['\\sum_{i=1}^{n}', 'Σ'],
  ['\\int_{a}^{b}', '∫'],
  ['\\lim_{x \\to \\infty}', 'lim'],
  ['\\alpha', 'α'],
  ['\\pi', 'π'],
  ['\\le', '≤'],
  ['\\neq', '≠'],
  ['\\cdot', '·'],
  ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '[ ]'],
];

export function MathDialog({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: { latex: string; display: boolean };
  onClose: () => void;
  onApply: (v: { latex: string; display: boolean }) => void;
}) {
  const { t } = useApp();
  const [latex, setLatex] = useState(initial.latex);
  const [display, setDisplay] = useState(initial.display);
  const preview = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const [shownFor, setShownFor] = useState({ open: false, initial });
  if (shownFor.open !== open || shownFor.initial !== initial) {
    setShownFor({ open, initial });
    if (open) {
      setLatex(initial.latex);
      setDisplay(initial.display);
    }
  }

  useEffect(() => {
    if (preview.current) renderMath(preview.current, latex || '\\;', true);
  }, [latex, open]);

  function insertSnippet(s: string) {
    const el = area.current;
    if (!el) return setLatex((l) => l + s);
    const { selectionStart: a, selectionEnd: b } = el;
    const next = latex.slice(0, a) + s + latex.slice(b);
    setLatex(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + s.length, a + s.length);
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('ed_math')}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (latex.trim()) onApply({ latex: latex.trim(), display });
          onClose();
        }}
      >
        <div className="math-preview" ref={preview} dir="ltr" />
        <div className="chips" dir="ltr">
          {MATH_SNIPPETS.map(([s, label]) => (
            <button type="button" key={s} className="chip" onClick={() => insertSnippet(s)}>
              {label}
            </button>
          ))}
        </div>
        <label>
          {t('ed_latex')}
          <textarea
            ref={area}
            dir="ltr"
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            placeholder="e^{i\pi}+1=0"
            className="mono"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
          {t('ed_display')}
        </label>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn primary" disabled={!latex.trim()}>
            {t('ed_insertBtn')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function CaptionDialog({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: { caption: string; alt: string; hasAlt: boolean };
  onClose: () => void;
  onApply: (v: { caption: string; alt: string }) => void;
}) {
  const { t } = useApp();
  const [caption, setCaption] = useState(initial.caption);
  const [alt, setAlt] = useState(initial.alt);
  const [shownFor, setShownFor] = useState({ open: false, initial });
  if (shownFor.open !== open || shownFor.initial !== initial) {
    setShownFor({ open, initial });
    if (open) {
      setCaption(initial.caption);
      setAlt(initial.alt);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('ed_caption')}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onApply({ caption, alt });
          onClose();
        }}
      >
        <label>
          {t('ed_caption')}
          <input dir="auto" autoFocus value={caption} onChange={(e) => setCaption(e.target.value)} />
        </label>
        {initial.hasAlt && (
          <label>
            {t('ed_alt')}
            <input dir="auto" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </label>
        )}
        <div className="row end">
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Sheet>
  );
}
