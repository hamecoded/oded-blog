// Static hosts without rewrite rules (GitHub Pages) serve 404.html for deep links
// like /posts/my-post — make it the app shell so client-side routing takes over.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
// Pages that outside services fetch directly get a real file, so they answer 200 rather than 404.
// /privacy is the privacy policy link in Google's sign-in setup.
copyFileSync('dist/index.html', 'dist/privacy.html');

// Each app's own page (/apps/<id> → apps/<id>.html), the app shell with the app's home-screen tags already in the
// <head>: its manifest (start_url /apps/<id>), touch icon and name. Phones read these when the page loads, not
// after the app swaps them in, so "Add to Home Screen" from a page loaded this way adds the app, at its own address.
// The files come from public/<id>-app/ (scripts/app-icons.mjs).
const shell = readFileSync('dist/index.html', 'utf8');
const base = /<link rel="manifest" href="([^"]*)manifest\.webmanifest"/.exec(shell)?.[1] ?? '/';
for (const dir of readdirSync('dist', { withFileTypes: true })) {
  const id = dir.isDirectory() && /^(.+)-app$/.exec(dir.name)?.[1];
  if (!id || !existsSync(`dist/${dir.name}/manifest.webmanifest`)) continue;
  const m = JSON.parse(readFileSync(`dist/${dir.name}/manifest.webmanifest`, 'utf8'));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = shell
    .replace(/<link rel="manifest" href="[^"]*"\s*\/?>/, `<link rel="manifest" href="${base}${dir.name}/manifest.webmanifest" />`)
    .replace(/<link rel="apple-touch-icon" href="[^"]*"\s*\/?>/, `<link rel="apple-touch-icon" href="${base}${dir.name}/icon-180.png" />`)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/?>/, `<meta name="apple-mobile-web-app-title" content="${esc(m.short_name)}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.short_name)}</title>`);
  mkdirSync('dist/apps', { recursive: true });
  writeFileSync(`dist/apps/${id}.html`, html);
}
// With a dist/apps folder, a host may send /apps on to /apps/: that answers with the plain shell (the store).
if (existsSync('dist/apps')) writeFileSync('dist/apps/index.html', shell);
