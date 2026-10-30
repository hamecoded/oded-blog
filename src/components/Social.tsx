import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Heart, Mail, Share2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { LikeInfo, Post } from '../lib/types';
import { absoluteUrl, postPath } from '../lib/util';
import { Sheet } from './Sheet';

export function LikeButton({ post }: { post: Post }) {
  const { t, user, toast } = useApp();
  const nav = useNavigate();
  const [info, setInfo] = useState<LikeInfo>({ count: 0, liked: false });

  useEffect(() => {
    api.getLikes(post.id).then(setInfo);
  }, [post.id, user?.id]);

  return (
    <button
      type="button"
      className={`pill${info.liked ? ' liked' : ''}`}
      aria-pressed={info.liked}
      onClick={async () => {
        if (!user) {
          toast(t('loginToLike'));
          return nav('/login', { state: { from: postPath(post.slug) } });
        }
        const optimistic = { liked: !info.liked, count: info.count + (info.liked ? -1 : 1) };
        setInfo(optimistic);
        try {
          setInfo(await api.toggleLike(post.id));
        } catch (e) {
          toast(errorText(e, t));
          setInfo(info);
        }
      }}
    >
      <Heart size={18} fill={info.liked ? 'currentColor' : 'none'} />
      <span>{info.count || t('like')}</span>
    </button>
  );
}

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);

const BRAND_ICONS = {
  facebook: svg('M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z'),
  x: svg('M17.7 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9L17.7 3zm-1.1 16.2h1.7L7.5 4.7H5.7l10.9 14.5z'),
  whatsapp: svg('M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.1.1.3 0 .5l-.4.6-.3.4c-.1.1-.2.3-.1.5.2.3.7 1.2 1.6 1.9 1 .9 1.9 1.2 2.2 1.3.2.1.4.1.5-.1l.8-1c.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.2.1.8-.1 1.4z'),
  telegram: svg('M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L6.6 13.3 2 11.9c-1-.3-1-1 .2-1.5L20.6 3.3c.8-.3 1.6.2 1.3 1z'),
  linkedin: svg('M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V21H9z'),
  reddit: svg('M22 12.1a2.2 2.2 0 0 0-3.7-1.6 10.8 10.8 0 0 0-5.8-1.8l1-4.6 3.2.7a1.6 1.6 0 1 0 .2-1l-3.6-.8c-.3 0-.5.1-.6.4L11.6 8.7a10.8 10.8 0 0 0-5.9 1.8 2.2 2.2 0 1 0-2.4 3.6v.6c0 3.3 3.9 6 8.7 6s8.7-2.7 8.7-6v-.6a2.2 2.2 0 0 0 1.3-2zM7.5 13.6a1.6 1.6 0 1 1 3.2 0 1.6 1.6 0 0 1-3.2 0zm8.9 4.2a5.8 5.8 0 0 1-4.4 1.3 5.8 5.8 0 0 1-4.4-1.3.4.4 0 0 1 .6-.6 5 5 0 0 0 3.8 1 5 5 0 0 0 3.8-1 .4.4 0 0 1 .6.6zm-.3-2.6a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z'),
  mail: <Mail size={22} />,
  gmail: svg('M20 4H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h2V9.2l6 4.5 6-4.5V20h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7.5L5.3 6.5h13.4L12 11.5z'),
};

export function ShareSheet({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const { t, toast } = useApp();
  const url = absoluteUrl(postPath(post.slug));
  const u = encodeURIComponent(url);
  const txt = encodeURIComponent(post.title);

  const targets: [string, React.ReactNode, string][] = [
    ['Facebook', BRAND_ICONS.facebook, `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['WhatsApp', BRAND_ICONS.whatsapp, `https://wa.me/?text=${txt}%20${u}`],
    ['X', BRAND_ICONS.x, `https://x.com/intent/post?url=${u}&text=${txt}`],
    ['Telegram', BRAND_ICONS.telegram, `https://t.me/share/url?url=${u}&text=${txt}`],
    ['LinkedIn', BRAND_ICONS.linkedin, `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['Reddit', BRAND_ICONS.reddit, `https://www.reddit.com/submit?url=${u}&title=${txt}`],
    ['Gmail', BRAND_ICONS.gmail, `https://mail.google.com/mail/?view=cm&su=${txt}&body=${u}`],
    ['Email', BRAND_ICONS.mail, `mailto:?subject=${txt}&body=${u}`],
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t('share')}>
      <div className="share-grid">
        {targets.map(([name, icon, href]) => (
          <a key={name} href={href} target="_blank" rel="noopener noreferrer" className={`share-btn s-${name.toLowerCase()}`}>
            {icon}
            <span>{name}</span>
          </a>
        ))}
      </div>
      <div className="menu-list">
        {'share' in navigator && (
          <button
            type="button"
            onClick={() => navigator.share({ title: post.title, text: post.excerpt, url }).catch(() => {})}
          >
            <Share2 /> {t('moreApps')}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(url).catch(() => {});
            toast(t('copied'));
          }}
        >
          <Copy /> {t('copyLink')}
        </button>
      </div>
      <p className="hint">{t('shareHint')}</p>
    </Sheet>
  );
}
