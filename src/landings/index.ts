import { lazy, type ComponentType } from 'react';
import type { TagGroup } from '../lib/types';

/**
 * Custom landing pages for tag groups.
 *
 * Every tag group gets the default landing (src/site/DefaultLanding.tsx) unless /admin → Tag groups picks one of
 * these instead. To add one:
 *   1. Create src/landings/<Name>Landing.tsx with a default-exported component taking LandingProps.
 *   2. Register it below under a short key (the key is what's stored in tag_groups.landing).
 *   3. It appears in the "Landing page" menu of the tag group sheet.
 *
 * Inside, use the same tools as the default landing: useSite() and useGroupPosts() from lib/site, the blocks in
 * src/site/blocks.tsx (ParallaxBackdrop, VideoEmbed, PostCarousel), useActiveSection() from src/site/useLanding,
 * and the texts in group.config (pickText(group.config.tagline, prefs.uiLang)). The site header and footer are
 * drawn around it by SiteLayout; style it in index.css under "Tag-group sites".
 */
export interface LandingProps {
  group: TagGroup;
}

export interface CustomLanding {
  /** Shown in the admin menu. */
  label: string;
  Component: ComponentType<LandingProps>;
}

export const CUSTOM_LANDINGS: Record<string, CustomLanding> = {
  example: { label: 'Example: minimal', Component: lazy(() => import('./ExampleLanding')) },
};
