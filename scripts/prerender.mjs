// Social previews (Facebook, WhatsApp, LinkedIn, X…). Their crawlers don't run JavaScript, so a single-page
// app shows them only index.html's generic tags. After `vite build`, this writes one static page per public
// post (dist/posts/<slug>.html) with that post's title, summary, image and URL in Open Graph / Twitter tags.
// The page is otherwise the normal app shell, so people who open it get the full post.
//
// Reads published posts with the public (anon) key, so row-level security decides what is included:
// private and restricted posts never get a page. Without Supabase (demo mode) only the site tags are set.
// New posts need a rebuild to get their page — see DEPLOYMENT.md § Sharing on social networks.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE_NAME = 'oded.me';
const SITE_DESCRIPTION = 'Bilingual Hebrew / English blog';
const DEFAULT_IMAGE = 'og-default.png';

/** Build-time values: the environment first (CI), then .env (local builds). */
function readEnv() {
  const file = join(ROOT, '.env');
  const fromFile = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) fromFile[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return (k) => process.env[k] || fromFile[k] || '';
}
const env = readEnv();

/** Absolute site address, e.g. https://oded.me/ — SITE_URL, else the one `npm run setup` saved. */
function siteUrl() {
  let url = env('SITE_URL');
  if (!url) {
    try {
      url = JSON.parse(readFileSync(join(ROOT, '.deploy.json'), 'utf8')).siteUrl ?? '';
    } catch {
      /* no deploy settings */
    }
  }
  return url ? url.replace(/\/?$/, '/') : '';
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const textOf = (html) => decode(String(html ?? '').replace(/<figure[\s\S]*?<\/figure>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,!?;:)])/g, '$1').trim();

function clip(s, max = 200) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > max * 0.6 ? sp : max)}…`;
}

/** Best preview image: cover → first image in the post → YouTube thumbnail → `fallback` (default: the site image). */
function imageFor(post, site, fallback) {
  const web = (u) => (u && /^https?:\/\//.test(u) ? u : null);
  if (web(post.cover_url)) return web(post.cover_url);
  const html = post.content_html ?? '';
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) if (web(decode(m[1]))) return decode(m[1]);
  const yt = html.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/);
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  return fallback || (site ? `${site}${DEFAULT_IMAGE}` : null);
}

/** index.html with the given title/description and social tags. */
function page(shell, { title, docTitle = title, description, url, image, type, locale, extra = [] }) {
  const tags = [
    ['og:site_name', SITE_NAME],
    ['og:type', type],
    ['og:title', title],
    ['og:description', description],
    url && ['og:url', url],
    image && ['og:image', image],
    image && ['og:image:alt', title],
    ['og:locale', locale],
    ...extra,
  ]
    .filter(Boolean)
    .map(([p, v]) => `    <meta property="${p}" content="${esc(v)}" />`);
  const twitter = [
    ['twitter:card', image ? 'summary_large_image' : 'summary'],
    ['twitter:title', title],
    ['twitter:description', description],
    image && ['twitter:image', image],
  ]
    .filter(Boolean)
    .map(([n, v]) => `    <meta name="${n}" content="${esc(v)}" />`);
  const head = [...tags, ...twitter, url && `    <link rel="canonical" href="${esc(url)}" />`].filter(Boolean).join('\n');
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(docTitle)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `${head}\n  </head>`);
}

async function fetchPosts(url, key) {
  const select = 'slug,title,excerpt,content_html,cover_url,lang,tags,published_at,updated_at,author:profiles!posts_author_id_fkey(display_name)';
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/posts?select=${select}&status=eq.published&order=published_at.desc`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchTagGroups(url, key) {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/tag_groups?select=slug,tags,config`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Tag-group sites (/<slug>): a page for the landing (/<slug>.html and /<slug>/index.html) and for each of the
 * group's posts (/<slug>/posts/<post>.html), carrying the site's own name instead of the blog's. Besides the
 * previews, this makes those addresses answer 200 on GitHub Pages rather than going through 404.html.
 */
async function prerenderTagGroups(posts) {
  let groups;
  try {
    groups = await fetchTagGroups(sbUrl, sbKey);
  } catch (e) {
    console.warn(`prerender: no tag groups (${e.message}) — run supabase/schema.sql again if they're new.`);
    return;
  }
  const text = (b) => (b?.he || b?.en || '').trim();
  let pages = 0;
  for (const g of groups) {
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(g.slug ?? '')) continue;
    const c = g.config ?? {};
    const name = text(c.name) || g.slug;
    const description = clip(text(c.tagline) || text(c.about)) || name;
    const cover = (c.backgrounds ?? []).find((u) => /^https?:\/\//.test(u));
    const tags = g.tags ?? [];
    const landing = page(shell, {
      title: name,
      description,
      url: site && `${site}${g.slug}`,
      image: cover || (site && `${site}${DEFAULT_IMAGE}`),
      type: 'website',
      locale: 'he_IL',
    }).replace(/property="og:site_name" content="[^"]*"/, `property="og:site_name" content="${esc(name)}"`);
    writeFileSync(join(DIST, `${g.slug}.html`), landing);
    mkdirSync(join(DIST, g.slug), { recursive: true });
    writeFileSync(join(DIST, g.slug, 'index.html'), landing);
    pages++;
    // The site's other pages: articles, tags (each of the group's tags) and search. Without these they'd be
    // served by 404.html, which carries oded.me's name and image, and share as an empty card. GitHub Pages
    // redirects /<slug>/posts to /<slug>/posts/ (the folder exists), so the articles page is posts/index.html.
    const sub = (path, title) =>
      page(shell, {
        title: `${title} · ${name}`,
        description,
        url: site && `${site}${g.slug}/${path}`,
        image: cover || (site && `${site}${DEFAULT_IMAGE}`),
        type: 'website',
        locale: 'he_IL',
      }).replace(/property="og:site_name" content="[^"]*"/, `property="og:site_name" content="${esc(name)}"`);
    const write = (file, html) => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      pages++;
    };
    write(join(DIST, g.slug, 'posts', 'index.html'), sub('posts', 'מאמרים'));
    write(join(DIST, g.slug, 'search.html'), sub('search', 'חיפוש'));
    write(join(DIST, g.slug, 'tags', 'index.html'), sub('tags', 'תגיות'));
    for (const t of tags) {
      if (!t || /[/\\]/.test(t) || t.startsWith('.')) continue;
      write(join(DIST, g.slug, 'tags', `${t}.html`), sub(`tags/${encodeURIComponent(t)}`, `#${t}`));
    }
    for (const p of posts) {
      if (!p.slug || /[/\\]/.test(p.slug) || p.slug.startsWith('.')) continue;
      if (!(p.tags ?? []).some((t) => tags.includes(t))) continue;
      const file = join(DIST, g.slug, 'posts', `${p.slug}.html`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        page(shell, {
          title: p.title,
          docTitle: `${p.title} · ${name}`,
          description: clip(p.excerpt?.trim() || textOf(p.content_html)) || description,
          url: site && `${site}${g.slug}/posts/${encodeURIComponent(p.slug)}`,
          // A post without images of its own shows the group's image, not oded.me's.
          image: imageFor(p, site, cover),
          type: 'article',
          locale: p.lang === 'en' ? 'en_US' : 'he_IL',
          extra: [...(p.tags ?? []).filter((t) => tags.includes(t)).slice(0, 6).map((t) => ['article:tag', t])],
        })
          .replace(/property="og:site_name" content="[^"]*"/, `property="og:site_name" content="${esc(name)}"`)
          .replace('<html lang="he" dir="rtl"', p.lang === 'en' ? '<html lang="en" dir="ltr"' : '<html lang="he" dir="rtl"'),
      );
      pages++;
    }
  }
  if (groups.length) console.log(`prerender: ${pages} page${pages === 1 ? '' : 's'} for ${groups.length} tag group${groups.length === 1 ? '' : 's'}.`);
}

const shellFile = join(DIST, 'index.html');
if (!existsSync(shellFile)) {
  console.error('prerender: dist/index.html is missing — run vite build first.');
  process.exit(1);
}
const shell = readFileSync(shellFile, 'utf8');
const site = siteUrl();
if (!site) console.warn('prerender: no site address (SITE_URL or .deploy.json) — previews will lack links and images.');

writeFileSync(
  shellFile,
  page(shell, {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: site,
    image: site && `${site}${DEFAULT_IMAGE}`,
    type: 'website',
    locale: 'he_IL',
  }),
);

const sbUrl = env('VITE_SUPABASE_URL');
const sbKey = env('VITE_SUPABASE_ANON_KEY');
if (!sbUrl || !sbKey) {
  console.log('prerender: demo mode — site preview tags only.');
} else {
  try {
    const posts = await fetchPosts(sbUrl, sbKey);
    let count = 0;
    for (const p of posts) {
      if (!p.slug || /[/\\]/.test(p.slug) || p.slug.startsWith('.')) continue;
      count++;
      const url = site && `${site}posts/${encodeURIComponent(p.slug)}`;
      const description = clip(p.excerpt?.trim() || textOf(p.content_html)) || SITE_DESCRIPTION;
      const extra = [
        p.published_at && ['article:published_time', p.published_at],
        p.updated_at && ['article:modified_time', p.updated_at],
        p.author?.display_name && ['article:author', p.author.display_name],
        ...(p.tags ?? []).slice(0, 6).map((t) => ['article:tag', t]),
      ].filter(Boolean);
      const file = join(DIST, 'posts', `${p.slug}.html`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        page(shell, {
          title: p.title,
          docTitle: `${p.title} · ${SITE_NAME}`,
          description,
          url,
          image: imageFor(p, site),
          type: 'article',
          locale: p.lang === 'en' ? 'en_US' : 'he_IL',
          extra,
        }).replace('<html lang="he" dir="rtl"', p.lang === 'en' ? '<html lang="en" dir="ltr"' : '<html lang="he" dir="rtl"'),
      );
    }
    console.log(`prerender: social previews for ${count} public post${count === 1 ? '' : 's'}.`);
    await prerenderTagGroups(posts);
  } catch (e) {
    // Never fail the deploy over previews: the site works the same, links just share generically.
    console.warn(`prerender: could not read posts (${e.message}) — site preview tags only.`);
  }
}
