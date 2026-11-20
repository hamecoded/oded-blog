# Changes

What each deploy added or fixed, newest first. Add one line under **Unreleased** for every feature or fix, as
you make it: `- Added: <what>: <details>` (or `Fixed:`, `Changed:`, `Removed:`). Keep `<what>` short: it
becomes the commit subject ("Add …; fix …"), and the whole line goes in the commit body. `npm run deploy`
(and `deploy:auto`) builds the commit message from these lines, then moves them under the deploy's date.

## Unreleased

## 2026-11-20 10:45

- Fixed: To-do "Save to phone contacts" on iPhone and iPad opens the contact card (Safari's "Create New Contact") instead of the share sheet, which had no way to add it to Contacts
- Fixed: To-do contact editing: space above the Save / phone-contacts buttons row
- Changed: To-do saved contacts show as a card (initials, name, tappable phone and email, note, call / mail / phone-contacts icons) with an edit button that opens the editing fields again; Save there turns it back into a card
- Added: To-do contacts have a Save button that lights up while there are unsaved changes (on an event it saves the event's contacts; on an open task it saves the task without closing it), then says "Saved"
- Added: To-do events keep insights as well as tips ("Insights and tips"): pick the kind when adding, tap an entry's kind to switch it; older tips stay tips
- Added: To-do Events tab (in place of Tags in the bottom bar; Tags stays in the top bar): events with a date, listed as coming up, not dated yet and past; each event has its details, items that stay out of the pool until made a task, its tasks, tips and contacts; deleting one keeps its tasks
- Added: To-do task field "Event" ties a task to an event; the task shows the event as a chip and on the event's page
- Changed: To-do contacts (on tasks and events) have first and last name, and "Save to phone contacts" hands the phone a contact card (vCard) with the event's name as the job title; older contacts' names are split at the first space
- Added: schema.sql: `todo_events` table (owner-only RLS) and `todos.event_id` (on delete set null); run `npm run db:update`
- Changed: In the to-do app the top bar's "Tags" link is back, and opens the app's own Tags tab (its topics)
- Added: To-do tag topics can take in existing tasks: a searchable "Add an existing task" picker (in outline order, goals showing how much is under them) adds the tag; a goal brings its steps and actions along
- Added: To-do Tags tab can start a new topic: name it and it opens empty with the add box ready; every task added there (quick add or with details) carries the tag, and the topic's card appears once it has one
- Changed: To-do journeys page shows the same level bar as the other tabs (app icon, level, XP, streak); an open journey's heading row sits above it, like an open topic's
- Added: To-do journeys page: stage filters with counts (all, under way, not started, finished), a tag filter (a journey matches when it or anything under it carries the tag), sorting (my order, progress, recently active, deadline, name), and drag-and-drop reordering in "My order"
- Changed: To-do task sheet's drill-down bar has fixed places: a path row (goals button in the corner, the path with names shortened to fit, a compact "‹ 2/3 ›" stepper) and an action row of equal slots (drill down or break into steps, make it a goal), so a full bar no longer wraps into a jumble
- Changed: To-do task sheet: the title comes first, above the drill-down bar with its quick actions (both stay pinned)
- Changed: To-do tag topics set each goal apart with everything under it: a block with space around it, gold guide lines and a gold tint; the topic cards list goals with a flag and their progress
- Changed: To-do tag topics are an outline, like the pool: a tagged task brings everything under it, steps and actions sit indented under their parent, fold and unfold, and drag among their siblings
- Added: Error page: when a page or the whole app crashes, a game-style "glitch" screen (instead of the router's bare error) says in plain words what went wrong and what to do (a new version came out, the connection dropped, the database needs updating, a missing piece of data, or a bug), shows what the browser said and where, and copies a full technical report for the developer
- Changed: To-do Lists tab replaced by a Tags tab: every #tag is a topic card in its own colour (open count, next tasks, progress); a topic lists its tasks in your own order, reordered by drag and drop, each with a "Today" button (or an "on today" mark), done ones folded below
- Removed: To-do named lists (`todos.lists`, @name in quick add, "Group by list"): existing list names become tags; schema.sql merges them and drops the column

## 2026-11-19 22:48

- Fixed: To-do task sheet: the break-down chip no longer spills out of the navigation bar when it holds many chips; the row wraps
- Added: To-do task sheet footer has a move button that follows where the task is: "Today" from the pool, "Pool" from Today (saves and closes)
- Changed: To-do pool and done list leave out a goal (journey) that has no steps yet; it stays on the journeys page
- Added: To-do goal rows are marked as goals (a gold edge and a "Goal" chip), so they stand apart from tasks in the done list and elsewhere
- Changed: To-do task sheet: the navigation bar no longer shows a "this task" chip pointing at the open task; the path lists only its goal and parents
- Changed: Inside an app, the top bar no longer shows the Tags and Search links
- Changed: The floating menu button is hidden inside an app (it stays on the Apps page itself)
- Changed: To-do bottom tabs: Journeys moved next to Today, on the other side from the pool (in Hebrew, right to left: Lists, Pool, Today, Journeys, Done)

## 2026-11-19 22:24

- Changed: To-do Today tab is a raised round button in the middle of the tab bar, always in the accent colours (glowing when it's the open tab)
- Changed: To-do bottom tabs reordered so Today is in the middle: Journeys, Pool, Today, Lists, Done
- Changed: To-do: the Journeys tab always opens on the list of journeys; the navigation bar of a task with nothing above or below it no longer shows the lone "this task" chip
- Fixed: To-do: opening a new task with details (the sliders button by the add field) crashed the app since the navigation bar came in (it looked for a label for a new top-level task that didn't exist)
- Changed: To-do "Part of" dropdown starts with a clear "No goal" choice (a task of its own), and is offered on new tasks too, so a task can be filed under a goal (or step), or under none, while it's being created
- Changed: To-do app has no "← Apps" header row any more: the app's icon sits at the start of the level bar (or of the top row on Journeys) and leads back to the Apps page; the level badge moved to the other end of the bar, next to the streak
- Changed: To-do level bar: on Today it shows the day's list (tasks done out of the tasks set for today, one tick per task); on the other tabs it stays the XP towards the next level; it's gone from Journeys; the today ring with its "–" at the end of the bar is removed
- Added: To-do undo: completing a task (or marking it done or quit in the morning review) shows "Done: …  Undo" for 5 seconds with a draining bar; Undo puts the task back as it was (stage, day list and log), and the XP goes with it. It shows over an open task sheet too
- Added: To-do goals: "Make it a goal" in a task's navigation bar promotes it to a goal (a journey): out of its parent with its own steps, off the day lists, listed in Journeys and the goals menu even before it has steps; new journeys start as goals; "Not a goal" takes the mark off a goal without steps. The top tier is now called Goal (יעד). Needs `npm run db:update` (new `todos.goal` column)
- Fixed: pinned bars not staying put when scrolling the page (the site header, the post editor's toolbar, table heads, the to-do top bar): the page body's `overflow-x: hidden` made it a scroll container of its own, which breaks `position: sticky`; it's now `overflow-x: clip`
- Changed: To-do journeys (and an opened list or tag): the row with the back button now sits at the very top, above the level bar, and stays pinned while scrolling
- Added: To-do task navigation bar: a bold bar at the top of every task's sheet showing its drill-down path from the goal (goal → step → action, each tier coloured and tappable), a Goals menu to jump to any goal with its progress, previous/next among its siblings, and a menu to drill into its subtasks (or "Break into steps" when it has none). Replaces the small "part of" line
- Changed: To-do task form puts the task's flow first: subtasks (now a highlighted card with a progress bar), stage, what it waits for and what it's part of; then description, today/pool, type, lists and tags; priority, urgency and dates come last
- Added: To-do tasks have a main link: a field under the description in the task form with an Open button, a link button next to the title, and a link button on the task's row in every list (opens in a new tab; plain addresses get https://, only web addresses are kept). Needs `npm run db:update` (new `todos.link` column) before deploying
- Changed: Apps store shows the To-do app first

## 2026-11-19 19:28

- Added: post summary on the post page: shown under the title and tags, two lines with "Read more" / "Show less" (the button only appears when the summary is longer than two lines); printed and PDF versions show the whole summary. Hidden when no summary was written (the one filled in from the body for list cards doesn't count); the editor now shows such a summary as empty, so it is remade from the body on each save instead of going stale
- Changed: To-do: a task with subtasks has no "Today" button in the pool, lists or reminders (it never goes on Today itself; its subtasks keep theirs)

## 2026-11-11 02:13

- Changed: To-do task form dropdowns are the app's own: "Depends on" and "Part of" open a card listing tasks with their type icon, depth and tier, with a search box when the list is long; the lists and tags fields suggest matching names in the same style instead of the browser's popup
- Changed: To-do task form ordered by importance: title, then today/pool, priority and urgency, deadline and due date, stage, description, steps, type, lists and tags (each with a line saying what it's for), reminder, complexity and estimate, what it waits for, and what it's part of; the lists field now reads "List name, e.g. Shopping"
- Added: To-do levels sheet: tapping the level badge opens an explanation: your level, rank and XP to the next level; how a task's XP is worked out (base, complexity, priority and a bonus per type, with an example), the ladder of levels with their XP and rank names, and what the streak and today's ring mean
- Added: To-do tooltips on every icon in the task lists (stage orb, type, part of, dates, reminder, urgency, complexity, steps, lists, tags, waiting-for, and the row buttons): on hover with a mouse, on keyboard focus, or by pressing and holding on a phone (the long press doesn't also open or complete the task)
- Fixed: the "checking you are human" step blocking sign-in where Turnstile can't run: it's now off in demo mode and on local addresses (localhost, an IP such as the dev server opened from a phone, .local names), so the sign-in button no longer waits forever
- Added: To-do pool: fold and unfold what's under any task with subtasks (chevron on its row; folded, it shows how many are hidden); remembered per browser
- Changed: To-do: a task with subtasks never sits on Today, only its subtasks do. "Today" on such a task in the pool or reminders sends its next open subtask (going down into actions, preferring one that isn't waiting); a task on Today that gets its first subtask hands its place to it; its sheet explains instead of offering Today
- Fixed: the site on a plain-http address (the dev server opened from a phone at http://10.x.x.x:5173): sign-in and new ids failed because browsers hide crypto.randomUUID and crypto.subtle there; uid() falls back to getRandomValues and sha256Hex() to a built-in SHA-256 (checked against Node's)
- Added: `npm run dev:phone`: the dev server in demo mode for a phone on the same Wi-Fi (blanks the Supabase and Turnstile keys; fixed port 5173, so a server already running there is reported instead of a silent move to 5174)
- Changed: To-do add fields (quick add, new purpose, add step) follow the interface direction (right to left in Hebrew) instead of switching with the typed text
- Changed: To-do sort and group menus are the app's own dropdowns (a chip opening a card of choices, with a check on the current one) instead of the browser's native select
- Added: To-do: a "Pool" button on each open task in Today sends it back to the pool, with a message saying so
- Changed: To-do: the bare up-arrow on pool and reminder rows is now a labelled "Today" button (sun icon), and a message says the task moved to today's list
- Added: To-do pool: drag a nested step or action by its grip to reorder it among its siblings (what's under it moves along; a line shows where it lands; the page scrolls near the edges); arrow keys on the grip move it one place
- Changed: To-do quick add: the decorative plus at the start of the field is gone (it looked like a button); an Add button appears at the end once something is typed
- Changed: To-do pool shows nested tasks as an outline: steps indented under their purpose and actions under their step, in their own order, joined by a guide line
- Added: To-do step order by dragging: in a task's sheet, drag the grip on a step (or action) to put it elsewhere in the order; the other rows slide aside to show where it lands, the sheet scrolls along, and the grip also takes the up/down arrow keys. The quest road follows the new order
- Added: To-do "Part of" in the task sheet: move a task, with everything under it, to the end of another purpose's or step's list, or make it a task of its own
- Changed: To-do task sheet keeps the task's title (and where it belongs) pinned at the top while the form scrolls
- Changed: no zooming the page on phones (pinch or double tap), site-wide
- Fixed: To-do task sheet date fields overlapping on phones: the three dates now stack, one row each

## 2026-11-09 10:14

- Added: To-do app (/apps/todo), played as a game: each day starts with a clean Today list; unfinished tasks from earlier days come up the next morning as a swipeable card stack (keep today, or save to the pool after refining priority and urgency and setting a remind-me date; or mark done / quit); pooled tasks come back on their reminder date. XP, levels, a streak and today's ring on a canvas HUD, particle bursts and confetti on completing. Tabs at the bottom: Today, Pool, Quests, Lists, Done
- Added: To-do tasks have a type (understanding, learning, achieving, decisions, checking, opportunities, enrichment, planning), stage (discovered, researched, defined, in progress, completed; blocked, on hold, quit), due, estimated and deadline dates, priority, urgency, complexity, tags, lists, dependencies, data values, contacts, comments and a log (stage and day moves are logged automatically)
- Added: To-do quests: a root purpose broken into steps and steps into actions (root, previous and next task), drawn as a road on a canvas with locked and current steps and a trophy; lists are the tasks naming the same list, grouped by tag

## 2026-11-08 03:41

- Added: apps: a grid icon in the top bar, for signed-in users, opens /apps, an app-store page built automatically from src/apps (one folder per app, each with an app.ts listing: name, tagline, description, icon, cover image, category, tags, status, version, date, external link); /apps/<app> opens one. First entry: a to-do list, marked Coming soon
- Added: Possessions app (/apps/possessions): each signed-in user's private list of things they own. Import Excel/CSV in steps (say the category first, e.g. Book; an item-type column overrides it per row; match columns; review and edit every row before adding), edit cells in place, add and delete rows, category cards to show/hide categories, location with a dropdown of places used before, a photo per item, totals in a chosen currency, and a printable list grouped by category
- Added: Possessions import of workbooks with several sheets: all sheets come in together; untick a sheet to ignore it entirely, give a sheet its own category, and match each sheet's columns
- Changed: Possessions has two levels: item type (Book) and category within it (Health). Item-type cards filter; choosing one shows its categories as chips to hide or show; imports ask for the item type and take categories from a category/genre column; the printed list groups by item type, then category
- Added: Possessions table columns can be dragged to reorder and hidden from the header on hover (desktop); a Columns menu shows, hides and reorders them on any device and remembers the layout in the browser
- Fixed: Possessions: editing a cell (an item type, say) re-sorted the table at once, so the row jumped and the next click or typing landed on another row; rows now keep their place until you sort, filter or search
- Fixed: Possessions: picking from a dropdown could click through to the cell underneath, and an edit could save twice
- Changed: Possessions dropdowns (item type, category, location) are a floating card with a label, accent border and icons, and offer what you typed first as "Use …", so they can't be mistaken for table rows
- Added: Possessions multi-edit: ⌘/Ctrl-click or Shift-click cells in a column and type once to change them all; or tick rows and use "Set a field" in the selection bar
- Fixed: Possessions: a dropdown floated over the toolbar and page header when the table scrolled; it now hides while its cell is scrolled out of view and always fits on screen
- Added: Possessions "Set a field" can set several fields at once (+ Field)
- Added: Possessions photos from the camera: phones open their camera app, computers get a live webcam preview with a shutter button; the photo sheet offers Take a photo, Choose a file and Remove
- Fixed: Possessions printed list zig-zagged when Hebrew and English items were mixed (each line aligned to its own language); every line now follows the page's direction, with mixed text isolated inline
- Changed: Possessions table pins Item type next to Title (fixed widths, always first, stays in view when scrolling sideways; on phones only Title is pinned); it's no longer in the Columns menu
- Added: Possessions rows can be dragged into your own order within an item type (grip ⠿, mouse or touch, or ↑/↓ on the focused grip); the order is saved (new `position` column) and is the default sort, with "Back to your order" after sorting by a column
- Changed: Possessions photos are made small before upload: at most 1200px, WebP (JPEG where the browser can't write WebP), and their metadata, including GPS position, is dropped (a 4.9 MB phone photo becomes about 70 KB)
- Added: Possessions photo background removal (IMG.LY @imgly/background-removal 1.7, AGPL-3.0, runs in the browser; the model, about 100 MB, downloads from IMG.LY on first use): "Remove background" with Undo in the photo sheet, and an option to do it automatically for new photos
- Changed: Possessions shows "the database isn't ready, run npm run db:update" instead of a raw error when the live database lacks the possessions table
- Added: Possessions print options: group the printed list by any column (item type then category, category, author/brand, location, condition, year purchased, quantity, a spreadsheet's own columns, or no grouping) and include photos or not; remembered in the browser
- Fixed: Possessions item-type dropdown hid behind the pinned item-type cells of the rows below; dropdowns now render above the table (in the page, or the open dialog)
- Added: Possessions category chips have "Hide all" next to "Show all", to start from nothing and turn on just the categories wanted
- Changed: Possessions background removal shows its progress on the row's photo too and confirms when done ("Background removed"), so it's visible after closing the photo window; uses @imgly/background-removal 1.7 (model isnet_fp16)
- Added: Possessions cards view for phones (the default there; Table/Cards switch in the toolbar, remembered per device): one card per item with photo, title, item type · category, author/brand, location and value; tap a card for a form with every field; tick boxes and drag-to-reorder work on cards too
- Fixed: Possessions on phones: no zooming on this page (pinch, double-tap, or the automatic zoom into fields: inputs use 16px text and the viewport is fixed while the app is open); the table there scrolls sideways only, doesn't drag the page along, and taps no longer leave cells highlighted
- Changed: Possessions cards view: "Add item" opens the new item's form with the cursor in its title
- Changed: Possessions on phones: the totals come after the list instead of above it
- Changed: Possessions on phones: compact header and toolbar (icon buttons), item types and categories as single scrolling rows of chips, no hint lines, so the list starts much higher
- Fixed: Possessions item form on phones: fields side by side (item type/category, quantity/cost/value, date/condition) overlapped; they now shrink to fit, and the Save bar has its own edge
- Added: Possessions photo window has a Done button (the main action once there's a photo) to close it after adding a picture
- Added: sign-ups with machine-made names or e-mails (like cdBcejzKTYXUYQrtNTbE) are created on hold (suspended, waiting for approval), checked in the database (looks_machine_made in schema.sql) and the demo backend alike; the person is told the account needs a check
- Added: /admin → Users: count on the tab, a warning with "Show them" and "Delete all", a "Needs review" filter, and Approve / Delete on each flagged account (older accounts with such names too); approved accounts are never flagged again
- Added: optional Cloudflare Turnstile "are you human" check on sign-up and sign-in (VITE_TURNSTILE_SITE_KEY; README §8.8), plus a hidden honeypot field and a minimum fill time on sign-up
- Changed: privacy policy mentions Turnstile and held sign-ups
- Changed: printing is allowed on app pages for every signed-in user (the blog itself still prints for the manager only)
- Changed: privacy policy mentions the Possessions app
- Changed: deploy's schema check also looks for the possessions table, so it asks to re-run schema.sql
- Added: `npm run db:update`: runs supabase/schema.sql on the live database straight away (psql with SUPABASE_DB_URL, or asks: SQL editor or psql), then checks it

## 2026-11-04 01:34

- Fixed: tag group sheet saving half-filled settings: Enter (a phone keyboard's Go key) submitted the form, saving and closing the sheet mid-way; it now moves to the next field, and only Save saves
- Changed: landing call-to-action setup: pick WhatsApp, email, phone call, web link or a site page and fill in plain fields (number, ready-made message, address, subject); the sheet builds and previews the link, and the button shows a matching icon

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
