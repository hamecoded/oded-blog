import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Video } from 'lucide-react';
import { useApp } from '../lib/app';
import { useSite } from '../lib/site';
import type { Post } from '../lib/types';
import { postPath, titleDir } from '../lib/util';
import { videoFromUrl } from '../lib/video';
import { prefersReducedMotion } from './useLanding';

// Building blocks for landing pages. The default landing (DefaultLanding.tsx) is made of these, and a custom
// landing in src/landings can import them too.

/**
 * Full-screen background that sits behind the page: the images cross-fade as `active` changes, and drift
 * slower than the content while scrolling (parallax). With no images, an accent-colored gradient.
 */
export function ParallaxBackdrop({ images, active }: { images: string[]; active: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const on = () => {
      cancelAnimationFrame(frame);
      // A CSS variable, not React state: no re-render per scroll event.
      frame = requestAnimationFrame(() => el.style.setProperty('--py', String(window.scrollY)));
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', on);
    };
  }, []);
  const shown = images.length ? active % images.length : -1;
  return (
    <div ref={ref} className="lp-backdrop" aria-hidden>
      {images.length ? (
        images.map((src, i) => <div key={`${i}-${src}`} className={`lp-bg${i === shown ? ' on' : ''}`} style={{ backgroundImage: `url("${src.replace(/"/g, '%22')}")` }} />)
      ) : (
        <div className="lp-bg lp-bg-gradient on" />
      )}
      <div className="lp-scrim" />
    </div>
  );
}

/** A YouTube (or Vimeo) link as a 16:9 player. Empty or unrecognised link: the admin sees a placeholder, visitors nothing. */
export function VideoEmbed({ url, title }: { url: string; title?: string }) {
  const { t, user } = useApp();
  const v = url ? videoFromUrl(url) : null;
  if (!v || v.kind !== 'embed') {
    if (user?.role !== 'admin') return null;
    return (
      <div className="lp-video lp-video-empty">
        <Video size={36} />
        <p>{url ? t('tg_videoUnrecognised') : t('tg_videoPlaceholder')}</p>
      </div>
    );
  }
  return (
    <div className={`lp-video${v.vertical ? ' vertical' : ''}`}>
      <iframe
        src={v.src}
        title={title || t('tg_welcomeVideo')}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

/** Horizontally scrolling row of post cards with previous/next buttons (direction-aware). */
export function PostCarousel({ posts }: { posts: Post[] }) {
  const { t, prefs } = useApp();
  const { link } = useSite();
  const track = useRef<HTMLDivElement>(null);
  const rtl = prefs.uiLang === 'he';
  const step = (forward: boolean) => {
    const el = track.current;
    if (!el) return;
    // In right-to-left layout "forward" scrolls towards negative scrollLeft.
    const amount = el.clientWidth * 0.85 * (forward ? 1 : -1) * (rtl ? -1 : 1);
    el.scrollBy({ left: amount, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  return (
    <div className="lp-carousel">
      <div className="lp-track" ref={track} tabIndex={0} aria-label={t('articles')}>
        {posts.map((p) => (
          <Link key={p.id} to={link(postPath(p.slug))} className="lp-card" lang={p.lang}>
            <span className="lp-card-img">
              {p.cover_url ? <img src={p.cover_url} alt="" loading="lazy" /> : <span className="lp-card-letter">{p.title.slice(0, 1)}</span>}
            </span>
            <span className="lp-card-body">
              <strong dir={titleDir(p.title, p.lang)}>{p.title}</strong>
              {p.excerpt && <span dir={titleDir(p.excerpt, p.lang)}>{p.excerpt}</span>}
            </span>
          </Link>
        ))}
      </div>
      {posts.length > 1 && (
        <div className="lp-carousel-nav">
          <button type="button" className="lp-round" onClick={() => step(false)} aria-label={t('previous')}>
            <Prev size={22} />
          </button>
          <button type="button" className="lp-round" onClick={() => step(true)} aria-label={t('next')}>
            <Next size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
