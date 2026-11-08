import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Bilingual } from '../lib/types';

/**
 * What every app folder says about itself, in src/apps/<id>/app.ts (see src/apps/README.md). The store page
 * (/apps) is built from these alone. The folder name is the app's id and its address: src/apps/todo → /apps/todo.
 *
 * Images: put the file in the app's folder and import it (`import cover from './cover.png'`), so Vite bundles
 * it and gives you its URL. A full https:// URL works too.
 */
export interface AppManifest {
  /** App name, on the tile and as the page title. */
  name: Bilingual;
  /** One short line under the name ("Plan your day"). */
  tagline?: Bilingual;
  /** One to three sentences on the tile. */
  description: Bilingual;
  /** Square icon: a lucide-react icon drawn white on the gradient, or an image URL (shown as is). */
  icon: LucideIcon | string;
  /** Wide picture across the top of the tile (screenshot or illustration, about 16:9). */
  image?: string;
  /** Gradient behind the icon, and behind the tile's top when there's no image. Defaults to the site accents. */
  colors?: [string, string];
  /** Store section, e.g. { en: 'Productivity', he: 'פרודוקטיביות' }; the store offers a filter per category. */
  category?: Bilingual;
  /** Short labels shown as chips. */
  tags?: string[];
  /** 'live' (default) can be opened; 'beta' can be opened and says Beta; 'soon' is listed greyed out. */
  status?: 'live' | 'beta' | 'soon';
  /** Shown on the tile, e.g. '1.0'. */
  version?: string;
  /** Last update, 'YYYY-MM-DD'; shown on the tile and used to sort the "new" badge (updated in the last 30 days). */
  updated?: string;
  /**
   * An app that lives somewhere else (a separate project or site). The tile opens this URL in a new tab instead
   * of /apps/<id>, and the folder needs no App.tsx.
   */
  url?: string;
  /** Show first, in a larger tile. */
  featured?: boolean;
  /** Store order, lowest first. Default 100; ties sort by name. */
  order?: number;
}

export interface AppEntry extends AppManifest {
  id: string;
  /** src/apps/<id>/App.tsx, loaded on first render; missing when the folder has no App.tsx. */
  Component?: LazyExoticComponent<ComponentType>;
}
