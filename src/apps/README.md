# Apps

Small apps that live inside the blog. Signed-in users reach them from the grid icon in the top bar:
`/apps` is the store, `/apps/<id>` opens one. The store builds itself from this folder: nothing to register.

## Adding an app

Copy `_template/` to a new folder. The folder name is the app's id and address (lowercase, dashes):
`src/apps/todo` → `/apps/todo`. Folders starting with `_` are skipped.

```
src/apps/<id>/
  app.ts      required: the store listing (default export, type AppManifest in types.ts)
  App.tsx     the app itself: a default-exported component, no props (lazy-loaded when opened)
  cover.png   optional pictures, imported from app.ts
  …           anything else the app needs
```

## Store listing fields (`app.ts`)

| Field | Required | Shown as |
| --- | --- | --- |
| `name` | ✓ | Title on the tile and the app page (`{ en, he }`) |
| `description` | ✓ | Up to three lines on the tile |
| `icon` | ✓ | Square icon: a lucide-react icon on the gradient, or an image URL |
| `tagline` | | Short line under the name |
| `image` | | Wide cover across the top of the tile (about 16:9); without it the gradient shows |
| `colors` | | `[from, to]` gradient for the icon and image-less cover |
| `category` | | Chip on the tile; with two or more categories the store shows filter chips |
| `tags` | | `#tag` chips |
| `status` | | `live` (default), `beta` (badge, opens), `soon` (greyed out, can't open) |
| `version`, `updated` | | `v1.0 · 8 Nov 2026` in the tile footer; `updated` in the last 30 days adds a **New** badge |
| `url` | | App hosted elsewhere: the tile opens it in a new tab, no `App.tsx` needed |
| `featured` | | Listed first, two columns wide on desktop |
| `order` | | Sort order, lowest first (default 100) |

Images: put them in the app's folder and `import cover from './cover.png'` so Vite bundles them.

## Writing the app

- The page around it (top bar, back-to-apps link, title, sign-in check) comes from `src/pages/Apps.tsx`. The app
  draws only its own content and can use `useApp()` (`t`, `user`, `prefs.uiLang`, `toast`) like any page.
- Follow the blog's conventions: texts in both languages, logical CSS (`margin-inline-start`), the color tokens
  in `src/index.css`. App styles go in index.css under a `/* ───── App: <id> ───── */` section.
- Texts: keep them in the app's own `strings.ts` with `const he: typeof en`, so a missing translation fails the
  typecheck (see `possessions/strings.ts`).
- Data: an app that saves anything needs a table in `supabase/schema.sql` with row-level security limiting rows to
  their owner, and methods on the `Api` interface in both backends. `possessions` is the worked example.
- Printing works on app pages for every signed-in user; give the app print styles of its own.
