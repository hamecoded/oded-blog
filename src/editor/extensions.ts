import { mergeAttributes, Node } from '@tiptap/core';
import { renderMath } from '../lib/math';

export type MediaAlign = 'inline-start' | 'inline-end' | 'center' | 'full' | 'hero';
export const MEDIA_ALIGNS: MediaAlign[] = ['inline-start', 'inline-end', 'center', 'full', 'hero'];

function mediaAttrs(align: MediaAlign, width: number) {
  const sized = align !== 'full' && align !== 'hero';
  return {
    'data-align': align,
    'data-width': String(width),
    class: `media align-${align}`,
    // Inline width keeps sizing intact in exported HTML opened without our stylesheet.
    ...(sized ? { style: `width:${width}%` } : {}),
  };
}

const sharedMediaAttributes = {
  align: {
    default: 'center' as MediaAlign,
    parseHTML: (el: HTMLElement) => (el.getAttribute('data-align') as MediaAlign) || 'center',
    renderHTML: () => ({}),
  },
  width: {
    default: 100,
    parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-width')) || 100,
    renderHTML: () => ({}),
  },
};

/** <figure data-type="figure"><img><figcaption></figure> with alignment + width. */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      ...sharedMediaAttributes,
      src: { default: '', parseHTML: (el) => el.querySelector('img')?.getAttribute('src') ?? el.getAttribute('src') ?? '', renderHTML: () => ({}) },
      alt: { default: '', parseHTML: (el) => el.querySelector('img')?.getAttribute('alt') ?? el.getAttribute('alt') ?? '', renderHTML: () => ({}) },
      caption: { default: '', parseHTML: (el) => el.querySelector('figcaption')?.textContent ?? '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="figure"]' }, { tag: 'img[src]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, alt, caption, align, width } = node.attrs;
    const img = ['img', { src, alt, loading: 'lazy' }] as const;
    const attrs = mergeAttributes(HTMLAttributes, { 'data-type': 'figure' }, mediaAttrs(align, width));
    return caption ? ['figure', attrs, img, ['figcaption', {}, caption]] : ['figure', attrs, img];
  },
});

export interface VideoSource {
  kind: 'file' | 'embed';
  src: string;
  vertical: boolean;
}

/** Turn a pasted link into a privacy-friendly embed URL, or null if unsupported. */
export function videoFromUrl(raw: string): VideoSource | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (/\.(mp4|webm|mov|m4v|ogg)$/i.test(u.pathname)) return { kind: 'file', src: u.href, vertical: false };
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? u.pathname.slice(1)
        : (u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]);
    if (!id) return null;
    const start = u.searchParams.get('t')?.replace(/s$/, '');
    return {
      kind: 'embed',
      src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${parseInt(start, 10)}` : ''}`,
      vertical: u.pathname.includes('/shorts/'),
    };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.match(/(\d+)/)?.[1];
    return id ? { kind: 'embed', src: `https://player.vimeo.com/video/${id}`, vertical: false } : null;
  }
  if (host === 'tiktok.com') {
    const id = u.pathname.match(/video\/(\d+)/)?.[1];
    return id ? { kind: 'embed', src: `https://www.tiktok.com/embed/v2/${id}`, vertical: true } : null;
  }
  return null;
}

/** Responsive video: uploaded/linked file (<video>) or provider embed (<iframe>). */
export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      ...sharedMediaAttributes,
      src: { default: '', parseHTML: (el) => el.getAttribute('data-src') ?? '', renderHTML: () => ({}) },
      kind: { default: 'file', parseHTML: (el) => el.getAttribute('data-kind') ?? 'file', renderHTML: () => ({}) },
      vertical: { default: false, parseHTML: (el) => el.getAttribute('data-vertical') === 'true', renderHTML: () => ({}) },
      caption: { default: '', parseHTML: (el) => el.querySelector('figcaption')?.textContent ?? '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="video"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, kind, vertical, align, width, caption } = node.attrs;
    const attrs = mergeAttributes(
      HTMLAttributes,
      { 'data-type': 'video', 'data-kind': kind, 'data-src': src, 'data-vertical': String(vertical) },
      mediaAttrs(align, width),
    );
    const player =
      kind === 'embed'
        ? [
            'div',
            { class: vertical ? 'embed vertical' : 'embed' },
            [
              'iframe',
              {
                src,
                loading: 'lazy',
                frameborder: '0',
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
                allowfullscreen: 'true',
              },
            ],
          ]
        : ['video', { src, controls: 'true', playsinline: 'true', preload: 'metadata' }];
    return caption ? ['figure', attrs, player, ['figcaption', {}, caption]] : ['figure', attrs, player];
  },
});

/**
 * Inline (or display) equation stored as LaTeX:
 * <span data-type="math" data-latex="a^2+b^2" dir="ltr">a^2+b^2</span>
 * The source stays readable in exports; KaTeX renders it on screen.
 */
export const MathInline = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '', parseHTML: (el) => el.getAttribute('data-latex') ?? el.textContent ?? '' },
      display: { default: false, parseHTML: (el) => el.getAttribute('data-display') === 'true' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math"]' }];
  },

  renderHTML({ node }) {
    const { latex, display } = node.attrs;
    return [
      'span',
      {
        'data-type': 'math',
        'data-latex': latex,
        ...(display ? { 'data-display': 'true' } : {}),
        class: display ? 'math math-display' : 'math',
        dir: 'ltr',
      },
      latex,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.dir = 'ltr';
      const paint = (n: typeof node) => {
        dom.className = n.attrs.display ? 'math math-display' : 'math';
        renderMath(dom, n.attrs.latex, n.attrs.display);
      };
      paint(node);
      return {
        dom,
        update: (n) => {
          if (n.type !== node.type) return false;
          paint(n);
          return true;
        },
      };
    };
  },
});

export interface AudioSource {
  kind: 'file' | 'embed';
  src: string;
  provider: 'file' | 'soundcloud' | 'spotify' | 'mixcloud' | 'archive';
}

/** Turn a pasted audio link into an embeddable player, or null if unsupported. */
export function audioFromUrl(raw: string): AudioSource | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(u.pathname)) return { kind: 'file', src: u.href, provider: 'file' };
  if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
    return {
      kind: 'embed',
      provider: 'soundcloud',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.origin + u.pathname)}&color=%234f46e5&visual=false&show_comments=false`,
    };
  }
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/\/(track|episode|show|album|playlist)\/([A-Za-z0-9]+)/);
    return m ? { kind: 'embed', provider: 'spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}` } : null;
  }
  if (host === 'mixcloud.com') {
    return { kind: 'embed', provider: 'mixcloud', src: `https://player-widget.mixcloud.com/widget/iframe/?hide_cover=1&mini=1&feed=${encodeURIComponent(u.pathname)}` };
  }
  if (host === 'archive.org') {
    const id = u.pathname.match(/\/(?:details|embed)\/([^/]+)/)?.[1];
    return id ? { kind: 'embed', provider: 'archive', src: `https://archive.org/embed/${id}` } : null;
  }
  return null;
}

/** Audio player: recorded/uploaded file (<audio>) or provider embed (SoundCloud, Spotify, …). */
export const Audio = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      ...sharedMediaAttributes,
      src: { default: '', parseHTML: (el) => el.getAttribute('data-src') ?? '', renderHTML: () => ({}) },
      kind: { default: 'file', parseHTML: (el) => el.getAttribute('data-kind') ?? 'file', renderHTML: () => ({}) },
      provider: { default: 'file', parseHTML: (el) => el.getAttribute('data-provider') ?? 'file', renderHTML: () => ({}) },
      caption: { default: '', parseHTML: (el) => el.querySelector('figcaption')?.textContent ?? '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="audio"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, kind, provider, align, width, caption } = node.attrs;
    const attrs = mergeAttributes(
      HTMLAttributes,
      { 'data-type': 'audio', 'data-kind': kind, 'data-src': src, 'data-provider': provider },
      mediaAttrs(align, width),
      { class: 'audio' },
    );
    const player =
      kind === 'embed'
        ? ['div', { class: `audio-embed p-${provider}` }, ['iframe', { src, loading: 'lazy', frameborder: '0', allow: 'autoplay; encrypted-media' }]]
        : ['audio', { src, controls: 'true', preload: 'metadata' }];
    return caption ? ['figure', attrs, player, ['figcaption', {}, caption]] : ['figure', attrs, player];
  },
});
