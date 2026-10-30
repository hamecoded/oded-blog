# Deploying and migrating oded.me

This guide covers getting the blog online, keeping it updated, and moving it: from demo
mode to a real database, to a new host or domain, or to a new Supabase project.
The click-by-click dashboard steps live in [README §8](README.md#8-deployment-step-by-step);
this file links to them instead of repeating them.

**Contents**

1. [What gets deployed where](#1-what-gets-deployed-where)
2. [The walkthrough script](#2-the-walkthrough-script)
3. [Releasing updates](#3-releasing-updates)
4. [Environments](#4-environments)
5. [Migrations](#5-migrations)
6. [Backups and restore](#6-backups-and-restore)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. What gets deployed where

| Piece | Lives on | Set up by | Changes when |
| --- | --- | --- | --- |
| The site (HTML/JS/CSS in `dist/`) | GitHub Pages, Netlify, Cloudflare Pages or Vercel | `npm run deploy` | You change code or a `VITE_*` value |
| Database, sign-in, security rules | Supabase (Postgres + Auth) | `supabase/schema.sql` | `schema.sql` changes |
| Uploaded images, audio, video | Supabase Storage, bucket `media` | `schema.sql` creates the bucket | Authors upload |
| Build settings | `.env` locally, and the host's secrets/variables | `npm run setup` | You change keys, the admin email or the domain |
| YouTube uploads (optional) | Google Cloud OAuth client | README §8.5 | The site's address changes |

The `VITE_*` values are **baked into the JavaScript at build time**. After changing one,
you must rebuild and redeploy. Restarting is not enough. All of them are public by design;
the Supabase **secret / service-role** key must never be one of them. The script refuses
it if pasted.

---

## 2. The walkthrough script

```bash
npm run setup
```

It's a step-by-step guide in the terminal. Each step explains itself, offers to open the
right dashboard page, and asks before doing anything outside this folder. Press Enter to
accept the default shown in (parentheses). It can be re-run safely: it remembers your
answers and skips work that is already done.

| Step | What it does |
| --- | --- |
| 1. Checking your machine | Node ≥ 20, `npm install` if needed; reports whether `git`, `gh` and `psql` are available. |
| 2. Where will the site live? | Pick a host and an optional custom domain. Works out the site address and, for GitHub Pages, the base path (`/repo/` or `/`). |
| 3. Supabase project and keys | Asks for the Project URL and the publishable/anon key, and checks that they match. **Rejects secret or service-role keys.** Leave the URL empty for a demo-mode deploy. |
| 4. Manager (admin) account | The email that `admin` signs in as. If you change it, it also updates `supabase/schema.sql` so the two match. |
| 5. YouTube uploads | Optional. Prints the exact origins to authorize in Google Cloud and checks the client ID format. |
| — | Saves `.env`. |
| 6. Database | Checks whether `schema.sql` has been run and is the latest version. If not, it either copies `schema.sql` to the clipboard and opens the SQL editor, or runs it with `psql` in a single transaction. Then it checks again. |
| 7. Supabase sign-in settings | Prints the Site URL and Redirect URLs to enter and opens that page. |
| 8. Deploy | See below, per host. |
| 9. Custom domain | The DNS records to add. |
| 10. Checking the live site | Loads the home page and a deep link, and checks that the live JavaScript contains your Supabase URL (i.e. no demo banner). |

**Deploying, per host:**

- **GitHub Pages:**
  1. Runs `git init` if needed and offers to commit.
  2. Creates the public repo with `gh`.
  3. Stores the keys as **repository secrets**, sent through stdin, never on the command line.
  4. Sets `VITE_ADMIN_EMAIL` and `VITE_BASE` as variables when needed.
  5. Switches Pages to "GitHub Actions" and pushes `main`.
  6. Optionally watches the workflow until it finishes.

  From then on, every push to `main` redeploys.
- **Netlify / Cloudflare Pages / Vercel:** builds locally and uploads `dist/` with the host's
  CLI through `npx` (`netlify-cli`, `wrangler`, `vercel`). The first run asks you to log
  in. To get automatic deploys on push instead, connect the repo in the host's dashboard
  (README §8.3) and add the `VITE_*` variables there.

**Other commands:**

```bash
npm run deploy          # rebuild + redeploy to the host chosen in setup, then smoke-test
```
```bash
npm run deploy:check    # check .env, the Supabase project, a build, and the live site
```
```bash
npm run migrate:media   # copy uploaded files from an old Supabase project (see §5.5)
```

Add `-- --dry-run` to any of them (e.g. `npm run setup -- --dry-run`) to see every command
and file write without anything being changed.

**Files it writes:**

| File | Contents | In git? |
| --- | --- | --- |
| `.env` | `VITE_*` values (all public) | No (git-ignored) |
| `.deploy.json` | Host, repo/project name, domain, site URL, base path, last deploy time | Yes — no secrets in it |
| `supabase/schema.sql` | Only the `admin_email` line, and only if you change it | Yes |

**What it never does:** handle the Supabase secret key, store your database password (the
`psql` connection string is used once, passed through environment variables, and
forgotten), delete anything, or push without asking.

---

## 3. Releasing updates

1. Run it locally: `npm run dev`. Use `npm run typecheck` and `npm run lint` before shipping.
2. If `supabase/schema.sql` changed, **apply it first** (§5.1). New code may need the
   new columns or functions.
3. Ship it:
   - **GitHub Pages:** commit and `git push`. Follow the workflow under the repo's
     **Actions** tab.
   - **Other hosts:** `npm run deploy`, or push if you connected Git in the host's
     dashboard.
4. Run `npm run deploy:check`.

**Rolling back:**
- **GitHub Pages:** `git revert` the bad commit and push, or re-run an older successful
  workflow run.
- **Netlify, Cloudflare and Vercel:** each keeps earlier deploys. Use *Publish deploy*,
  *Rollback* or *Promote* in its dashboard.

Database changes are not rolled back by this. See §5.1.

---

## 4. Environments

| Environment | How | Data |
| --- | --- | --- |
| **Demo** | `npm run dev` with no `.env`, or a deploy with no keys | Each browser's IndexedDB. Not shared, cleared with site data. |
| **Local against live** | `npm run dev` with `.env` filled in | The real database. Edits are real. Add `http://localhost:5173` to Supabase's Redirect URLs. |
| **Production** | The deployed site | Supabase |
| **Staging** (optional) | A second free Supabase project and a second site (e.g. a Netlify site, or a Vercel preview) built with the staging keys | Separate. Try `schema.sql` changes here first. |

To switch `.env` between projects, re-run `npm run setup`, or keep copies such as
`.env.staging` and copy one over `.env`. Both are git-ignored.

---

## 5. Migrations

### 5.1 Database schema upgrades

`supabase/schema.sql` is written to be **re-run in full** on every upgrade. It uses
`create … if not exists`, `add column if not exists` and `create or replace`, and never
drops a table or deletes rows.

1. **Back up first.** On a paid plan, Supabase takes daily backups under **Database →
   Backups**. On the free plan, export a **Backup (JSON)** from /admin (posts only), or take
   a full dump (§6).
2. Run the whole file: `npm run deploy` does it when needed (tables missing or out of date, or
   `schema.sql` changed since it was last run), or `npm run setup` → step 6, or paste it into
   **SQL Editor** and click **Run**. With `SUPABASE_DB_URL` set to the database connection
   string and `psql` installed, `npm run deploy` runs it without asking.
3. Check with `npm run deploy:check`. It looks for the newest columns and for the `media`
   bucket.
4. Deploy the matching app version.

**Changes in the current version** (user management), in case you're upgrading an older
project:

| Change | Effect on existing data |
| --- | --- |
| `profiles.suspended` column (default `false`) | None; nobody is suspended. |
| `admin_list_users()` dropped and recreated with more columns | None. Older app builds still work with it. |
| New `admin_create_user`, `admin_set_password`, `admin_set_suspended`, `admin_delete_user` functions | None until used. Admin-only, enforced in the database. |
| `touch_post` trigger allows author changes only inside `admin_delete_user` | None |
| `guard_profile_update` stops non-admins changing `suspended` | None |

**Undoing an upgrade:** these additions are harmless to older app builds, so the usual
"undo" is just redeploying the previous app version (§3). To restore data, use a backup.

### 5.2 Demo mode → live site

Demo data lives only in the browser where you created it.

1. In that browser (demo site), sign in as admin and use **/admin → Backup (JSON)**.
2. On the live site, sign in as the manager and use **/admin → Restore backup (JSON)**.

What comes across:

| Comes across | Doesn't come across |
| --- | --- |
| Posts: title, body, excerpt, tags, language, cover, draft/published status, visibility | Users and passwords. Add people in **/admin → Users**. |
| Images and recordings uploaded in demo mode. They're inside the post body as `data:` URLs, so they're stored in the database row rather than the `media` bucket. Re-upload large videos if you want them in Storage. | Comments, likes, groups and role requests |
| | Authorship: imported posts belong to whoever imports them |
| | "Restricted" audiences: they point at demo user/group ids. Re-pick the people and groups in each post's audience sheet. |

### 5.3 Moving to another host

The data stays in Supabase, so only the static site moves.

1. Run `npm run setup`, choose the new host, then deploy.
2. In Supabase, go to **Authentication → URL Configuration** and change the Site URL and
   Redirect URLs to the new address. Keep the old one in the redirect list until DNS has
   switched.
3. In Google Cloud, if you use YouTube uploads, add the new origin under the OAuth
   client's **Authorized JavaScript origins**.
4. Move the custom domain's DNS records to the new host (README §8.4).
5. Turn off the old site.

Moving **to** GitHub Pages with no custom domain changes the base path to `/<repo>/`. The
workflow handles this, and the script sets `VITE_BASE` when a domain is used.

### 5.4 Changing the domain or the manager email

**Domain:**
1. Run `npm run setup` with the new domain.
2. Add the DNS records it prints.
3. Then repeat steps 2–3 of §5.3.
4. Old links like `https://old-domain/posts/…` stop working unless the old domain
   redirects to the new one at your registrar or host.

**Manager email:** the `admin` shortcut and the prebuilt account must use the same address.
- **Before running `schema.sql` the first time:** change it in `npm run setup` (step 4).
  That updates both.
- **On a live project:** the prebuilt account already exists. Sign in, change the email
  by hand in **Authentication → Users** in Supabase, set `VITE_ADMIN_EMAIL` to match, and
  redeploy. Re-running `schema.sql` after changing `admin_email` would create a second
  admin with the default password, so change that line too, or sign in once and change
  its password.

### 5.5 Moving to a new Supabase project

Reasons to move: a different region or organization, or a paused project you'd rather
start again.

**Light (posts only):**
1. In the old site, export **Backup (JSON)**.
2. Point `.env` at the new project with `npm run setup`, run `schema.sql`, and deploy.
3. Restore the backup in /admin.
4. Run `npm run migrate:media` to copy uploaded files into the new bucket.

Users, comments, likes and groups are not moved.

**Full (everything, including accounts and passwords):** this follows Supabase's own
backup and restore process. You need the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
(`brew install supabase/tap/supabase`, uses Docker) and `psql` (`brew install libpq`).
Use the **Session pooler** connection strings from each project's **Connect** dialog.

1. Dump the old project:
   ```bash
   supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
   ```
   ```bash
   supabase db dump --db-url "$OLD_DB_URL" -f schema-dump.sql
   ```
   ```bash
   supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only
   ```
2. Restore into the **new, empty** project. Don't run `schema.sql` there first: the dump
   brings the schema and the admin account. Replica mode stops triggers from re-creating
   profiles or rewriting post dates during the load.
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema-dump.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "$NEW_DB_URL"
   ```
3. Run `supabase/schema.sql` on the new project once. It recreates the `media` bucket and
   its policies if they weren't in the dump. It's safe either way.
4. Run `npm run setup` and point `.env` at the new project (new URL and key). The
   database step should report everything up to date.
5. Copy the uploaded files. The dump moves database rows, not the files themselves, and
   posts still link to the old project's storage address:
   ```bash
   npm run migrate:media
   ```
   It signs in to the new project as the manager (no secret key needed), finds every
   `…<old-ref>.supabase.co/storage/…/media/…` link in posts, and copies each file to the
   same path in the new bucket. It then prints, and copies to the clipboard, one SQL
   statement that rewrites the links to the new project. Run that in the new project's
   SQL editor. It keeps each post's "updated" date unchanged.
6. Update the host's secrets with the new URL and key: `npm run deploy` (GitHub: `npm run
   setup` re-sets the secrets). Set the Site URL and Redirect URLs in the new project
   (§5.3 step 2).
7. Run `npm run deploy:check`. Sign in with an existing account to confirm passwords came
   across. Keep the old project until you're satisfied, then delete it.

Files must still be reachable in the old project (public bucket, project not deleted)
while `migrate:media` runs. Recordings that went to YouTube are unaffected.

---

## 6. Backups and restore

| What | How | Restores |
| --- | --- | --- |
| Posts (quick) | /admin → **Backup (JSON)** | /admin → **Restore backup** (§5.2 limits apply) |
| Posts + media, readable offline | Menu → Export all → **ZIP** | Not importable. It's an archive. |
| Everything | `supabase db dump` ×3 as in §5.5 step 1, plus the `media` files | §5.5 steps 2–5 |
| Everything (paid plans) | Supabase **Database → Backups** (daily, point-in-time optional) | One click in the dashboard |

Keep dumps somewhere private: `data.sql` contains account emails and password hashes.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The live site shows **"Demo mode"** | It was built without the Supabase keys | GitHub: check the repo's Actions secrets, then re-run the workflow. Others: `npm run deploy` (it builds with `.env`). `deploy:check` confirms. |
| Blank page or 404 on `/posts/…` | Wrong base path, or no SPA fallback | GitHub without a custom domain needs `/<repo>/` (automatic). With a custom domain, set the `VITE_BASE=/` variable. Netlify / Vercel: keep `public/_redirects`. Cloudflare: the deploy removes `dist/404.html` and the catch-all `_redirects` so Pages' built-in SPA mode handles it. |
| "Wrong email or password" for `admin` / `admin` | `schema.sql` not run, or the admin email doesn't match `VITE_ADMIN_EMAIL` | `npm run deploy:check` reports both |
| `deploy:check`: "Schema is out of date" | New app code, old database | Re-run `schema.sql` (§5.1) |
| Sign-up email never arrives | Supabase's built-in mailer is rate-limited | Connect SMTP, or turn off "Confirm email" (README §8.1 step 4) |
| Sign-in redirects to localhost or the old site | Supabase Site URL / Redirect URLs | §5.3 step 2 |
| "Can't reach …supabase.co" | A free project pauses after about a week idle | Dashboard → **Restore project** |
| YouTube popup: "origin not allowed" | The OAuth client lacks the site's origin | Add the origin (no path) in Google Cloud |
| Uploaded YouTube videos are private | Unverified Google project | README §8.5 (audit) |
| Images broken after a project move | Posts still link to the old project's storage | `npm run migrate:media` (§5.5 step 5) |
| `gh: command not found` | GitHub CLI missing | `brew install gh`, then `gh auth login` |
| Cloudflare deploy went to a **preview** URL | The Pages project's production branch isn't the one deployed | `npm run deploy` detects it and offers to redeploy to the production branch (remembered in `.deploy.json` as `cfBranch`) |
| Cloudflare: "More than one account available" | Your login has several accounts | `npm run deploy` asks which one and remembers it; or set `CLOUDFLARE_ACCOUNT_ID` |
| Cloudflare upload fails on a Git-connected project | Projects created from a Git repo in the dashboard deploy on push only | Pick a new project name in `npm run setup`, or push to the repo instead |
| Pages: "Get Pages site failed" in Actions | Pages not set to GitHub Actions | Repo Settings → Pages → Source: **GitHub Actions**, then re-run |

> **Status:** the walkthrough, `.env` writing, key checks, database checks, build check
> and live-site checks were tested locally against stand-in servers. The real deploy paths
> (GitHub, Netlify, Cloudflare, Vercel), the `psql` route, and the copy and upload parts
> of `migrate:media` haven't been run against live accounts yet. If a host's CLI asks
> something unexpected, answer it there. The script just runs those CLIs.
