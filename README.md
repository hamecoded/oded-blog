# oded.me — bilingual Hebrew / English blog

A mobile-first blog with full Hebrew/RTL support, a rich-text editor, roles and audiences,
inline review comments, likes and sharing, search by text or tags, video and audio
recording, and PDF / HTML / Markdown export.

The site is a **static single-page app**: plain HTML/JS/CSS files that any free static host
can serve. Accounts, data and uploaded files live in **Supabase** (free tier). Recorded
videos can optionally go to **YouTube**.

**Contents**

1. [Quick start (no setup)](#1-quick-start-no-setup)
2. [Features](#2-features)
3. [Tech stack](#3-tech-stack)
4. [Services used](#4-services-used)
5. [How it fits together](#5-how-it-fits-together)
6. [Where and how data is saved](#6-where-and-how-data-is-saved)
7. [Configuration (environment variables)](#7-configuration-environment-variables)
8. [Deployment, step by step](#8-deployment-step-by-step)
9. [Local development](#9-local-development)
10. [Backups, moving data, updates](#10-backups-moving-data-updates)
11. [Project layout](#11-project-layout)
12. [Security notes and limits](#12-security-notes-and-limits)

**Deploying?** Run `npm run setup` for a guided walkthrough, and see
[DEPLOYMENT.md](DEPLOYMENT.md) for releases, migrations and troubleshooting.

---

## 1. Quick start (no setup)

```bash
npm install
npm run dev          # http://localhost:5173
```

Without Supabase keys, the app runs in **demo mode**. Everything is stored in your browser,
so you can try every feature before deploying anything.

Sign in with **`admin` / `admin`**. This is the prebuilt manager account, and its email is
`odedsme@gmail.com`. A warning bar stays up until you change that password on **/account**.
Everyone who signs up starts as a **commenter** and can ask the manager for any other role.

---

## 2. Features

| Area | What you get |
| --- | --- |
| Languages | Hebrew and English interface (switch it from the floating menu). Each post has its own language, and each paragraph detects its own direction (`dir="auto"`), so mixed Hebrew/English lines display correctly. |
| Editor | Bold, italic, underline, strikethrough, highlight, code, links, headings, lists, quotes and dividers. Align left, center, right or justify. Set direction per paragraph (RTL, LTR or auto). Font and size per selection. Undo and redo. On phones the command bar floats above the keyboard. |
| Media | Images and videos by **upload** or **link** (YouTube, Vimeo, TikTok, or `.mp4`/`.webm` files). Layouts: wrap at start, wrap at end, center, full width, or **title banner**. Width 25–100%, caption, alt text, and "use as cover". Everything is responsive. |
| Video blog | **Record video** in the editor with the front or back camera (or use the iPhone camera app). Upload it to **your YouTube channel** or save it in the blog. |
| Audio | **Record audio** with a live level meter; it's saved in the blog with a built-in player. You can also embed **SoundCloud, Spotify, Mixcloud or Archive.org** links. |
| Math | Inline or display LaTeX equations with a live KaTeX preview. |
| Code snippets | Insert → Code snippet. Always left-to-right, Tab indents, pick a language or let it auto-detect. Posts show syntax colours, the language and a Copy button. |
| Fonts | Twelve Google Fonts that support Hebrew, including the handwriting fonts **Playpen Sans Hebrew**, **Amatic SC** and Karantina. Readers choose font, size, line spacing and theme. |
| Audience | When creating or editing a post, **Who can see this** sets it to **Public**, **Registered users** (anyone signed in), **Private** (only you and the manager) or **specific people and/or groups**. Each author has **their own groups**: create one right from that sheet (**+ New group**) or in **/admin → Groups**. The manager sees and manages everyone's groups. |
| Roles | `admin` (manager), `editor` (author), `reviewer`, `commenter`, `reader`. New sign-ups are commenters. Users request other roles on **/account**, and the manager approves them in **/admin → Role requests**. |
| User management | In **/admin → Users** the manager can search and filter by role, **add a user** (email, name, role and a temporary password to pass on privately), edit a name or username, change a role, **reset a password**, **suspend** an account (it can't sign in until access is restored) or **delete** it. Deleting removes the person's comments, likes and role requests, and moves their posts to the manager. Anyone given a temporary password is asked to change it at their next sign-in. The manager can't suspend, delete or demote their own account. |
| Review | Select any text, tap **Comment**, and the comment is pinned to that text. Supports replies and resolve/reopen. Reviewers can read and comment on drafts. |
| Social | Likes, with the count shown on each post card (♡ 3; hidden while there are none). Share to Facebook, WhatsApp, X, Telegram, LinkedIn, Reddit, Gmail and email, plus the phone's share sheet (TikTok, Instagram, Messages…). |
| Search | `/search?q=…&tag=…`: free text, `#tag` typed in the box, or tag chips. Hebrew niqqud is ignored. |
| Export (manager only) | **PDF** of one post or all posts. **HTML** (opens in TextEdit). **Markdown**. **ZIP** offline archive. **JSON** backup and restore. For everyone else these buttons are hidden, and the browser's own Print / Save as PDF shows a notice instead of the page. |
| Post details | Author, publish date, "updated" date, reading time, and draft/published status. |
| Tag groups (sites inside the site) | In **/admin → Tag groups** the manager creates a group: an address (`/coach`), a set of tags and a landing page. At `oded.me/coach` the blog then looks like a standalone site: only published posts carrying one of the group's tags (visitors see the public ones; a signed-in reader also sees the posts their audience settings allow, exactly as on the blog), every link stays under `/coach`, and there's no blog top bar, floating menu or sign-in. The site opens on a **promotional landing page** (hero with name, tagline and call-to-action button, a welcome YouTube video, an about section, a carousel of the group's posts, its topics, and a closing call to action: WhatsApp, email, a phone call, a web link or a page of the site, set up with plain fields and shown with a matching icon) over a full-screen **parallax background that shifts image** as each section scrolls into view. Every text is set in Hebrew and English, and the header has a language switch. Visitors can **comment by typing a name** (no account), **like** without an account, and share posts; shared links point to the site's own address. A group can use a **custom landing page** written in code instead of the default (see `src/landings/index.ts`). The manager can **export all of a group's posts** (PDF, ZIP, JSON) from its row. Only the root address reveals the full blog; its **/tags** page lists every tag group with a link to its site. |

### URL design

```
/                         latest posts
/posts/:slug              a post (Hebrew slugs are fine: /posts/ברוכים-הבאים)
/posts/:slug/edit         edit it
/posts/:slug/print        print / Save as PDF
/posts/new                write a post
/posts/print              all posts as one PDF
/tags  /tags/:tag         tag index, posts by tag
/authors/:username        posts by an author
/archive/:year/:month?    archive by date
/search?q=text&tag=a&tag=b
/account                  your role, change password, request a role
/admin                    posts incl. drafts · users & roles · role requests · groups · backup/restore
/login  /signup

Tag-group sites (each group's own address):
/:site                    its landing page
/:site/posts              all its posts
/:site/posts/:slug        a post, inside the site
/:site/tags  /:site/tags/:tag  /:site/search
```

The fixed paths above always take precedence, so they can't be used as tag-group addresses
(`RESERVED_SITE_SLUGS` in `src/lib/util.ts` and the `tag_groups_slug_check` constraint).

---

## 3. Tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| Language | **TypeScript** 6 | Type safety across the API, editor and pages. |
| UI | **React** 19 | Component model, large ecosystem. |
| Routing | **React Router** 7 (browser history) | Clean URLs such as `/posts/:slug`. The editor and admin pages load lazily. |
| Build | **Vite** 8 | Fast dev server; outputs static files to `dist/`. |
| Rich text | **TipTap** 3 (on ProseMirror) | Extensible editor with built-in text direction. Custom nodes for figures, video, audio and math. |
| Math | **KaTeX** | Fast LaTeX rendering on screen, in PDF and in exports. |
| Code | **highlight.js** | Syntax colours on screen only, loaded on demand for posts that contain code. |
| Sanitizing | **DOMPurify** | Cleans post HTML on save and on display. Iframes only from allowed players. |
| Markdown export | **Turndown** | HTML → Markdown converter. |
| ZIP export | **JSZip** | Builds the offline archive in the browser. Loaded only when used. |
| Icons | **lucide-react** | Small tree-shaken SVG icons. |
| Backend client | **@supabase/supabase-js** 2 | Auth, database queries, storage uploads. |
| Database | **PostgreSQL** (Supabase) | Tables, row-level security, search functions. |
| Recording | Browser **MediaRecorder** + **getUserMedia** | Camera/microphone capture with no plugin. Records MP4 where supported (Safari, recent Chrome), otherwise WebM. |
| YouTube | **Google Identity Services** + **YouTube Data API v3** | Google sign-in and resumable video upload from the browser. |
| PDF | The browser's own print engine (`window.print`) | Correct Hebrew shaping, RTL and web fonts. JS PDF libraries handle these poorly. |
| Styling | Plain CSS with logical properties and CSS variables | RTL/LTR without duplicate rules; light/dark themes. |
| Lint | **oxlint** | Fast linting. |
| CI/CD | **GitHub Actions** | Builds and deploys to GitHub Pages on every push. |

---

## 4. Services used

| Service | Used for | Required? | Cost | Configured in |
| --- | --- | --- | --- | --- |
| **GitHub** | Source code repository and Actions (CI) | Yes (or another git host) | Free | [§8.2](#82-github-repository) |
| **GitHub Pages** *or* Netlify / Cloudflare Pages / Vercel | Hosting the static site | One of them | Free tier | [§8.3](#83-hosting-pick-one) |
| **Supabase** | Sign-up/sign-in (Auth), database (Postgres), file storage (images, audio, video) | Yes for a live site; no for demo mode | Free tier | [§8.1](#81-supabase) |
| **Google Cloud** (YouTube Data API v3, OAuth) | Uploading recorded videos to your YouTube channel | Optional | Free (API quota) | [§8.5](#85-youtube-uploads-optional) |
| **YouTube** | Hosting and playing video blogs | Optional | Free | — |
| **Google Fonts** | Hebrew web fonts, loaded by readers' browsers | Automatic | Free | Nothing to set up |
| **jsDelivr CDN** | KaTeX stylesheet linked from exported HTML files | Automatic | Free | Nothing to set up |
| **Your domain registrar** (for oded.me) | DNS for a custom domain | Optional | Paid by you | [§8.4](#84-custom-domain-odedme-optional) |
| Embed players: YouTube, Vimeo, TikTok, SoundCloud, Spotify, Mixcloud, Archive.org | Playing linked media inside posts | Only if you paste such links | Free | Nothing to set up |
| Share targets: Facebook, WhatsApp, X, Telegram, LinkedIn, Reddit, Gmail | Share buttons open their public share pages | Automatic | Free | Nothing to set up |

**Why audio isn't uploaded to SoundCloud:** SoundCloud's upload API needs an Artist Pro
account and a server that keeps a client secret, which a static site can't do safely.
Internet Archive's upload API doesn't appear to support browser uploads either. Recordings
are therefore stored in the blog's own Supabase storage. That's free, needs no extra
account, plays on iPhone, and is included in the offline ZIP. To publish on SoundCloud or
Spotify, upload there and paste the link with **Insert → Audio**.

---

## 5. How it fits together

```
 Reader / author browser (phone or desktop)
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Static app (HTML/JS/CSS) from GitHub Pages / Netlify / Cloudflare / Vercel
 │   ├─ supabase-js ──► Supabase Auth        sign-up, sign-in, sessions
 │   │               ──► Supabase Postgres    posts, comments, likes, roles, groups (RLS)
 │   │               ──► Supabase Storage     bucket "media": images, audio, video files
 │   ├─ Google sign-in + YouTube API ──► your YouTube channel (recorded videos)
 │   ├─ Google Fonts (Hebrew fonts)   ├─ embed players (YouTube, SoundCloud, …)
 │   └─ exports run fully in the browser (PDF via print, HTML, Markdown, ZIP, JSON)
 └──────────────────────────────────────────────────────────────────────┘
```

There is no server of your own to run. Permissions are enforced inside Postgres by
**row-level security** policies, so the public keys built into the app are safe to expose.

---

## 6. Where and how data is saved

### 6.1 Live mode (Supabase)

All tables are in the `public` schema and are created by
[`supabase/schema.sql`](supabase/schema.sql).

| Data | Where | Format |
| --- | --- | --- |
| **Accounts** (email, password hash) | Supabase Auth (`auth.users`) | Managed by Supabase; passwords are bcrypt-hashed. |
| **Profiles** | `profiles` | `id` (= auth user id), `display_name`, `username`, `role` (`admin`/`editor`/`reviewer`/`commenter`/`reader`), `must_change_password`, `suspended`, `created_at`. Add, reset, suspend and delete go through the admin-only `admin_*` SQL functions, which write to `auth.users` (suspending sets `banned_until`), so the browser never needs the service-role key. |
| **Posts** | `posts` | One row per post — see the column list below. |
| **Comments** | `comments` | `post_id`, `user_id` (null for a visitor's comment), `guest_name` (the name a visitor typed on a tag-group site), `parent_id` (replies), `quote` + `prefix` + `suffix` (the highlighted text and 32 characters around it, used to find it again after edits), `body` (plain text), `resolved`, `created_at`. |
| **Likes** | `likes` | (`post_id`, `user_id`) pairs. |
| **Visitor likes** | `guest_likes` | (`post_id`, `visitor_hash`): the SHA-256 of a random secret kept in the visitor's browser. Written only by `guest_toggle_like()`. Counted together with `likes`. |
| **Tag groups** | `tag_groups` | `slug` (the address), `tags` (text[]), `landing` (`default` or a custom landing's key), `config` (jsonb: bilingual `name`, `tagline`, `about`, `video_heading`, `cta_title`, `cta_label`, plus `video_url`, `backgrounds` (image URLs), `cta_url`, `accent`). Everyone can read them; only the admin writes. |
| **Groups** | `groups` + `group_members` | Group `name`, `description`, `created_by` (owner); members as (`group_id`, `user_id`). Only the owner and the admin can see or change a group. |
| **Role requests** | `role_requests` | `user_id`, `requested_role`, `message`, `status` (`pending`/`approved`/`rejected`), `decided_at`, `decided_by`. |
| **Uploaded images, audio, recorded video** | Supabase Storage, public bucket **`media`** | Stored as the original files at `media/<YYYY-MM>/<random-uuid>.<ext>`. Images are kept exactly as uploaded (JPEG, PNG, WebP…). Browser recordings are **MP4/M4A** (Safari, recent Chrome) or **WebM** (Firefox, older Chrome). Files are cached for a year. The post HTML references them by their public URL. |
| **Videos uploaded to YouTube** | Your YouTube channel | The video file lives only on YouTube. The post stores only the player URL (`https://www.youtube-nocookie.com/embed/<id>`). |
| **Linked media** (YouTube, SoundCloud, image URLs…) | The original site | The post stores the link or embed URL only. |

**`posts` columns**

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `slug` | text, unique | URL name, e.g. `ברוכים-הבאים` → `/posts/ברוכים-הבאים` |
| `title`, `excerpt` | text | The excerpt is auto-generated from the text if left empty |
| `content_html` | text | **The post body** — see the format below |
| `content_text` | text | Plain-text copy of the body, used for search |
| `cover_url` | text | Cover image URL (or null) |
| `tags` | text[] | Tag names, e.g. `{מדריך,rtl}` |
| `lang` | `he` \| `en` | Post language → overall direction |
| `status` | `draft` \| `published` | |
| `visibility` | `public` \| `members` \| `private` \| `restricted` | Audience |
| `allowed_users`, `allowed_groups` | uuid[] | Who may read a `restricted` post |
| `author_id` | uuid | → `profiles.id` |
| `created_at`, `updated_at`, `published_at` | timestamptz | `updated_at` is set automatically on every save |

### 6.2 Post body format (`content_html`)

The body is a **small, sanitized subset of semantic HTML5**. It's readable as plain text,
opens in any browser, TextEdit or Word, and keeps every formatting choice.

| Content | Stored as |
| --- | --- |
| Paragraphs / headings | `<p dir="auto">`, `<h2>`–`<h4>`; alignment as `style="text-align: center"` |
| Direction | `dir="rtl"`, `dir="ltr"` or `dir="auto"` on each block |
| Bold, italic, underline, strike, highlight, code | `<strong>`, `<em>`, `<u>`, `<s>`, `<mark>`, `<code>` |
| Font and size | `<span style="font-family: 'Playpen Sans Hebrew'; font-size: 22px">` |
| Lists, quotes, divider | `<ul>`/`<ol>`/`<li>`, `<blockquote>`, `<hr>` |
| Links | `<a href="…">` |
| Image | `<figure data-type="figure" data-align="inline-start" data-width="50" style="width:50%"><img src alt><figcaption>…</figcaption></figure>` |
| Video | `<figure data-type="video" data-kind="file\|embed" data-src="…">` containing `<video controls>` or a YouTube/Vimeo/TikTok `<iframe>` |
| Audio | `<figure data-type="audio" data-kind="file\|embed" data-provider="file\|soundcloud\|spotify\|mixcloud\|archive">` containing `<audio controls>` or a player `<iframe>` |
| Math | `<span data-type="math" data-latex="e^{i\pi}+1=0" dir="ltr">e^{i\pi}+1=0</span>` (`data-display="true"` for its own line) |
| Code | `<pre><code class="language-python">…</code></pre>` (no class = auto-detect). Exported to Markdown as a fenced block. |

`data-align` is one of `inline-start`, `inline-end`, `center`, `full` or `hero` (title banner).

**Why HTML rather than Markdown?** TextEdit opens `.html` natively with RTL, alignment,
fonts and images, but shows `.md` only as raw text. Markdown also has no way to record
paragraph direction, alignment, per-text fonts, image float/width or embeds. Markdown is
still available as an **export**.

### 6.3 In the visitor's browser

| Key | Storage | Contents |
| --- | --- | --- |
| `blog.prefs` | localStorage | Reader preferences as JSON: `uiLang`, `font`, `fontSize`, `lineHeight`, `theme`. |
| `sb-<project-ref>-auth-token` | localStorage | Supabase login session (live mode). |
| `blog.session` | localStorage | Signed-in user id (demo mode only). |

### 6.4 Demo mode (no Supabase configured)

Everything lives in the browser's **IndexedDB**: database `bilingual-blog`, object store
`kv`, key `db`. That one JSON object holds `users`, `posts`, `comments`, `likes`,
`roleRequests` and `groups`, in the same shapes as above. Passwords are SHA-256 hashed.
Uploaded files are stored inline as `data:` URLs, up to 25 MB each.

Demo data exists only in that browser. Clearing site data erases it.

### 6.5 Export formats

All exports are available to the **admin (manager)** only.

| Export | Where from | Format |
| --- | --- | --- |
| **PDF** (one post / all posts) | Post → Export → PDF, or Menu → Export all | The browser's print dialog → "Save as PDF" (on iPhone: Share → Save to Files). |
| **HTML** (one post) | Post → Export → HTML | One standalone `.html` file with inline CSS and fonts linked from Google Fonts. Metadata is in `<meta>` tags (`author`, `date`, `dcterms.modified`, `keywords`, `description`, `blog:slug`, `blog:url`). Opens in TextEdit, Word, Pages and browsers. |
| **Markdown** (one post) | Post → Export → Markdown | CommonMark with YAML front matter: `title`, `slug`, `author`, `date`, `updated`, `lang`, `dir`, `status`, `visibility`, `tags`, `cover`. Math becomes `$…$` / `$$…$$`, highlight becomes `==…==`, and media become links. |
| **ZIP archive** (all posts) | Menu → Export all → offline archive | `index.html` (list), `all-posts.html`, `posts/<slug>.html`, `markdown/<slug>.md`, `media/` (downloaded images/audio/video, links rewritten to local files), `posts.json`, `README.txt`. |
| **JSON backup** | Menu → Export all, or /admin | `{ "format": "bilingual-blog/v1", "exported_at": "…", "posts": [ …post rows… ] }`. Restore it in **/admin → Restore backup**. |

---

## 7. Configuration (environment variables)

All variables are read **at build time** by Vite. Set them in `.env` locally, or in your
host's settings for deployments (GitHub Actions secrets, or Netlify/Cloudflare/Vercel
environment variables).

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | For a live site | `https://abcd1234.supabase.co` | Supabase project URL. Leave empty for demo mode. |
| `VITE_SUPABASE_ANON_KEY` | For a live site | `sb_publishable_…` or `eyJhbGci…` | Supabase publishable (anon) key. It's public by design. |
| `VITE_GOOGLE_CLIENT_ID` | Optional | `123…apps.googleusercontent.com` | Enables **Upload to YouTube**. |
| `VITE_OAUTH_PROVIDERS` | Optional | `google` | Sign-in buttons below the email form (`google`, `facebook`, `apple`, `github`). Default `google`; `none` for email only. Each must be enabled in Supabase (§8.1 step 5). |
| `VITE_ADMIN_EMAIL` | Optional | `admin@oded.me` | The email that the `admin` sign-in shortcut maps to. It must match the SQL file. |
| `VITE_BASE` | Optional | `/` or `/my-blog/` | The path the site is served under. The GitHub workflow sets it automatically. |

Never put the Supabase **service_role / secret** key in any of these: they all end up
in the public JavaScript.

---

## 8. Deployment, step by step

Total time is about 15–20 minutes. You need a GitHub account, a Supabase account, and
Node.js 20+ for local builds.

> **Shortcut:** `npm run setup` walks through these steps in the terminal. It fills in
> `.env`, checks the database, sets the GitHub secrets, deploys and tests the live site.
> See [DEPLOYMENT.md §2](DEPLOYMENT.md#2-the-walkthrough-script). The sections below are
> the same steps done by hand.

### 8.1 Supabase

1. Go to [supabase.com](https://supabase.com) and create a **New project**. Pick a region
   close to your readers (for Israel, *Frankfurt* `eu-central-1`) and save the database
   password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates:
   - the tables, row-level security policies and search functions;
   - the public storage bucket **`media`** (50 MB per-file limit);
   - the prebuilt manager **`odedsme@gmail.com` / `admin`**.

   The file is safe to re-run after updates. To use a different admin email, change
   `admin_email` at the bottom of the file and set `VITE_ADMIN_EMAIL` to the same value.
3. Go to **Authentication → URL Configuration**:
   - *Site URL*: your blog's address, e.g. `https://oded.me` or `https://<user>.github.io/<repo>/`.
   - *Redirect URLs*: add the same address, plus `http://localhost:5173` for local testing.
4. Go to **Authentication → Sign In / Providers → Email**:
   - Keep **Email** enabled.
   - **Confirm email**: on by default. Supabase's built-in mailer sends only a few emails
     per hour. For real sign-ups, either connect your own SMTP under
     **Authentication → Emails → SMTP Settings** (any provider with a free tier works), or
     turn confirmation off for a small private blog.
5. **Sign in with Google** (shown by default; skip it with
   `VITE_OAUTH_PROVIDERS=none`). Each service needs an app of its own, whose keys go into
   Supabase, never into `.env`. Every service asks for the same **callback URL**, which
   Supabase shows on the provider's page: `https://<project>.supabase.co/auth/v1/callback`.
   - **Google:** in [Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials),
     create an **OAuth client ID** (Web application). It can be the same Google project as
     YouTube (§8.5) but must be its own client. Add the callback URL under *Authorized
     redirect URIs*. Then in Supabase → **Authentication → Sign In / Providers → Google**,
     turn it on and paste the client ID and secret. Before publishing the Google app, fill in
     *Branding*: home page `https://oded.me`, privacy policy `https://oded.me/privacy` (a
     page in the blog), and authorized domains `oded.me` and `supabase.co`.
   - **Facebook (off by default):** Meta lets a new app go Live only after **business
     verification** (a registered business), so the blog ships without it. To add it later,
     set `VITE_OAUTH_PROVIDERS=google,facebook`. In [Meta for Developers](https://developers.facebook.com/apps), create
     an app with the **Authenticate and request data from users with Facebook Login** use
     case, and add the `email` permission. Under *Facebook Login → Settings*, add the
     callback URL to *Valid OAuth Redirect URIs*. Copy the App ID and App Secret
     (*App settings → Basic*) into Supabase → **Providers → Facebook**.
     In *App settings → Basic*, set the privacy policy URL to `https://oded.me/privacy` and the
     data deletion instructions URL to `https://oded.me/privacy#delete`. Switch the app to
     **Live** when done, or only you can sign in with it.
   - In **Authentication → URL Configuration → Redirect URLs**, also add your address with
     `/**` at the end (e.g. `https://oded.me/**`, `http://localhost:5173/**`), so people
     return to the page they were on. Without it they land on the homepage, still signed in.

   Accounts made this way start as commenters, like email sign-ups, and take their name
   from their Google profile. If someone already has an email account with the
   same address, Supabase links the two.
6. Go to **Project Settings → API Keys** and copy the **Project URL** and the
   **publishable / anon** key. You'll need them in §8.3.

> **Free-tier note:** Supabase pauses free projects after about a week with no activity.
> If that happens, open the dashboard and click **Restore**. Your data is kept.

### 8.2 GitHub repository

```bash
cd ~/Documents/Workspace/bilingual-blog
```
```bash
git init
```
```bash
git add .
```
```bash
git commit -m "oded.me blog"
```
```bash
gh repo create oded-blog --public --source . --push
```

You can also create the repo on github.com and run `git remote add origin …` and
`git push -u origin main`. The branch must be **`main`** for the included workflow.

### 8.3 Hosting (pick one)

All four hosts are free for a personal blog and serve the same `dist/` folder.

#### Option A — GitHub Pages (included workflow)

1. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_CLIENT_ID` (optional)
3. Push to `main`, or open **Actions → Deploy to GitHub Pages → Run workflow**.
4. The site appears at `https://<user>.github.io/<repo>/`.

The workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) installs,
builds, and publishes `dist/`. It sets the base path to `/<repo>/` automatically, or `/`
for a `<user>.github.io` repo. Deep links like `/posts/…` work because the build copies
`index.html` to `404.html`.

#### Option B — Netlify

1. **Add new site → Import from Git**, then pick the repo.
2. Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
3. Under **Site configuration → Environment variables**, add the `VITE_*` variables.
4. Deploy. SPA routing is handled by `netlify.toml` and `public/_redirects`.

#### Option C — Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, then pick the repo.
2. Framework preset *None*, build command `npm run build`, output directory `dist`.
3. Add the `VITE_*` variables under **Settings → Environment variables**, and add
   `NODE_VERSION` = `22`.
4. Deploy. SPA routing is handled by `public/_redirects`.

#### Option D — Vercel

1. **Add New → Project → Import** the repo. The framework is detected as Vite.
2. Build `npm run build`, output `dist` (already in `vercel.json`).
3. Add the `VITE_*` variables under **Settings → Environment Variables**, then deploy.

### 8.4 Custom domain oded.me (optional)

**GitHub Pages:**
1. Go to **Settings → Pages → Custom domain**, enter `oded.me` and save. Then tick
   **Enforce HTTPS** once the certificate is issued.
2. At your domain registrar, add DNS records:
   - `A` records for `oded.me` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `<user>.github.io`
3. Add a repository **variable** (not a secret) `VITE_BASE` = `/`, then re-run the workflow.

**Netlify / Cloudflare / Vercel:** add the domain in the site's *Domains* settings and
create the DNS records they show you. No `VITE_BASE` is needed.

Then update the other services to use the new address:
- Supabase → **Authentication → URL Configuration** (Site URL and Redirect URLs).
- Google Cloud → OAuth client → **Authorized JavaScript origins** (if you use YouTube).

### 8.5 YouTube uploads (optional)

Without this, the **Upload to YouTube** option is disabled and recorded videos are saved
in Supabase Storage instead.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Go to **APIs & Services → Library**, search for **YouTube Data API v3**, and click
   **Enable**.
3. Set up **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**, app name e.g. *oded.me*, and your email as support/developer
     contact.
   - **Data access / Scopes**: add `https://www.googleapis.com/auth/youtube.upload`.
   - **Audience / Test users**: add the Google account that owns your YouTube channel.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**.
   - **Authorized JavaScript origins**: your site, e.g. `https://oded.me` or
     `https://<user>.github.io`, plus `http://localhost:5173`. Use the origin only,
     with no path.
   - No redirect URIs are needed.
5. Copy the **Client ID** into `VITE_GOOGLE_CLIENT_ID` and rebuild/redeploy.

The first upload opens a Google consent popup. After that, the video uploads directly from
the browser and is inserted into the post.

> **Important — YouTube audit.** Videos uploaded through the API by an *unverified*
> Google project are locked as **private**. To publish them as public or unlisted from the
> blog, submit the [YouTube API compliance audit](https://support.google.com/youtube/contact/yt_api_form).
> Until it's approved, either change each video's visibility in YouTube Studio or choose
> **Save in the blog**.
>
> The API quota (10,000 units per day by default) allows several uploads a day.

### 8.6 First sign-in and securing the manager

1. Open your site → **Sign in** with **`admin`** / **`admin`**.
2. A yellow bar asks you to change the password. On **/account**, set a strong one (at
   least 6 characters).
3. Optionally rename yourself. To promote another person by hand, run this in the SQL Editor:
   ```sql
   update profiles set role = 'admin' where username = 'theirname';
   ```
4. New users sign up as **commenters**. Approve their role requests in **/admin → Role requests**, or add people yourself in **/admin → Users**.

### 8.7 Checklist

- [ ] `schema.sql` run in Supabase; the `media` bucket exists
- [ ] Supabase Site URL and Redirect URLs point to the live address
- [ ] Email confirmation decided (custom SMTP or turned off)
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set on the host
- [ ] Site deployed; the demo-mode banner is **gone** (if it's still there, the keys weren't set at build time)
- [ ] Default admin password changed
- [ ] (Optional) custom domain, plus `VITE_BASE=/` for GitHub Pages
- [ ] (Optional) `VITE_GOOGLE_CLIENT_ID` set and the site's origin authorized in Google Cloud

---

## 9. Local development

```bash
npm install
```
```bash
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5173 with hot reload |
| `npm run build` | Type-check, build `dist/`, and copy `404.html` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |
| `npm run setup` | Guided deployment and configuration ([DEPLOYMENT.md](DEPLOYMENT.md)) |
| `npm run deploy` | Rebuild and redeploy to the host chosen in setup |
| `npm run deploy:check` | Check `.env`, the Supabase project, the build and the live site |
| `npm run migrate:media` | Copy uploaded files after moving to a new Supabase project |

To develop against your real Supabase project, copy `.env.example` to `.env`, fill in the
values, and restart `npm run dev`.

To open the dev site on your iPhone, run `npm run dev -- --host` and open the printed
*Network* address on the same Wi-Fi. Camera and microphone recording need HTTPS (or
`localhost`), so test recording on the deployed site.

---

## 10. Backups, moving data, updates

Full details, including moving to a new host, domain or Supabase project, are in
[DEPLOYMENT.md §5](DEPLOYMENT.md#5-migrations).

- **Backup:** Menu → *Export all* → **Backup (JSON)** for posts, or the **ZIP** for an
  offline copy with media. Supabase also offers database backups in its dashboard.
- **Demo → live:** export **Backup (JSON)** in demo mode, then sign in on the live site and
  use **/admin → Restore backup (JSON)**. Media that was uploaded in demo mode is embedded
  in the posts and comes along.
- **Updating the app:** commit and push to `main`. GitHub Pages redeploys automatically;
  Netlify, Cloudflare and Vercel redeploy on push too.
- **Updating the database:** re-run `supabase/schema.sql` when it changes. It only adds or
  replaces definitions and never deletes your data.

---

## 11. Project layout

```
index.html                 app shell (title, fonts, iPhone meta tags)
public/                    favicon, manifest, _redirects (SPA routing)
src/
  main.tsx, App.tsx        entry and routes
  index.css                all styles (tokens, RTL-aware layout, print/PDF rules)
  lib/
    api/                   Api interface; supabase.ts (live), local.ts (demo), seed.ts
    app.tsx                app context: useApp() hook, errorText()
    AppProvider.tsx        user session, preferences, toasts, translations
    i18n.ts                Hebrew / English strings
    fonts.ts               Hebrew Google Fonts list and lazy loading
    sanitize.ts            DOMPurify rules and allowed embed hosts
    export.ts              HTML / Markdown / ZIP / JSON exports
    anchor.ts              text anchors for comments on highlighted text
    youtube.ts             Google sign-in + YouTube resumable upload
    util.ts                roles/permissions, visibility rule, slugs, helpers
  editor/                  TipTap editor, command bar, dialogs, recorder, custom nodes
  components/              floating menu, sheets, audience picker, comments, share, settings, tag group sheet
  pages/                   home/lists, post, editor, print, account, admin, auth
  site/                    tag-group sites: layout, default landing page and its blocks, visitor comments
  landings/                custom landing pages for tag groups (registry in index.ts)
supabase/schema.sql        database, security policies, storage bucket, prebuilt admin
scripts/setup.mjs          deployment walkthrough, deploy, checks, media migration
scripts/spa-fallback.mjs   copies index.html to 404.html after the build
DEPLOYMENT.md              deploying, releasing, migrating, troubleshooting
CHANGES.md                 what each deploy added or fixed (feeds the commit messages)
CLAUDE.md                  decisions, current state and conventions; new-Mac setup
.github/workflows/deploy.yml   GitHub Pages build and deploy
netlify.toml, vercel.json  host configs
.env.example               environment variable template
```

---

## 12. Security notes and limits

- **Permissions** are enforced in Postgres row-level security, not only in the UI. This
  covers drafts, post audiences, comments, likes, groups, roles and uploads.
- **Visitor comments and likes** (no account) are accepted only on public, published posts
  carrying a tag from some tag group (`guest_can_engage()`). There is no spam filter or rate
  limit; the manager deletes unwanted comments from the post's comment section. A tag-group
  site hides the blog from casual visitors, but it isn't secret: the root address still
  shows the full blog.
- **Post HTML** is sanitized with DOMPurify on save and on display. Iframes are allowed
  only from YouTube, Vimeo, TikTok, Facebook, Instagram, SoundCloud, Spotify, Mixcloud and
  Archive.org.
- **Media privacy:** files in the `media` bucket have unguessable but **public** URLs. A
  private post hides its text, but anyone who has a file's link can still open that image
  or recording.
- **Storage limits (Supabase free):** 50 MB per file and 1 GB in total. That's plenty for
  images and voice audio, but only a few minutes of video per file, so use YouTube for
  longer video blogs.
- **Default admin password:** change it immediately after deploying.
- **Export lock** is a convenience, not DRM. Anyone who can read a post can still copy
  its text or take screenshots. It hides the export buttons, blocks the print pages, and
  blanks the browser's print output for non-admins.
- **SEO and link previews:** the site is rendered in the browser, so social link previews
  show the site defaults rather than per-post titles and images.
- **TikTok and Instagram** have no web share link; on phones, use *More apps* (the native
  share sheet).
