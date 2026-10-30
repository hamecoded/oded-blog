import DOMPurify from 'dompurify';

/** Only well-known video players may be embedded via iframe. */
const EMBED_HOSTS = [
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.tiktok.com',
  'www.facebook.com',
  'www.instagram.com',
  // audio players
  'w.soundcloud.com',
  'open.spotify.com',
  'player-widget.mixcloud.com',
  'archive.org',
];

export function isAllowedEmbed(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && EMBED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const el = node as Element;
    if (!isAllowedEmbed(el.getAttribute('src') ?? '')) el.remove();
  }
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'playsinline', 'controls', 'target', 'loading'],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
