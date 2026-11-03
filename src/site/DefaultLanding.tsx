import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, Play } from 'lucide-react';
import { useApp } from '../lib/app';
import { useGroupPosts, useSite } from '../lib/site';
import type { TagGroup } from '../lib/types';
import { pickText, tagPath } from '../lib/util';
import { videoFromUrl } from '../lib/video';
import { usePageTitle } from '../pages/usePageTitle';
import { ParallaxBackdrop, PostCarousel, VideoEmbed } from './blocks';
import { useActiveSection } from './useLanding';

/**
 * The landing page every tag group gets unless a custom one is chosen: a promotional one-pager — hero, welcome
 * video, about, a carousel of the group's posts, its topics and a call to action — over a parallax background
 * that shifts image as each section scrolls into view.
 */
export function DefaultLanding({ group }: { group: TagGroup }) {
  const { t, prefs, user } = useApp();
  const { link, siteName } = useSite();
  const posts = useGroupPosts(group, 24);
  const root = useRef<HTMLDivElement>(null);
  const active = useActiveSection(root, [posts === null]);
  usePageTitle();

  const c = group.config;
  const L = prefs.uiLang;
  const tx = (k: 'tagline' | 'about' | 'video_heading' | 'cta_title' | 'cta_label') => pickText(c[k], L);
  const hasVideo = !!c.video_url && videoFromUrl(c.video_url)?.kind === 'embed';
  // Without configured images the backdrop is a gradient in the accent color. (Post covers often carry text
  // of their own, so they make poor backgrounds.)
  const images = c.backgrounds;
  const Fwd = L === 'he' ? ArrowLeft : ArrowRight;
  const cta = c.cta_url && tx('cta_label') ? { href: c.cta_url, label: tx('cta_label') } : null;
  const external = (href: string) => /^(https?:|mailto:|tel:)/.test(href);

  let bg = 0;
  return (
    <div className="landing" ref={root}>
      <ParallaxBackdrop images={images} active={active} />

      <section className="lp-hero" data-bg={bg++}>
        <div className="lp-hero-inner">
          {group.tags.length > 0 && (
            <p className="lp-eyebrow" dir="auto">
              {group.tags.slice(0, 4).join(' · ')}
            </p>
          )}
          <h1 className="lp-title" dir="auto">
            {siteName}
          </h1>
          {tx('tagline') && (
            <p className="lp-tagline" dir="auto">
              {tx('tagline')}
            </p>
          )}
          <div className="lp-actions">
            {cta &&
              (external(cta.href) ? (
                <a className="btn primary lp-btn" href={cta.href} target={cta.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
                  {cta.label}
                </a>
              ) : (
                <Link className="btn primary lp-btn" to={link(cta.href)}>
                  {cta.label}
                </Link>
              ))}
            {hasVideo ? (
              <a className="btn lp-btn lp-btn-glass" href="#lp-video">
                <Play size={18} /> {t('tg_watch')}
              </a>
            ) : (
              <Link className="btn lp-btn lp-btn-glass" to={link('/posts')}>
                {t('tg_readArticles')} <Fwd size={18} />
              </Link>
            )}
          </div>
        </div>
        <a className="lp-scroll" href="#lp-next" aria-label={t('tg_scrollDown')}>
          <ArrowDown size={22} />
        </a>
      </section>

      <span id="lp-next" />
      {/* No video yet: the admin sees where it will go; visitors don't see the section at all. */}
      {(hasVideo || user?.role === 'admin') && (
        <section className="lp-section" id="lp-video" data-bg={bg++}>
          <div className="lp-panel lp-narrow">
            {(tx('video_heading') || hasVideo) && <h2 dir="auto">{tx('video_heading') || t('tg_welcomeVideo')}</h2>}
            <VideoEmbed url={c.video_url} title={tx('video_heading')} />
          </div>
        </section>
      )}

      {tx('about') && (
        <section className="lp-section" data-bg={bg++}>
          <div className="lp-panel lp-narrow lp-about" dir="auto">
            {tx('about')
              .split(/\n{2,}/)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>
        </section>
      )}

      <section className="lp-section" data-bg={bg++}>
        <div className="lp-panel lp-wide">
          <div className="lp-row">
            <h2>{t('tg_latest')}</h2>
            <Link to={link('/posts')} className="lp-more">
              {t('tg_allArticles')} <Fwd size={16} />
            </Link>
          </div>
          {posts === null ? <p className="lp-muted">{t('loading')}</p> : posts.length ? <PostCarousel posts={posts} /> : <p className="lp-muted">{t('noResults')}</p>}
          {group.tags.length > 1 && (
            <div className="lp-topics">
              {group.tags.map((tag) => (
                <Link key={tag} to={link(tagPath(tag))} className="lp-chip" dir="auto">
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {(cta || tx('cta_title')) && (
        <section className="lp-section lp-cta" data-bg={bg++}>
          <div className="lp-panel lp-narrow center">
            <h2 dir="auto">{tx('cta_title') || siteName}</h2>
            {cta &&
              (external(cta.href) ? (
                <a className="btn primary lp-btn" href={cta.href} target={cta.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
                  {cta.label}
                </a>
              ) : (
                <Link className="btn primary lp-btn" to={link(cta.href)}>
                  {cta.label}
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
