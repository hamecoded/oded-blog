# Changes

What each deploy added or fixed, newest first. Add one line under **Unreleased** for every feature or fix, as
you make it: `- Added: <what>: <details>` (or `Fixed:`, `Changed:`, `Removed:`). Keep `<what>` short: it
becomes the commit subject ("Add …; fix …"), and the whole line goes in the commit body. `npm run deploy`
(and `deploy:auto`) builds the commit message from these lines, then moves them under the deploy's date.

## Unreleased

## 2026-11-03 17:41

- Added: commit messages that explain each deploy: built from the lines under Unreleased in this file, which then move under the deploy's date
- Fixed: deploy opening vi for a message: git and gh now run with no editor, and with --yes gh can't stop to ask

## 2026-11-03 17:30

- Added: `npm run deploy:auto` (`npm run deploy -- --yes`) deploys in one go with no questions, with a commit message written from the changed files
- Fixed: tag group sheet: tapping a chosen tag's text, the help line or the box's edge deleted chosen tags (the field was a label, which passed taps to the first × button)
- Fixed: Admin → Users: tapping the temporary-password title or its help text silently generated a new password

## 2026-11-03 17:21

- Added: the main blog's /tags page lists every tag group, with a link to its site
- Fixed: tag group sheet on phones: tag suggestions didn't show; they're now tappable chips under the field that filter as you type
- Fixed: Admin on phones: the tabs ran off screen, so Tag groups couldn't be reached; they wrap now, and tag group rows put their buttons on their own line

## 2026-11-03 02:58

- Fixed: tag-group sites: the site's articles, tags and search pages shared as oded.me (and an empty card); each now gets its own preview page with the group's name and image
- Fixed: landing carousel: posts without a cover show their first image or video thumbnail instead of a letter
- Fixed: a call-to-action link typed without a leading slash, or as #section, came out broken
- Changed: landing page headings use the interface font (Heebo), like the rest of the site

## 2026-11-03 02:47

- Fixed: tag-group site post pages redrew themselves endlessly, so embedded YouTube videos stayed black

## 2026-11-03 02:17

- Changed: tag-group sites respect the signed-in reader's permissions: members-only and shared posts show to those allowed
- Added: sharing to Facebook and LinkedIn copies the title, summary and hashtags to paste; WhatsApp, X, Telegram and email get them filled in
- Added: the share sheet warns when a post's preview page isn't built yet; the site rebuilds every 15 minutes

## 2026-11-03 02:01

- Added: tag groups: admin-managed "sites inside the site" at their own address, showing only posts with the group's tags, with a promotional landing page (welcome video, parallax background, post carousel), visitor comments with a name, likes without an account, and per-group export
