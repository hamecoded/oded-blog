#!/usr/bin/env node
/**
 * Home-screen files for every app in src/apps: `public/<id>-app/` gets icon-180.png (iPhone), icon-192.png and
 * icon-512.png (Android / desktop install) and manifest.webmanifest (name, start_url /apps/<id>, full screen).
 * The icon is the app's lucide icon in white on its two-colour gradient, read from its app.ts (`icon`, `colors`,
 * `name`). The app page swaps these in while it's open (src/apps/homeScreen.ts), so "Add to Home Screen" adds the
 * app itself.
 *
 * Run after adding an app or changing its icon or colours:  node scripts/app-icons.mjs [id …]
 * Needs Playwright's Chromium to draw the PNGs (npx playwright install chromium, once). Commit the output.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as lucide from 'lucide-react';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url).pathname;
const appsDir = join(root, 'src/apps');
const only = process.argv.slice(2);

const ids = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(appsDir, d.name, 'app.ts')))
  .map((d) => d.name)
  .filter((id) => !only.length || only.includes(id));

/** What the script needs from an app.ts, read as text (it's TypeScript importing images). */
function readApp(id) {
  const src = readFileSync(join(appsDir, id, 'app.ts'), 'utf8');
  const icon = /\bicon:\s*([A-Z]\w*)/.exec(src)?.[1];
  const colors = /\bcolors:\s*\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/.exec(src);
  const en = /\bname:\s*\{\s*en:\s*'([^']*)'/.exec(src)?.[1] ?? id;
  const he = /\bname:\s*\{[^}]*he:\s*'([^']*)'/.exec(src)?.[1] ?? en;
  return { id, icon, c1: colors?.[1] ?? '#4f46e5', c2: colors?.[2] ?? '#db2777', en, he };
}

const svg = (app, n) => {
  const Icon = app.icon && lucide[app.icon];
  const glyph = Icon ? renderToStaticMarkup(createElement(Icon, { size: 24 })).replace(/<svg[^>]*>/, '').replace('</svg>', '') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${app.c1}"/><stop offset="1" stop-color="${app.c2}"/></linearGradient></defs>
<rect width="100" height="100" fill="url(#g)"/>
<g transform="translate(22 22) scale(2.333)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
};

const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const id of ids) {
  const app = readApp(id);
  const out = join(root, 'public', `${id}-app`);
  mkdirSync(out, { recursive: true });
  for (const n of [180, 192, 512]) {
    await page.setViewportSize({ width: n, height: n });
    await page.setContent(`<html><body style="margin:0">${svg(app, n)}</body></html>`);
    await page.screenshot({ path: join(out, `icon-${n}.png`) });
  }
  // Paths are relative to the manifest (public/<id>-app/), so they hold under any base path.
  const manifest = {
    id: `../apps/${id}`,
    name: `${app.en} · oded.me`,
    short_name: app.he,
    start_url: `../apps/${id}`,
    scope: `../apps/${id}`,
    display: 'standalone',
    dir: 'auto',
    lang: 'he',
    background_color: '#14151b',
    theme_color: app.c1,
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  writeFileSync(join(out, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${id}: public/${id}-app/ (${app.icon ?? 'no icon'}, ${app.c1} → ${app.c2})`);
}
await browser.close();
