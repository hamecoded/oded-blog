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
- **Sign in with Google / Facebook** (also Apple, GitHub) through Supabase's built-in OAuth.
  Buttons sit below the email form, chosen with `VITE_OAUTH_PROVIDERS` (default
  `google,facebook`, `none` hides them). Provider keys live only in the Supabase dashboard.
  Demo mode signs in as a made-up `<provider>.demo@example.com` account. Never tested
  against real providers yet.
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

**Not done yet:** a git repository (none exists), a GitHub repo, setting up Supabase,
deploying, and the custom domain oded.me.

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
