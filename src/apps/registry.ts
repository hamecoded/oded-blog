import { lazy, type ComponentType } from 'react';
import type { AppEntry, AppManifest } from './types';

/**
 * Finds the apps. Every folder under src/apps that has an app.ts is listed in the store (/apps); its App.tsx,
 * if any, opens at /apps/<folder>. Nothing to register by hand: adding the folder is enough.
 * Folders starting with _ (like _template) are skipped. App code is only downloaded when someone opens that app.
 */
const manifests = import.meta.glob<AppManifest>(['./*/app.ts', '!./_*/app.ts'], { eager: true, import: 'default' });
const components = import.meta.glob<{ default: ComponentType }>(['./*/App.tsx', '!./_*/App.tsx']);

const idOf = (path: string) => path.split('/')[1];

export const APPS: AppEntry[] = Object.entries(manifests)
  .map(([path, m]) => {
    const id = idOf(path);
    const load = components[`./${id}/App.tsx`];
    return { ...m, id, Component: load ? lazy(load) : undefined };
  })
  .sort(
    (a, b) =>
      Number(!!b.featured) - Number(!!a.featured) ||
      (a.order ?? 100) - (b.order ?? 100) ||
      a.name.en.localeCompare(b.name.en),
  );

export function findApp(id: string | undefined): AppEntry | undefined {
  return APPS.find((a) => a.id === id);
}

/** Where the tile leads: inside the blog, out to another site, or nowhere yet. */
export function appTarget(a: AppEntry): { kind: 'internal'; to: string } | { kind: 'external'; href: string } | null {
  if (a.status === 'soon') return null;
  if (a.url) return { kind: 'external', href: a.url };
  if (a.Component) return { kind: 'internal', to: `/apps/${a.id}` };
  return null;
}

/** Updated within the last 30 days. */
export function isNew(a: AppEntry, now = Date.now()): boolean {
  if (!a.updated) return false;
  const t = Date.parse(a.updated);
  return !Number.isNaN(t) && now - t < 30 * 24 * 3600 * 1000;
}
