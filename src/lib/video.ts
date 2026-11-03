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
