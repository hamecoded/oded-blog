import { useEffect, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  RemoveFormatting,
  Sigma,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  Video as VideoIcon,
  ImagePlay,
  Captions,
  ArrowLeftRight,
  Mic,
  Music,
  Clapperboard,
} from 'lucide-react';
import { useApp } from '../lib/app';
import type { TKey } from '../lib/i18n';
import { ensureFonts, FONTS } from '../lib/fonts';
import { Audio, Figure, MathInline, MEDIA_ALIGNS, Video, type MediaAlign } from './extensions';
import { RecorderSheet, type RecordKind } from './Recorder';
import { CaptionDialog, LinkDialog, MathDialog, MediaDialog } from './dialogs';

type Panel = 'text' | 'para' | 'align' | 'font' | 'insert' | 'media' | null;
type Dialog = 'image' | 'video' | 'audio' | 'link' | 'math' | 'caption' | null;

const SIZES = [14, 16, 18, 20, 24, 28, 32, 40];

/** Keeps the floating bar above the iOS on-screen keyboard. */
function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.setProperty('--kb-inset', '0px');
    };
  }, []);
}

export function RichEditor({
  initialHtml,
  title,
  lang,
  onChange,
  onSetCover,
}: {
  initialHtml: string;
  title: string;
  lang: 'he' | 'en';
  onChange: (html: string) => void;
  onSetCover: (url: string) => void;
}) {
  const { t } = useApp();
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [recording, setRecording] = useState<RecordKind | null>(null);
  useKeyboardInset();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TextStyle,
      FontFamily,
      FontSize,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      Placeholder.configure({ placeholder: t('ed_placeholder') }),
      Figure,
      Video,
      Audio,
      MathInline,
    ],
    textDirection: 'auto',
    content: initialHtml,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'prose editor-surface', lang, dir: lang === 'he' ? 'rtl' : 'ltr' } },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    ensureFonts(FONTS.map((f) => f.family));
  }, []);

  useEffect(() => {
    editor?.setOptions({ editorProps: { attributes: { class: 'prose editor-surface', lang, dir: lang === 'he' ? 'rtl' : 'ltr' } } });
  }, [editor, lang]);

  const selected = editor && editor.state.selection instanceof NodeSelection ? editor.state.selection.node : null;
  const mediaSelected = selected && ['figure', 'video', 'audio'].includes(selected.type.name) ? selected : null;
  const mathSelected = selected?.type.name === 'math' ? selected : null;

  // Show contextual media controls as soon as an image/video is tapped.
  useEffect(() => {
    if (mediaSelected) setPanel('media');
    else setPanel((p) => (p === 'media' ? null : p));
  }, [mediaSelected]);

  if (!editor) return null;
  const chain = () => editor.chain().focus();
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const insertMedia = (a: {
    src: string;
    alt: string;
    caption: string;
    video?: { kind: string; src: string; vertical: boolean };
    audio?: { kind: string; src: string; provider: string };
  }) => {
    if (a.audio) {
      chain().insertContent({ type: 'audio', attrs: { ...a.audio, caption: a.caption, align: 'center', width: 100 } }).run();
    } else if (a.video) {
      chain().insertContent({ type: 'video', attrs: { src: a.video.src, kind: a.video.kind, vertical: a.video.vertical, caption: a.caption, align: 'center', width: 100 } }).run();
    } else {
      chain().insertContent({ type: 'figure', attrs: { src: a.src, alt: a.alt, caption: a.caption, align: 'center', width: 100 } }).run();
    }
  };

  const setMediaAttrs = (attrs: Record<string, unknown>) => {
    if (!mediaSelected) return;
    const pos = (editor.state.selection as NodeSelection).from;
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...mediaSelected.attrs, ...attrs });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      return true;
    }).run();
  };

  const alignIcon: Record<MediaAlign, ReactNode> = {
    'inline-start': <span className="al-ico al-start" />,
    'inline-end': <span className="al-ico al-end" />,
    center: <span className="al-ico al-center" />,
    full: <span className="al-ico al-full" />,
    hero: <span className="al-ico al-hero" />,
  };
  const alignLabel: Record<MediaAlign, TKey> = {
    'inline-start': 'al_inlineStart',
    'inline-end': 'al_inlineEnd',
    center: 'al_center',
    full: 'al_full',
    hero: 'al_hero',
  };

  const curFont = (editor.getAttributes('textStyle').fontFamily as string | undefined)?.replace(/['"]/g, '').split(',')[0];
  const curSize = editor.getAttributes('textStyle').fontSize as string | undefined;

  return (
    <div className="rich-editor">
      <EditorContent editor={editor} />

      <div className="cmdbar-wrap" onMouseDown={(e) => e.preventDefault()}>
        {panel && (
          <div className="cmd-panel" role="toolbar">
            {panel === 'text' && (
              <>
                <Btn icon={<Bold />} label={t('ed_bold')} active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
                <Btn icon={<Italic />} label={t('ed_italic')} active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
                <Btn icon={<Underline />} label={t('ed_underline')} active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
                <Btn icon={<Strikethrough />} label={t('ed_strike')} active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
                <Btn icon={<Highlighter />} label={t('ed_highlight')} active={editor.isActive('highlight')} onClick={() => chain().toggleHighlight().run()} />
                <Btn icon={<Code />} label={t('ed_code')} active={editor.isActive('code')} onClick={() => chain().toggleCode().run()} />
                <Btn icon={<Link2 />} label={t('ed_link')} active={editor.isActive('link')} onClick={() => setDialog('link')} />
                <Btn icon={<RemoveFormatting />} label={t('ed_clear')} onClick={() => chain().unsetAllMarks().run()} />
              </>
            )}
            {panel === 'para' && (
              <>
                <Btn icon={<Pilcrow />} label={t('ed_p')} active={editor.isActive('paragraph')} onClick={() => chain().setParagraph().run()} />
                <Btn icon={<Heading2 />} label={t('ed_h2')} active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
                <Btn icon={<Heading3 />} label={t('ed_h3')} active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
                <Btn icon={<List />} label={t('ed_bullet')} active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
                <Btn icon={<ListOrdered />} label={t('ed_ordered')} active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
                <Btn icon={<Quote />} label={t('ed_quote')} active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
                <Btn icon={<Minus />} label={t('ed_hr')} onClick={() => chain().setHorizontalRule().run()} />
              </>
            )}
            {panel === 'align' && (
              <>
                <Btn icon={<AlignRight />} label={t('ed_right')} active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()} />
                <Btn icon={<AlignCenter />} label={t('ed_center')} active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()} />
                <Btn icon={<AlignLeft />} label={t('ed_left')} active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()} />
                <Btn icon={<AlignJustify />} label={t('ed_justify')} active={editor.isActive({ textAlign: 'justify' })} onClick={() => chain().setTextAlign('justify').run()} />
                <span className="sep" />
                <Btn icon={<span className="txt-ico">‏א←</span>} label={t('ed_rtl')} onClick={() => chain().setTextDirection('rtl').run()} />
                <Btn icon={<span className="txt-ico">A→</span>} label={t('ed_ltr')} onClick={() => chain().setTextDirection('ltr').run()} />
                <Btn icon={<ArrowLeftRight />} label={t('ed_auto')} onClick={() => chain().setTextDirection('auto').run()} />
              </>
            )}
            {panel === 'font' && (
              <div className="font-panel">
                <div className="chips scroll">
                  <button type="button" className={`chip${!curFont ? ' on' : ''}`} onClick={() => chain().unsetFontFamily().run()}>
                    {t('ed_default')}
                  </button>
                  {FONTS.map((f) => (
                    <button
                      type="button"
                      key={f.family}
                      className={`chip${curFont === f.family ? ' on' : ''}`}
                      style={{ fontFamily: `'${f.family}'` }}
                      onClick={() => chain().setFontFamily(`'${f.family}'`).run()}
                    >
                      {f.label.he}
                    </button>
                  ))}
                </div>
                <div className="chips scroll">
                  <span className="chip-label">{t('ed_size')}</span>
                  <button type="button" className={`chip${!curSize ? ' on' : ''}`} onClick={() => chain().unsetFontSize().run()}>
                    {t('ed_default')}
                  </button>
                  {SIZES.map((s) => (
                    <button type="button" key={s} className={`chip${curSize === `${s}px` ? ' on' : ''}`} onClick={() => chain().setFontSize(`${s}px`).run()}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {panel === 'insert' && (
              <>
                <Btn icon={<ImageIcon />} label={t('ed_image')} onClick={() => setDialog('image')} wide />
                <Btn icon={<VideoIcon />} label={t('ed_video')} onClick={() => setDialog('video')} wide />
                <Btn icon={<Music />} label={t('ed_audio')} onClick={() => setDialog('audio')} wide />
                <Btn icon={<Clapperboard />} label={t('rec_video')} onClick={() => setRecording('video')} wide />
                <Btn icon={<Mic />} label={t('rec_audio')} onClick={() => setRecording('audio')} wide />
                <Btn icon={<Sigma />} label={t('ed_math')} onClick={() => setDialog('math')} wide />
                <Btn icon={<Link2 />} label={t('ed_link')} onClick={() => setDialog('link')} wide />
                <Btn icon={<Minus />} label={t('ed_hr')} onClick={() => chain().setHorizontalRule().run()} wide />
              </>
            )}
            {panel === 'media' && mediaSelected && (
              <div className="media-panel">
                <div className="chips scroll" hidden={mediaSelected.type.name === 'audio'}>
                  {MEDIA_ALIGNS.map((a) => (
                    <button
                      type="button"
                      key={a}
                      className={`chip align-chip${mediaSelected.attrs.align === a ? ' on' : ''}`}
                      onClick={() => setMediaAttrs({ align: a })}
                    >
                      {alignIcon[a]}
                      {t(alignLabel[a])}
                    </button>
                  ))}
                </div>
                <div className="chips scroll">
                  {mediaSelected.type.name !== 'audio' && !['full', 'hero'].includes(mediaSelected.attrs.align) && (
                    <>
                      <span className="chip-label">{t('ed_width')}</span>
                      {[25, 33, 50, 75, 100].map((w) => (
                        <button type="button" key={w} className={`chip${mediaSelected.attrs.width === w ? ' on' : ''}`} onClick={() => setMediaAttrs({ width: w })}>
                          {w}%
                        </button>
                      ))}
                    </>
                  )}
                  <button type="button" className="chip" onClick={() => setDialog('caption')}>
                    <Captions size={16} /> {t('ed_caption')}
                  </button>
                  {mediaSelected.type.name === 'figure' && (
                    <button type="button" className="chip" onClick={() => onSetCover(mediaSelected.attrs.src)}>
                      <ImagePlay size={16} /> {t('ed_setCover')}
                    </button>
                  )}
                  <button type="button" className="chip danger" onClick={() => chain().deleteSelection().run()}>
                    <Trash2 size={16} /> {t('ed_remove')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="cmdbar" role="toolbar" aria-label={t('menu')}>
          <Btn icon={<Undo2 />} label={t('ed_undo')} disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
          <Btn icon={<Redo2 />} label={t('ed_redo')} disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
          <span className="sep" />
          <Btn icon={<Bold />} label={t('ed_text')} active={panel === 'text'} onClick={() => toggle('text')} />
          <Btn icon={<Pilcrow />} label={t('ed_paragraph')} active={panel === 'para'} onClick={() => toggle('para')} />
          <Btn icon={<AlignCenter />} label={t('ed_align')} active={panel === 'align'} onClick={() => toggle('align')} />
          <Btn icon={<Type />} label={t('ed_font')} active={panel === 'font'} onClick={() => toggle('font')} />
          {mediaSelected && <Btn icon={<ImageIcon />} label={t('ed_media')} active={panel === 'media'} onClick={() => toggle('media')} />}
          {mathSelected && <Btn icon={<Sigma />} label={t('ed_math')} active onClick={() => setDialog('math')} />}
          <Btn icon={<Plus />} label={t('ed_insert')} active={panel === 'insert'} onClick={() => toggle('insert')} primary />
        </div>
      </div>

      <MediaDialog kind="image" open={dialog === 'image'} onClose={() => setDialog(null)} onInsert={insertMedia} />
      <MediaDialog kind="video" open={dialog === 'video'} onClose={() => setDialog(null)} onInsert={insertMedia} />
      <MediaDialog kind="audio" open={dialog === 'audio'} onClose={() => setDialog(null)} onInsert={insertMedia} />
      <RecorderSheet
        kind={recording ?? 'video'}
        open={recording !== null}
        defaultTitle={title}
        onClose={() => setRecording(null)}
        onDone={(m) =>
          m.kind === 'audio'
            ? insertMedia({ src: m.src, alt: '', caption: m.caption, audio: { kind: 'file', src: m.src, provider: 'file' } })
            : insertMedia({ src: m.src, alt: '', caption: m.caption, video: { kind: m.dest === 'youtube' ? 'embed' : 'file', src: m.src, vertical: false } })
        }
      />
      <LinkDialog
        open={dialog === 'link'}
        initial={(editor.getAttributes('link').href as string) ?? ''}
        onClose={() => setDialog(null)}
        onApply={(href) => {
          if (!href) chain().extendMarkRange('link').unsetLink().run();
          else if (editor.state.selection.empty && !editor.isActive('link'))
            chain().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
          else chain().extendMarkRange('link').setLink({ href }).run();
        }}
      />
      <MathDialog
        open={dialog === 'math'}
        initial={mathSelected ? { latex: mathSelected.attrs.latex, display: mathSelected.attrs.display } : { latex: '', display: false }}
        onClose={() => setDialog(null)}
        onApply={(v) => {
          if (mathSelected) {
            const pos = (editor.state.selection as NodeSelection).from;
            editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, v), true)).run();
          } else chain().insertContent({ type: 'math', attrs: v }).insertContent(' ').run();
        }}
      />
      <CaptionDialog
        open={dialog === 'caption'}
        initial={{
          caption: mediaSelected?.attrs.caption ?? '',
          alt: mediaSelected?.attrs.alt ?? '',
          hasAlt: mediaSelected?.type.name === 'figure',
        }}
        onClose={() => setDialog(null)}
        onApply={(v) => setMediaAttrs(mediaSelected?.type.name === 'figure' ? v : { caption: v.caption })}
      />
    </div>
  );
}

function Btn({
  icon,
  label,
  onClick,
  active,
  disabled,
  primary,
  wide,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  primary?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`cmd-btn${active ? ' on' : ''}${primary ? ' primary' : ''}${wide ? ' wide' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
      {wide && <span>{label}</span>}
    </button>
  );
}

export type { Editor };
