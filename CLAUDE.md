# oded.me — notes for continuing this project

A bilingual Hebrew/English blog: a static React single-page app, with Supabase for accounts,
data and uploads. [README.md](README.md) is the full spec, covering features, data formats
and dashboard setup. [DEPLOYMENT.md](DEPLOYMENT.md) covers deploying, releasing and
migrating. This file holds what those don't: the decisions behind the design, the project's
current state, and the conventions to keep.

## Setting up on a new Mac

1. Install Node 22 (`.nvmrc`; anything ≥ 20 works), e.g. `brew install node@22` or `nvm install`.
2. Copy this folder over: unzip `oded-blog-transfer.zip`, or clone the repo once it's on GitHub.
3. `npm install`, then `npm run dev` → http://localhost:5173. It starts in **demo mode**,
   so no keys are needed.
4. Optional, for deploying: `brew install gh` (then `gh auth login`) and `brew install libpq`
   (for `psql`).
5. If the site is already live, recreate `.env` with `npm run setup`. `.env` is
   deliberately not in the transfer zip. Its values can be found again in the Supabase
   dashboard and the host's settings.

Demo data (posts and users created at localhost) lives in the old Mac's browser and does
not move. Use /admin → **Backup (JSON)** there, then **Restore backup** here (posts only).

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Dev server on port 5173 (`.claude/launch.json` starts it for the preview pane) |
| `npm run typecheck` / `npm run lint` | Run both before finishing a change |
| `npm run build` | Type-check plus production build into `dist/` |
| `npm run setup` | Guided deploy: `.env`, database, host, smoke test |
| `npm run deploy` / `npm run deploy:check` | Redeploy / verify everything |
| `npm run deploy:auto` | Redeploy in one go, no questions (`deploy --yes`); commit message written from the changed files |
| `npm run migrate:media` | Copy uploads after moving Supabase projects |

## Decisions already made (and why)

- **Post body is a sanitized HTML subset, not Markdown,** so posts open in macOS TextEdit
  with RTL and alignment intact. Markdown is an export only.
- **Prebuilt admin:** sign in as `admin` / `admin`, which maps to `admin@oded.me`
  (`VITE_ADMIN_EMAIL`, and `admin_email` in `supabase/schema.sql`). A yellow bar stays
  until the password is changed. Anyone given a temporary password sees the same bar.
- **Roles:** admin (shown as "Manager"), editor ("Author"), reviewer, commenter, reader.
  Sign-ups start as reader and request a role on `/account`. The admin approves requests
  in /admin → Role requests, or manages people directly in /admin → Users (add with a
  temporary password, edit, reset password, suspend, delete).
- **Sign in with Google** (Facebook, Apple, GitHub supported in code) through Supabase's
  built-in OAuth. Buttons sit below the email form, chosen with `VITE_OAUTH_PROVIDERS`
  (default `google`, `none` hides them). Facebook was dropped on 2026-10-31 because Meta
  only publishes new apps after business verification. Provider keys live only in the Supabase dashboard.
  Demo mode signs in as a made-up `<provider>.demo@example.com` account. On the live site
  only providers that Supabase's `/auth/v1/settings` reports as enabled get a button
  (`api.oauthProviders()`), so a half-configured provider never shows a broken button.
- **Privacy policy at `/privacy`** (`src/pages/Privacy.tsx`, both languages, `#delete` anchor).
  Google's app settings link to it. Keep it in step with what the app stores.
  `spa-fallback.mjs` writes `dist/privacy.html` so it answers 200 on GitHub Pages.
- **No service-role key anywhere in the app.** Admin user management on Supabase goes
  through the security-definer `admin_*` SQL functions in `schema.sql`, which write
  `auth.users`.
- **Post audience:** public, private, or restricted to chosen people and/or groups.
  Groups are personal to each author (`created_by`). The admin sees all of them.
- **Exports** (PDF, HTML, Markdown, ZIP, JSON) are **admin-only**. Printing is blanked for
  everyone else.
- **Media:** images and audio go to the Supabase Storage bucket `media`. Recorded video
  goes either to YouTube (`VITE_GOOGLE_CLIENT_ID`; an unaudited Google project forces
  uploads to private) or to the bucket. Audio is not uploaded to SoundCloud (its API needs
  Artist Pro plus a server-side secret). SoundCloud, Spotify, Mixcloud and Archive.org
  links can be embedded.
- **Tag groups ("sites inside the site", 2026-11-02):** the admin creates them in /admin → Tag groups.
  `/<slug>` is a standalone-looking site: only **published** posts that carry **any** of the
  group's tags, filtered by the viewer's permissions as everywhere else (`inTagGroup()` checks tags and
  status; the API/RLS decides visibility, so a signed-in reader also sees members-only and restricted posts
  open to them; anonymous visitors see the public ones), every link kept under `/<slug>` (`useSite().link()` in `src/lib/site.ts`), no blog top bar,
  floating menu or sign-in, and on post pages only the group's tags and no author link. Routes are a second
  top-level route `/:site` in `App.tsx` (layout: `src/site/SiteLayout.tsx`); list and post pages are the
  blog's own, made site-aware through `useSite()`. Addresses that the blog itself uses are reserved
  (`RESERVED_SITE_SLUGS` in util.ts and `tag_groups_slug_check` in schema.sql; keep them in step).
  - **Landing page:** the default is `src/site/DefaultLanding.tsx`, a promotional one-pager over a
    parallax background that shifts image per section (`src/site/blocks.tsx`). Its content is in
    `tag_groups.config`, with every text in both languages. **Custom landings** are code: add a component in
    `src/landings/` and register it in `src/landings/index.ts`. The admin then picks it per group.
  - **Visitors comment with a typed name and like without an account**, but only on tag-group sites. On
    the main blog commenting and liking still need an account. Comments use `user_id = null` +
    `guest_name`. Likes go to `guest_likes`, keyed by the hash of a random secret in the visitor's browser
    and written only by `guest_toggle_like()`. Both are allowed only where `guest_can_engage()` holds
    (mirrored as `guestCanEngage()` in local.ts). No spam protection yet; the admin deletes comments.
  - **Export per group** (admin): the archive icon on the group's row. PDF is `/posts/print?group=<slug>`.
  - Path, not subdomain: GitHub Pages allows one domain per repo. `scripts/prerender.mjs` writes
    `<slug>.html` and `<slug>/posts/*.html` so these addresses answer 200 and share with the group's name.
- **Homepage:** no big title. Posts start right under a slim search-and-tags row, as
  compact cards with side thumbnails, so as many posts as possible fit on the first screen.
  Other list pages still use the large cards.

## Current state

**Tested in demo mode in the browser:** everything in the app, including user
management, the compact homepage, and the RTL/LTR layouts at phone and desktop widths.
`scripts/setup.mjs` was tested with dry runs and against stand-in servers.

**Never run for real yet:**
- `supabase/schema.sql` on a live Supabase project. This includes the SQL that inserts
  the admin into `auth.users`, the role-request RPC, the groups security rules, and the
  `admin_create_user` / `admin_set_password` / `admin_set_suspended` /
  `admin_delete_user` functions.
- Any deployment: GitHub Pages, Netlify, Cloudflare or Vercel.
- A real YouTube upload, the `psql` route in setup, and `migrate:media` against real
  projects.

**Tag groups (2026-11-02):** tested in demo mode in the browser: creating a group, the landing page at
375px and desktop in both languages, a visitor liking and commenting, custom-landing switching, per-group
exports and the prerendered pages (against a stand-in server). **Not yet run on the live database:** the
schema.sql additions (`tag_groups`, `guest_likes`, guest comment policy), so run schema.sql before
deploying this version.

**Live since 2026-10-31** at https://oded.me (GitHub Pages, repo `hamecoded/oded-blog`,
Supabase project `tbwskzgkmoztdejeiyhz`); `.deploy.json` records the last deploy.

**Sign in with Google, status 2026-10-31:**
- Live, using a dedicated Google Cloud project (not the YouTube one). The flow was checked up
  to Google's account screen; a full sign-in that creates an account hasn't been confirmed yet.
- Facebook removed from the default buttons. The Meta app "oded.me" (App ID
  1153870960650318) stays in Development mode; publishing it needs Meta business
  verification. Facebook should be switched off in Supabase too.
- App icon for the provider consoles: `branding/app-icon-1024.png`.

## Conventions

- **Two backends, one interface.** Every data operation is on the `Api` interface
  (`src/lib/types.ts`). It's implemented twice and both must stay in step:
  `src/lib/api/local.ts` (demo, IndexedDB) and `src/lib/api/supabase.ts` (live).
- **Permissions in three places.** `can.*` in `src/lib/util.ts` (UI), checks in
  `local.ts`, and row-level security policies / functions in `supabase/schema.sql`. Change
  them together. Comments in each point at the others.
- **`schema.sql` must stay re-runnable.** Use `if not exists`, `create or replace`, and
  `drop … if exists` before recreating anything. Never drop tables or delete data.
  Upgrades are "run the whole file again". If a function's return type changes, it needs
  a `drop function if exists` first.
- **Every UI string goes in both dictionaries** in `src/lib/i18n.ts`. `he` is typed as
  `Dict`, so a missing key fails the typecheck. Avoid duplicate keys: `copied` already
  exists, for example.
- **RTL first.** Use logical CSS properties (`margin-inline-start`, `inset-inline`). Give
  user-entered text `dir="auto"`, and give emails, usernames and URLs `dir="ltr"`.
- **Styles** are all in `src/index.css`, using the color tokens defined there (`var(--accent)`
  and so on), with sections marked by `/* ───── Name ───── */` comments.
- **Lint-clean React.** A `.tsx` file exports either components or non-components, so
  hooks, contexts and constants get their own file (`lib/app.tsx` vs `lib/AppProvider.tsx`,
  `components/fabActions.ts`, `components/visIcons.ts`). Don't call `setState` directly in an
  effect. To refill a form when a sheet opens, compare the previous `open` value during
  render (the `shownFor` pattern in `UserSheets.tsx` and `dialogs.tsx`).
- **Error codes** like `auth/forbidden` or `user/self` are thrown by the API and turned
  into translated messages in `errorText()` (`src/lib/app.tsx`).
- **Verify in the browser pane in demo mode.** Sign in as admin/admin and check
  phone width (375px) as well as desktop.
