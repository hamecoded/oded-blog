#!/usr/bin/env node
// Deployment and configuration walkthrough for the oded.me blog. No dependencies.
//
//   npm run setup                 step-by-step: keys → .env → database → build → deploy → smoke test
//   npm run deploy                rebuild and redeploy to the host chosen during setup
//   npm run deploy:auto           the same in one go, with no questions (= npm run deploy -- --yes)
//   npm run deploy:check          check .env, the Supabase project, the build and (optionally) the live site
//   npm run db:update             run supabase/schema.sql on the live database now (psql or the SQL editor)
//   npm run migrate:media         copy uploaded files from an old Supabase project to the current one
//
// Add --dry-run to print every command and file write instead of doing it.
// Add --yes (or -y) to answer every question with its default: the commit message is written from the changed
// files. It stops rather than guess where a default isn't safe (a database that needs schema.sql, no git identity).
// See DEPLOYMENT.md for what each step does and how to do it by hand.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, '.env');
const STATE_FILE = join(ROOT, '.deploy.json');
const SCHEMA_FILE = join(ROOT, 'supabase', 'schema.sql');
/** Features and fixes, one line each under "## Unreleased"; the deploy turns them into the commit message. */
const CHANGES_FILE = join(ROOT, 'CHANGES.md');
const DEFAULT_ADMIN = 'admin@oded.me';
const HOSTS = ['github', 'netlify', 'cloudflare', 'vercel'];
const HOST_NAMES = { github: 'GitHub Pages', netlify: 'Netlify', cloudflare: 'Cloudflare Pages', vercel: 'Vercel' };

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const command = argv.find((a) => !a.startsWith('-')) ?? 'setup';
/**
 * --yes / -y: no questions; each takes its default. Used by `npm run deploy:auto`. Only for `deploy`: setup's
 * questions (keys, domain, host) have no safe defaults.
 */
const YES = command === 'deploy' && (argv.includes('--yes') || argv.includes('-y'));

// ───────────────────────── terminal helpers ─────────────────────────
const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint(1);
const dim = paint(2);
const green = paint(32);
const yellow = paint(33);
const red = paint(31);
const cyan = paint(36);

const say = (s = '') => console.log(s);
const ok = (s) => say(`${green('✔')} ${s}`);
const warn = (s) => say(`${yellow('!')} ${s}`);
const fail = (s) => say(`${red('✘')} ${s}`);
const info = (s) => say(`${dim('·')} ${s}`);
let stepNo = 0;
const step = (title) => say(`\n${bold(cyan(`── ${++stepNo}. ${title} `))}${cyan('─'.repeat(Math.max(4, 60 - title.length)))}`);

// Line reader that works both interactively and with piped answers (lines are queued, not dropped).
const muted = { on: false };
const echo = new Writable({
  write(chunk, _enc, cb) {
    if (!muted.on) process.stdout.write(chunk);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output: echo, terminal: !!process.stdin.isTTY });
const lines = [];
const waiting = [];
let inputClosed = false;
rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
rl.on('close', () => {
  inputClosed = true;
  while (waiting.length) waiting.shift()(null);
});
const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : inputClosed ? Promise.resolve(null) : new Promise((r) => waiting.push(r)));

async function ask(question, def = '') {
  if (YES) {
    say(`${bold('?')} ${question} ${dim(`→ ${def || '(empty)'}`)} ${dim('[--yes]')}`);
    return def;
  }
  process.stdout.write(`${bold('?')} ${question}${def ? dim(` (${def})`) : ''} `);
  const line = await nextLine();
  if (line === null) process.stdout.write('\n');
  else if (!process.stdin.isTTY) process.stdout.write(`${line}\n`);
  return (line ?? '').trim() || def;
}

async function askSecret(question) {
  if (YES) {
    warn(`${question}: can't be asked with --yes.`);
    return '';
  }
  process.stdout.write(`${bold('?')} ${question} ${dim('(hidden)')} `);
  muted.on = true;
  const line = await nextLine();
  muted.on = false;
  process.stdout.write('\n');
  return (line ?? '').trim();
}

async function confirm(question, def = true) {
  if (YES) {
    say(`${bold('?')} ${question} ${dim(`→ ${def ? 'yes' : 'no'}`)} ${dim('[--yes]')}`);
    return def;
  }
  const a = (await ask(`${question} ${dim(def ? '[Y/n]' : '[y/N]')}`)).toLowerCase();
  return a ? a.startsWith('y') : def;
}

async function choose(question, options, def = 0) {
  say(`${bold('?')} ${question}`);
  options.forEach((o, i) => say(`   ${i + 1}) ${o}`));
  if (YES) {
    say(dim(`  → ${def + 1} [--yes]`));
    return def;
  }
  for (;;) {
    const a = await ask('Choose a number', String(def + 1));
    const n = Number(a) - 1;
    if (Number.isInteger(n) && n >= 0 && n < options.length) return n;
    warn(`Type a number from 1 to ${options.length}.`);
  }
}

// ───────────────────────── process / file helpers ─────────────────────────
/**
 * Every git and gh command this script starts gets these: git never opens an editor (vi) for a message: a
 * merge or rebase keeps git's default message (GIT_EDITOR=true is a no-op editor), since the script asks for
 * the commit message itself. With --yes, gh never prompts either; it fails with a message instead.
 */
const NO_EDITOR_ENV = {
  GIT_EDITOR: 'true',
  GIT_SEQUENCE_EDITOR: 'true',
  GIT_MERGE_AUTOEDIT: 'no',
  GH_EDITOR: 'true',
  ...(YES ? { GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' } : {}),
};

function have(cmd) {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}

/** Run a command with inherited output. Secrets go in `env`, never in args. */
function run(cmd, args, { env, input, quietArgs } = {}) {
  const shown = `${cmd} ${quietArgs ? '…' : args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;
  if (DRY) {
    say(dim(`  [dry-run] $ ${shown}`));
    return { status: 0, stdout: '' };
  }
  say(dim(`  $ ${shown}`));
  // readline keeps the terminal in raw mode; interactive tools (gh auth login, netlify link…) need it cooked.
  const raw = process.stdin.isTTY && process.stdin.isRaw;
  if (raw) process.stdin.setRawMode(false);
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...(cmd === 'git' || cmd === 'gh' ? NO_EDITOR_ENV : {}), ...env },
    input,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });
  if (raw) process.stdin.setRawMode(true);
  if (res.error) fail(`${cmd}: ${res.error.message}`);
  return { status: res.status ?? 1 };
}

/** Run and capture stdout (for reading state; also runs in dry-run since it changes nothing). */
function capture(cmd, args, { env } = {}) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...(cmd === 'git' || cmd === 'gh' ? NO_EDITOR_ENV : {}), ...env } });
  return { status: res.status ?? 1, stdout: (res.stdout ?? '').trim(), stderr: (res.stderr ?? '').trim() };
}

function writeFile(path, text) {
  if (DRY) return say(dim(`  [dry-run] would write ${path.replace(`${ROOT}/`, '')}`));
  writeFileSync(path, text);
}

function openUrl(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  if (DRY || !have(opener)) return info(`Open: ${url}`);
  spawnSync(opener, [url], { stdio: 'ignore' });
  info(`Opened ${url}`);
}

function copyToClipboard(text) {
  const tool = process.platform === 'darwin' ? ['pbcopy', []] : process.platform === 'win32' ? ['clip', []] : ['xclip', ['-selection', 'clipboard']];
  if (!have(tool[0])) return false;
  return spawnSync(tool[0], tool[1], { input: text }).status === 0;
}

function readEnv() {
  const env = {};
  if (!existsSync(ENV_FILE)) return env;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

/** Update keys in .env, keeping comments and other lines. Empty value removes the key. */
function writeEnv(values) {
  const src = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : readFileSync(join(ROOT, '.env.example'), 'utf8');
  const seen = new Set();
  const out = src
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*#?\s*([A-Z0-9_]+)\s*=/);
      if (!m || !(m[1] in values)) return line;
      seen.add(m[1]);
      return values[m[1]] ? `${m[1]}=${values[m[1]]}` : `# ${m[1]}=`;
    });
  for (const [k, v] of Object.entries(values)) if (!seen.has(k) && v) out.push(`${k}=${v}`);
  writeFile(ENV_FILE, `${out.join('\n').replace(/\n+$/, '')}\n`);
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

// ───────────────────────── Supabase checks ─────────────────────────
function projectRef(url) {
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1] ?? null;
}

function jwtPayload(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Returns an error message, or null if the key looks like a public (anon / publishable) key. */
function checkPublicKey(key, url) {
  if (!key) return 'The key is empty.';
  if (key.startsWith('sb_secret_')) return 'That is a SECRET key. Use the publishable (anon) key — the secret key must never go in the site.';
  if (key.startsWith('sb_publishable_')) return null;
  const p = jwtPayload(key);
  if (!p) return 'That does not look like a Supabase key (expected sb_publishable_… or eyJ…).';
  if (p.role === 'service_role') return 'That is the SERVICE ROLE key. Use the anon key — the service key must never go in the site.';
  if (p.role !== 'anon') return `Unexpected key role "${p.role}". Use the anon / publishable key.`;
  const ref = projectRef(url);
  if (ref && p.ref && p.ref !== ref) return `This key belongs to project "${p.ref}", but the URL is for "${ref}".`;
  return null;
}

async function http(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: 0, text: String(e?.cause?.message ?? e.message ?? e) };
  }
}

/** Checks the project is reachable, the key works and the latest schema.sql has been run. */
async function checkDatabase(url, key) {
  const headers = { apikey: key };
  const base = url.replace(/\/$/, '');
  const results = [];
  const probe = await http(`${base}/rest/v1/profiles?select=id&limit=1`, { headers });
  if (probe.status === 0) return [{ ok: false, connection: true, msg: `Can't reach ${base} (${probe.text}). Is the project paused? Restore it in the dashboard.` }];
  if (probe.status === 401) return [{ ok: false, connection: true, msg: 'The key was rejected (401). Copy the publishable/anon key again.' }];
  if (probe.status !== 200) {
    return [{ ok: false, msg: `The tables are missing (HTTP ${probe.status}). Run supabase/schema.sql.` }];
  }
  results.push({ ok: true, msg: 'Project reachable, key accepted, tables present' });
  // The newest additions: tag groups (sites inside the site), visitors' comments and likes, the Possessions app.
  const [users, tagGroups, guests, possessions] = await Promise.all([
    http(`${base}/rest/v1/profiles?select=suspended&limit=1`, { headers }),
    http(`${base}/rest/v1/tag_groups?select=slug&limit=1`, { headers }),
    http(`${base}/rest/v1/comments?select=guest_name&limit=1`, { headers }),
    http(`${base}/rest/v1/possessions?select=id&limit=1`, { headers }),
  ]);
  const latest = { status: [users, tagGroups, guests, possessions].every((r) => r.status === 200) ? 200 : 400 };
  results.push(
    latest.status === 200
      ? { ok: true, msg: 'Schema is the latest version (tag groups, visitor comments and possessions present)' }
      : { ok: false, msg: 'Schema is out of date. Re-run supabase/schema.sql (safe, keeps data).' },
  );
  const bucket = await http(`${base}/storage/v1/object/public/media/__setup-probe`);
  results.push(
    /bucket not found/i.test(bucket.text)
      ? { ok: false, msg: 'Storage bucket "media" is missing. Re-run supabase/schema.sql.' }
      : { ok: true, msg: 'Storage bucket "media" exists' },
  );
  return results;
}

function report(results) {
  for (const r of results) (r.ok ? ok : fail)(r.msg);
  return results.every((r) => r.ok);
}

// ───────────────────────── build & smoke test ─────────────────────────
function buildEnv(env, state) {
  return {
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? '',
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? '',
    VITE_GOOGLE_CLIENT_ID: env.VITE_GOOGLE_CLIENT_ID ?? '',
    VITE_OAUTH_PROVIDERS: env.VITE_OAUTH_PROVIDERS ?? '',
    VITE_ADMIN_EMAIL: env.VITE_ADMIN_EMAIL ?? '',
    VITE_BASE: state.base ?? '/',
  };
}

/** True if the built bundle has the Supabase URL baked in (i.e. it is not a demo-mode build). */
function bundleIsLive(url) {
  const dir = join(ROOT, 'dist', 'assets');
  if (!url || !existsSync(dir)) return false;
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .some((f) => readFileSync(join(dir, f), 'utf8').includes(url.replace(/\/$/, '')));
}

function build(env, state) {
  info(`Building with base path ${state.base ?? '/'}`);
  const res = run('npm', ['run', 'build'], { env: buildEnv(env, state) });
  if (res.status !== 0) {
    fail('Build failed — see the errors above.');
    return false;
  }
  if (DRY) return true;
  if (env.VITE_SUPABASE_URL && !bundleIsLive(env.VITE_SUPABASE_URL)) {
    fail('The build does not contain your Supabase URL, so it would run in demo mode.');
    return false;
  }
  ok(env.VITE_SUPABASE_URL ? 'Built dist/ in live mode' : 'Built dist/ in DEMO mode (no Supabase keys)');
  return true;
}

async function smokeTest(siteUrl, supabaseUrl) {
  const site = siteUrl.replace(/\/?$/, '/');
  const home = await http(site);
  if (home.status !== 200) {
    fail(`${site} → ${home.status ? `HTTP ${home.status}` : home.text}. A new deploy can take a minute or two; try \`npm run deploy:check\` later.`);
    return false;
  }
  if (!home.text.includes('id="root"')) {
    fail(`${site} responds, but it isn't this blog. Check the address (the name may be taken by someone else).`);
    return false;
  }
  ok(`${site} is up`);
  let good = true;
  const deep = await http(`${site}posts/__setup-check`);
  if (deep.text.includes('id="root"')) ok('Deep links (/posts/…) load the app');
  else {
    fail('Deep links return a plain 404. The SPA fallback (_redirects / 404.html) is missing.');
    good = false;
  }
  const script = home.text.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  if (script && supabaseUrl) {
    const js = await http(new URL(script, site).href);
    if (js.text.includes(supabaseUrl.replace(/\/$/, ''))) ok('The live site is connected to Supabase (no demo banner)');
    else {
      fail('The live site was built without your Supabase keys, so it shows the demo banner.');
      good = false;
    }
  }
  return good;
}

// ───────────────────────── steps ─────────────────────────
async function preflight() {
  step('Checking your machine');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    fail(`Node ${process.versions.node} is too old. Install Node 20 or newer.`);
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);
  if (!existsSync(join(ROOT, 'node_modules'))) {
    warn('Dependencies are not installed.');
    if (await confirm('Run npm install now?')) run('npm', ['install']);
  } else ok('Dependencies installed');
  for (const [cmd, why] of [
    ['git', 'needed for GitHub Pages'],
    ['gh', 'GitHub CLI, used to create the repo and set secrets (brew install gh)'],
    ['psql', 'optional: run schema.sql from here instead of the SQL editor (brew install libpq)'],
  ]) {
    if (have(cmd)) ok(`${cmd} found`);
    else info(`${cmd} not found — ${why}`);
  }
}

async function chooseHost(state) {
  step('Where will the site live?');
  const i = await choose(
    'Hosting (all free for a personal blog):',
    [
      'GitHub Pages — builds on every push to main (needs a public repo and the gh CLI)',
      'Netlify — uploads the build from this computer',
      'Cloudflare Pages — uploads the build from this computer',
      'Vercel — uploads the build from this computer',
    ],
    Math.max(0, HOSTS.indexOf(state.host ?? 'github')),
  );
  state.host = HOSTS[i];
  const domain = await ask('Custom domain? Leave empty to use the host’s free address', state.domain ?? '');
  state.domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (state.host === 'github') {
    let owner = capture('gh', ['api', 'user', '--jq', '.login']).stdout;
    while (!owner) {
      owner = (await ask('GitHub username', state.owner ?? '')).trim();
      if (!owner) warn('The GitHub username is needed for the repository and the site address.');
    }
    state.repo = await ask('GitHub repository name', state.repo ?? 'oded-blog');
    state.owner = owner;
    setGitHubUrls(state);
  } else {
    state.base = '/';
    for (;;) {
      state.project = await ask('Project / site name on the host', state.project ?? 'oded-blog');
      if (state.host !== 'cloudflare') break;
      const clean = cloudflareName(state.project);
      if (clean && clean !== state.project) warn(`Cloudflare project names use only a–z, 0–9 and dashes. Using "${clean}".`);
      if ((state.project = clean)) break;
      warn('Type a name with at least one letter or digit.');
    }
    const free = { netlify: `https://${state.project}.netlify.app/`, cloudflare: `https://${state.project}.pages.dev/`, vercel: `https://${state.project}.vercel.app/` }[state.host];
    state.siteUrl = state.domain ? `https://${state.domain}/` : free;
  }
  ok(`${HOST_NAMES[state.host]} → ${state.siteUrl}`);
  if (state.host !== 'github' && !state.domain) info('The final address may differ if that name is taken; the deploy step prints the real one.');
}

async function configureSupabase(env) {
  step('Supabase project and keys');
  say('Create a project at https://supabase.com (free). For Israel, pick the Frankfurt region.');
  say('Then copy the Project URL and the publishable / anon key from Project Settings → API Keys.');
  if (!env.VITE_SUPABASE_URL && (await confirm('Open the Supabase dashboard now?', true))) openUrl('https://supabase.com/dashboard/projects');
  for (;;) {
    const url = (await ask('Project URL', env.VITE_SUPABASE_URL ?? '')).replace(/\/$/, '');
    if (!url) {
      if (await confirm('No URL — deploy in DEMO mode (data only in each visitor’s browser)?', false)) return { ...env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' };
      continue;
    }
    if (!projectRef(url)) {
      warn('Expected something like https://abcd1234.supabase.co');
      continue;
    }
    const key = await ask('Publishable (anon) key', env.VITE_SUPABASE_ANON_KEY ?? '');
    const err = checkPublicKey(key, url);
    if (err) {
      fail(err);
      continue;
    }
    ok(`Project ${projectRef(url)}`);
    return { ...env, VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key };
  }
}

async function configureAdmin(env) {
  step('Manager (admin) account');
  say(`A prebuilt manager is created by schema.sql. Signing in as just "admin" maps to its email.`);
  const schema = readFileSync(SCHEMA_FILE, 'utf8');
  const current = schema.match(/admin_email text := '([^']+)'/)?.[1] ?? DEFAULT_ADMIN;
  const email = (await ask('Manager email', env.VITE_ADMIN_EMAIL || current)).toLowerCase();
  if (email !== current) {
    if (await confirm(`Change the email in supabase/schema.sql from ${current} to ${email}?`, true)) {
      writeFile(SCHEMA_FILE, schema.replace(`admin_email text := '${current}'`, `admin_email text := '${email}'`));
      ok('schema.sql updated');
    } else warn('Then the "admin" shortcut will not match the account the SQL creates.');
  }
  return { ...env, VITE_ADMIN_EMAIL: email === DEFAULT_ADMIN ? '' : email };
}

async function configureYouTube(env, state) {
  step('YouTube uploads (optional)');
  say('Lets authors upload recorded videos straight to YouTube. Without it, videos are saved in Supabase Storage.');
  if (!(await confirm('Set up YouTube uploads?', !!env.VITE_GOOGLE_CLIENT_ID))) return { ...env, VITE_GOOGLE_CLIENT_ID: '' };
  say(`In Google Cloud: enable "YouTube Data API v3", set up the OAuth consent screen with the youtube.upload scope,`);
  say(`and create an OAuth client ID of type "Web application" with these Authorized JavaScript origins:`);
  say(`   ${new URL(state.siteUrl).origin}`);
  say('   http://localhost:5173');
  say(dim('Full steps: README §8.5'));
  if (await confirm('Open Google Cloud credentials now?', !env.VITE_GOOGLE_CLIENT_ID)) openUrl('https://console.cloud.google.com/apis/credentials');
  for (;;) {
    const id = await ask('OAuth client ID (empty to skip)', env.VITE_GOOGLE_CLIENT_ID ?? '');
    if (!id || /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) return { ...env, VITE_GOOGLE_CLIENT_ID: id };
    warn('Expected something like 1234567890-abc123.apps.googleusercontent.com');
  }
}

function saveEnv(env) {
  writeEnv({
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    VITE_GOOGLE_CLIENT_ID: env.VITE_GOOGLE_CLIENT_ID,
    VITE_OAUTH_PROVIDERS: env.VITE_OAUTH_PROVIDERS,
    VITE_ADMIN_EMAIL: env.VITE_ADMIN_EMAIL,
  });
  ok('Saved .env (git-ignored; holds only public values)');
}

/** psql connection settings from a postgres:// URI, passed via env so the password never shows in `ps`. */
function pgEnv(uri) {
  const u = new URL(uri);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1) || 'postgres',
    PGSSLMODE: 'require',
  };
}

/** Fingerprint of schema.sql, saved once it has been run, so a changed file is noticed on the next deploy. */
const schemaHash = () => createHash('sha256').update(readFileSync(SCHEMA_FILE)).digest('hex').slice(0, 16);

/**
 * Runs schema.sql on the database: with psql when SUPABASE_DB_URL is set (no questions), otherwise the person
 * picks the SQL editor (clipboard) or psql. Returns true when the database checks pass afterwards.
 */
async function applySchema(env, state) {
  say('schema.sql creates the tables, security rules, the "media" bucket and the prebuilt manager. It is safe to re-run.');
  const ref = projectRef(env.VITE_SUPABASE_URL);
  const dbUrl = process.env.SUPABASE_DB_URL;
  let how;
  if (dbUrl && have('psql')) {
    info('Running it with psql, using SUPABASE_DB_URL.');
    how = 1;
  } else if (YES) {
    // The SQL editor needs a person to paste and press Run; only psql with SUPABASE_DB_URL works unattended.
    warn('schema.sql needs to run, and --yes can run it only with psql and SUPABASE_DB_URL set.');
    info('Run `npm run deploy` without --yes once (or set SUPABASE_DB_URL), or run schema.sql in the SQL editor.');
    return false;
  } else {
    how = await choose('How do you want to run it?', [
      'Copy it to the clipboard and open the Supabase SQL editor (paste, then Run)',
      'Run it from here with psql (needs the database connection string)',
      'Skip — I’ll do it later',
    ]);
  }
  if (how === 0) {
    if (copyToClipboard(readFileSync(SCHEMA_FILE, 'utf8'))) ok('schema.sql copied to the clipboard');
    else warn('Could not copy automatically. Open supabase/schema.sql and copy all of it.');
    openUrl(`https://supabase.com/dashboard/project/${ref}/sql/new`);
    await ask('Paste it into the editor, click Run, then press Enter here');
  } else if (how === 1) {
    if (!have('psql')) {
      fail('psql is not installed (macOS: brew install libpq && brew link --force libpq).');
      return false;
    }
    let uri = dbUrl;
    if (!uri) {
      say(`Connection string: dashboard → Connect → "Session pooler" URI, with your database password filled in.`);
      say(dim('Tip: export SUPABASE_DB_URL=<that string> before `npm run deploy` and this step runs without asking.'));
      uri = await askSecret('postgres:// connection string');
    }
    if (!uri.startsWith('postgres')) {
      fail('That is not a postgres:// connection string.');
      return false;
    }
    const res = run('psql', ['--single-transaction', '--variable', 'ON_ERROR_STOP=1', '--quiet', '--file', SCHEMA_FILE], { env: pgEnv(uri) });
    if (res.status !== 0) {
      fail('psql reported an error (see above). Nothing was changed, because it runs in one transaction.');
      info('"tenant/user … not found" means the pooler host or region is wrong: copy the whole string from');
      info(`https://supabase.com/dashboard/project/${ref}?showConnect=true → "Session pooler" instead of typing it.`);
      info('"password authentication failed": reset it in Project Settings → Database.');
      if (dbUrl) info('The string came from SUPABASE_DB_URL: fix it there, or `unset SUPABASE_DB_URL` to be asked.');
      return false;
    }
  } else {
    warn('Skipped. The site will not work until schema.sql has been run.');
    return false;
  }
  if (DRY) return true;
  const good = report(await checkDatabase(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY));
  if (good) {
    state.schemaHash = schemaHash();
    saveState(state);
  } else warn('Still failing. If the SQL editor showed an error, fix it and run `npm run deploy` again.');
  return good;
}

async function setupDatabase(env, state) {
  step('Database: run supabase/schema.sql');
  if (!env.VITE_SUPABASE_URL) return info('Demo mode — no database to set up.');
  const before = await checkDatabase(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  if (before.every((r) => r.ok)) {
    report(before);
    if (!(await confirm('The schema is already up to date. Run it again anyway?', false))) {
      state.schemaHash ??= schemaHash();
      return saveState(state);
    }
  } else {
    report(before);
    if (before[0].connection) return warn('Fix the connection first, then run `npm run setup` again.');
  }
  await applySchema(env, state);
}

/**
 * Before a deploy: runs schema.sql when the database is missing tables or is out of date, or when schema.sql
 * changed since it was last run. Returns false to stop the deploy.
 */
async function ensureDatabase(env, state) {
  step('Checking Supabase');
  const results = await checkDatabase(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const healthy = report(results);
  if (results[0].connection) return confirm('Deploy anyway?', false);
  const current = schemaHash();
  if (healthy && !state.schemaHash) {
    // Run before this script tracked it; the checks show it is the latest version.
    state.schemaHash = current;
    saveState(state);
    return true;
  }
  const changed = state.schemaHash !== current;
  if (healthy && !changed) return true;
  if (healthy) info('supabase/schema.sql has changed since it was last run on the database.');
  else warn('The database needs supabase/schema.sql before the site can work.');
  if (await applySchema(env, state)) return true;
  // With --yes this goes ahead only when the database already passes the checks for the latest version
  // (schema.sql changed in some other way); a database that is missing what the app needs stops the deploy.
  if (YES && healthy) warn('Deploying anyway: the database already has what this version needs. Run schema.sql when you can.');
  if (YES && !healthy) fail('Not deploying: the site would break without schema.sql. Run it, then deploy again.');
  return confirm('Deploy anyway?', healthy);
}

async function authSettings(env, state) {
  step('Supabase sign-in settings');
  if (!env.VITE_SUPABASE_URL) return info('Demo mode — nothing to set.');
  const ref = projectRef(env.VITE_SUPABASE_URL);
  say(`Authentication → URL Configuration:`);
  say(`   Site URL:       ${bold(state.siteUrl)}`);
  say(`   Redirect URLs:  ${bold(`${state.siteUrl.replace(/\/$/, '')}/**`)}  and  ${bold('http://localhost:5173/**')}`);
  say('   (/** lets Google sign-ins return to the page the visitor was on.)');
  say('Authentication → Sign In / Providers → Email: decide on "Confirm email". The built-in mailer sends only a');
  say('few emails an hour — connect your own SMTP, or turn confirmation off for a small private blog.');
  if (await confirm('Open the URL Configuration page now?', true)) openUrl(`https://supabase.com/dashboard/project/${ref}/auth/url-configuration`);
  await ask('Press Enter when the URLs are saved');
  const providers = (env.VITE_OAUTH_PROVIDERS || 'google').toLowerCase();
  if (providers !== 'none') {
    say(`Sign-in buttons on the site: ${bold(providers)}. Each needs its own app (README §8.1 step 5) whose`);
    say(`client ID and secret go in Authentication → Sign In / Providers. Callback URL for all of them:`);
    say(`   ${bold(`${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/callback`)}`);
    say('Until a provider is set up there, its button shows an error. Set VITE_OAUTH_PROVIDERS=none to hide them.');
    if (await confirm('Open the Providers page now?', true)) openUrl(`https://supabase.com/dashboard/project/${ref}/auth/providers`);
  }
}

// ── deploy, per host ──
function setGitHubUrls(state) {
  state.base = state.domain || state.repo.endsWith('.github.io') ? '/' : `/${state.repo}/`;
  state.siteUrl = state.domain ? `https://${state.domain}/` : `https://${state.owner}.github.io${state.base}`;
}

/** Creates the repo on branch main (git before 2.28 has no `init -b`). */
function gitInit() {
  if (run('git', ['init', '-b', 'main']).status === 0) return true;
  return run('git', ['init']).status === 0 && run('git', ['symbolic-ref', 'HEAD', 'refs/heads/main']).status === 0;
}

/** A first commit fails without a name and email; set them for this repo only. */
async function ensureGitIdentity() {
  if (DRY || (capture('git', ['config', 'user.name']).stdout && capture('git', ['config', 'user.email']).stdout)) return;
  if (YES) {
    fail('git does not know who you are yet (needed to commit). Run `npm run deploy` once without --yes to set it.');
    return false;
  }
  warn('git does not know who you are yet (needed to commit). This sets it for this folder only.');
  const me = capture('gh', ['api', 'user', '--jq', '[.name // .login, .email // ""] | @tsv']).stdout.split('\t');
  run('git', ['config', 'user.name', await ask('Your name for commits', me[0] || '')]);
  run('git', ['config', 'user.email', await ask('Your email for commits (can be the GitHub noreply one)', me[1] || '')]);
  return true;
}

/** The lines under "## Unreleased" in CHANGES.md ("- Added: …", "- Fixed: …"), with continuation lines joined. */
function unreleasedChanges() {
  if (!existsSync(CHANGES_FILE)) return [];
  const lines = readFileSync(CHANGES_FILE, 'utf8').split('\n');
  const start = lines.findIndex((l) => /^##\s+unreleased\s*$/i.test(l));
  if (start < 0) return [];
  const items = [];
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break;
    if (/^\s*[-*]\s+/.test(l)) items.push(l.replace(/^\s*[-*]\s+/, '').trim());
    else if (l.trim() && items.length && /^\s+/.test(l)) items[items.length - 1] += ` ${l.trim()}`;
  }
  return items.filter(Boolean);
}

/**
 * Moves the Unreleased lines under a dated heading ("## 2026-11-03 17:39"), leaving Unreleased empty for the
 * next round. Returns the previous file content, to put back if the commit fails.
 */
function releaseChanges() {
  const before = readFileSync(CHANGES_FILE, 'utf8');
  const lines = before.split('\n');
  const start = lines.findIndex((l) => /^##\s+unreleased\s*$/i.test(l));
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end).filter((l) => l.trim());
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const next = [...lines.slice(0, start + 1), '', `## ${stamp}`, '', ...section, '', ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
  writeFile(CHANGES_FILE, next);
  return before;
}

/**
 * The commit message, run after `git add -A`. With lines in CHANGES.md → Unreleased, they explain the commit:
 *   Fix tag picker deleting chosen tags; add deploy:auto (+1 more)
 *
 *   - Fixed: tapping around the tags field in the tag group sheet deleted chosen tags
 *   - Added: npm run deploy:auto deploys in one go
 *   - …
 *
 *   Files:
 *   Modified: src/components/TagGroupSheet.tsx
 *   …
 * Without them, the subject names the changed files instead. .deploy.json (rewritten on every deploy) is listed
 * in the body but left out of the subject.
 */
function commitMessage(changes = []) {
  const rows = capture('git', ['diff', '--cached', '--name-status', '-M']).stdout.split('\n').filter(Boolean);
  if (!rows.length && !changes.length) return 'Deploy oded.me blog';
  const KIND = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', T: 'Changed type' };
  const files = rows.map((r) => {
    const [code, ...paths] = r.split('\t');
    return { kind: KIND[code[0]] ?? code, path: paths.join(' → '), last: paths[paths.length - 1] };
  });
  const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
  let subject;
  if (changes.length) {
    // Each entry's head (the part before its next colon) as a verb: "Fixed: tag picker: taps deleted tags" →
    // "Fix tag picker". Joined with "; " when they fit, else the first one and a count.
    const verb = { added: 'Add', fixed: 'Fix', changed: 'Change', removed: 'Remove', improved: 'Improve' };
    const heads = changes.map((c, i) => {
      const m = c.match(/^(\w+):\s*(.*)$/);
      const kind = m && verb[m[1].toLowerCase()];
      const rest = (kind ? m[2] : c).split(/:\s|\s[—–]\s/)[0].trim();
      const v = kind ? (i === 0 ? kind : kind.toLowerCase()) : '';
      return v ? `${v} ${rest}` : rest;
    });
    const joined = heads.join('; ');
    subject = joined.length <= 90 ? joined : `${clip(heads[0], 76)}${changes.length > 1 ? ` (+${changes.length - 1} more)` : ''}`;
  } else {
    const named = files.filter((f) => f.last !== '.deploy.json' && f.last !== 'CHANGES.md');
    const base = (f) => f.last.split('/').pop();
    const shown = named.slice(0, 4).map(base);
    subject = named.length
      ? `Deploy: ${shown.join(', ')}${named.length > shown.length ? ` and ${named.length - shown.length} more` : ''}`
      : 'Deploy oded.me blog (deploy settings only)';
  }
  const width = files.length ? Math.max(...files.map((f) => f.kind.length)) + 1 : 0;
  const fileLines = files.map((f) => `${`${f.kind}:`.padEnd(width + 1)}${f.path}`);
  const stat = capture('git', ['diff', '--cached', '--shortstat']).stdout.trim();
  const body = changes.length
    ? [...changes.map((c) => `- ${c}`), '', 'Files:', ...fileLines]
    : fileLines;
  return [subject, '', ...body, ...(stat ? ['', stat] : [])].join('\n');
}

async function deployGitHub(env, state) {
  if (!have('gh')) {
    fail('The GitHub CLI is not installed. Install it (brew install gh), run `gh auth login`, then `npm run deploy`.');
    return null;
  }
  if (capture('gh', ['auth', 'status']).status !== 0) {
    warn('You are not signed in to GitHub.');
    if (YES) {
      fail('Run `gh auth login` once, then `npm run deploy:auto` again.');
      return null;
    }
    if (run('gh', ['auth', 'login']).status !== 0) return null;
  }
  // The signed-in account is the owner; an empty or stale saved owner gives a wrong repo and site address.
  const login = capture('gh', ['api', 'user', '--jq', '.login']).stdout;
  if (login && login !== state.owner) {
    if (state.owner) info(`Using the signed-in GitHub account "${login}" (was "${state.owner}").`);
    state.owner = login;
    setGitHubUrls(state);
    saveState(state);
  }
  if (!state.owner) {
    if (!DRY) {
      fail('Could not tell your GitHub username. Run `gh auth login`, then `npm run deploy`.');
      return null;
    }
    state.owner = '<your-github-user>';
    setGitHubUrls(state);
  }
  const full = `${state.owner}/${state.repo}`;

  const isNew = !existsSync(join(ROOT, '.git'));
  if (isNew) {
    if (!(await confirm('This folder is not a git repository yet. Run git init (branch main)?', true))) return null;
    if (!gitInit()) {
      fail('git init failed (see above).');
      return null;
    }
  }
  const branch = capture('git', ['branch', '--show-current']).stdout;
  if (branch && branch !== 'main') warn(`You are on "${branch}". The workflow deploys pushes to main.`);
  // Files listed in .gitignore but committed before that (e.g. credentials.md) keep being committed; stop tracking them.
  const ignoredTracked = DRY && isNew ? '' : capture('git', ['ls-files', '-ci', '--exclude-standard']).stdout;
  if (ignoredTracked) {
    warn(`These files are in .gitignore but still tracked by git, so they would be pushed:\n${ignoredTracked}`);
    if (await confirm('Stop tracking them? (They stay on this computer.)', true)) {
      run('git', ['rm', '--cached', '--quiet', '--', ...ignoredTracked.split('\n')]);
    }
  }
  // In a dry run the repo was not really created, so git can't list the changes: every file would be new.
  const changes = DRY && isNew ? '(every file in the folder — first commit)' : capture('git', ['status', '--short']).stdout;
  if (changes) {
    say(changes);
    if (await confirm('Commit these changes?', true)) {
      if ((await ensureGitIdentity()) === false) return null;
      // The features and fixes listed in CHANGES.md explain the commit; they move under today's date in the same commit.
      const changesList = unreleasedChanges();
      const changesBefore = changesList.length ? releaseChanges() : null;
      if (!changesList.length) warn('CHANGES.md has nothing under "Unreleased", so the commit message lists the changed files only.');
      run('git', ['add', '-A']);
      // Shown as the default (press Enter to keep it), used as is with --yes.
      const auto = DRY && isNew ? 'Deploy oded.me blog' : commitMessage(changesList);
      say(dim(auto.replace(/^/gm, '    ')));
      const subject = auto.split('\n')[0];
      const typed = await ask('Commit message', subject);
      // A typed subject replaces the generated one; the list of changes and files stays in the body.
      const message = typed === subject ? auto : [typed, ...auto.split('\n').slice(1)].join('\n');
      if (run('git', ['commit', '-m', message]).status !== 0) {
        if (changesBefore !== null) writeFile(CHANGES_FILE, changesBefore); // keep them under Unreleased for the next try
        fail('The commit failed (see above).');
        return null;
      }
    }
  }
  if (!DRY && capture('git', ['rev-parse', '--verify', 'HEAD']).status !== 0) {
    fail('Nothing is committed yet, so there is nothing to push. Commit, then run `npm run deploy`.');
    return null;
  }
  if (!capture('git', ['remote', 'get-url', 'origin']).stdout) {
    if (!(await confirm(`Create the public GitHub repository ${full}? (free Pages needs a public repo)`, true))) return null;
    if (run('gh', ['repo', 'create', state.repo, '--public', '--source', '.', '--remote', 'origin']).status !== 0) return null;
  } else ok(`Remote origin: ${capture('git', ['remote', 'get-url', 'origin']).stdout}`);

  // Secrets first, so the very first workflow run already builds in live mode.
  say('Setting the build values as repository secrets/variables:');
  for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_GOOGLE_CLIENT_ID']) {
    if (env[k]) run('gh', ['secret', 'set', k, '--repo', full], { input: env[k] });
  }
  if (env.VITE_OAUTH_PROVIDERS) run('gh', ['variable', 'set', 'VITE_OAUTH_PROVIDERS', '--repo', full, '--body', env.VITE_OAUTH_PROVIDERS]);
  if (env.VITE_ADMIN_EMAIL) run('gh', ['variable', 'set', 'VITE_ADMIN_EMAIL', '--repo', full, '--body', env.VITE_ADMIN_EMAIL]);
  if (state.domain) run('gh', ['variable', 'set', 'VITE_BASE', '--repo', full, '--body', '/']);
  run('gh', ['variable', 'set', 'SITE_URL', '--repo', full, '--body', state.siteUrl]);

  // Pages can only be switched on once the repo has a branch, so try before and, if needed, after the push.
  const enablePages = () => {
    const exists = capture('gh', ['api', `repos/${full}/pages`]).status === 0;
    const res = run('gh', ['api', '-X', exists ? 'PUT' : 'POST', `repos/${full}/pages`, '-f', 'build_type=workflow']);
    if (res.status === 0 && state.domain) run('gh', ['api', '-X', 'PUT', `repos/${full}/pages`, '-f', `cname=${state.domain}`]);
    return res.status === 0;
  };
  let pagesOn = enablePages();

  if (!(await confirm('Push to main now? This starts the deploy workflow.', true))) return null;
  // GitHub itself commits to main (e.g. a CNAME file when a domain is set in Settings → Pages); take those first.
  if (!DRY && capture('git', ['ls-remote', '--exit-code', 'origin', 'main']).status === 0) {
    run('git', ['fetch', 'origin', 'main']);
    if (capture('git', ['rev-list', '--count', 'HEAD..origin/main']).stdout !== '0') {
      info('GitHub has commits you don’t have yet; bringing them in first.');
      if (run('git', ['pull', '--rebase', '--no-edit', 'origin', 'main']).status !== 0) {
        fail('Could not merge the changes from GitHub. Resolve them (git status), then run `npm run deploy`.');
        return null;
      }
    }
  }
  const before = capture('git', ['rev-parse', 'origin/main']).stdout;
  if (run('git', ['push', '-u', 'origin', 'main']).status !== 0) {
    info('If GitHub blocked it for containing a secret: take that file out of the unpushed commits');
    info('(git reset --soft origin/main, git rm --cached <file>, commit again), then `npm run deploy`.');
    info('Don’t use the "allow the secret" link: the repository is public.');
    return null;
  }
  // Nothing new to push means no push event, so start the workflow by hand (settings like VITE_BASE may have changed).
  const pushedNothing = !DRY && before && before === capture('git', ['rev-parse', 'origin/main']).stdout;
  if (pagesOn && pushedNothing) {
    info('Nothing new to push; starting the deploy workflow to rebuild with the current settings.');
    run('gh', ['workflow', 'run', 'deploy.yml', '--repo', full, '--ref', 'main']);
  }
  if (!pagesOn) {
    pagesOn = enablePages();
    if (!pagesOn) {
      fail('Could not switch on Pages. In the repo: Settings → Pages → Source: GitHub Actions, then run `npm run deploy`.');
      return null;
    }
    run('gh', ['workflow', 'run', 'deploy.yml', '--repo', full, '--ref', 'main']);
  }
  ok('GitHub Pages deploys from GitHub Actions');
  if (await confirm('Watch the workflow until it finishes?', true)) {
    if (!DRY) await new Promise((r) => setTimeout(r, 5000));
    const id = capture('gh', ['run', 'list', '--repo', full, '--workflow', 'deploy.yml', '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId']).stdout;
    if (id) run('gh', ['run', 'watch', id, '--repo', full, '--exit-status']);
  }
  return state.siteUrl;
}

async function deployNetlify(env, state) {
  if (!build(env, state)) return null;
  say(dim('Uses the Netlify CLI through npx. The first run asks you to log in and to link or create a site.'));
  if (run('npx', ['--yes', 'netlify-cli', 'deploy', '--prod', '--dir', 'dist']).status !== 0) return null;
  return state.domain ? `https://${state.domain}/` : await ask('Live URL printed above', state.siteUrl);
}

// Cloudflare Pages, via Wrangler. Pinned to a major version so a new release can't change the flags under us.
const WRANGLER = ['--yes', 'wrangler@4'];
const CF_MAX_FILES = 20000;
const CF_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Pages project names: lowercase letters, digits and dashes, at most 58 characters, no dash at either end. */
function cloudflareName(name = '') {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 58)
    .replace(/^-+|-+$/g, '');
}

function wranglerCapture(args, env) {
  say(dim(`  $ npx wrangler ${args.join(' ')}`));
  return capture('npx', [...WRANGLER, ...args], { env });
}

/** The tail of a CLI's output, for error messages. */
const tail = (r, n = 6) => `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-n).join('\n');

/** Returns the accounts Wrangler can use, or null when it is not logged in. */
function cloudflareAccounts(env) {
  const who = wranglerCapture(['whoami'], env);
  const out = `${who.stdout}\n${who.stderr}`;
  if (who.status !== 0 || /not authenticated|not logged in|wrangler login/i.test(out)) return null;
  const accounts = [...out.matchAll(/│\s*(.+?)\s*│\s*([0-9a-f]{32})\s*│/g)].map((m) => ({ name: m[1], id: m[2] }));
  if (!accounts.length) for (const [id] of out.matchAll(/\b[0-9a-f]{32}\b/g)) accounts.push({ name: id, id });
  return accounts;
}

/**
 * Makes dist/ right for Cloudflare: with a top-level 404.html Pages stops acting as a single-page app and
 * deep links return HTTP 404, and it ignores the "/* /index.html 200" rule as an infinite loop. Without
 * both, Pages serves index.html for unknown paths itself. Also checks the Pages upload limits.
 */
function prepareCloudflareDist() {
  const dist = join(ROOT, 'dist');
  const remove = (file, why) => {
    const path = join(dist, file);
    if (!existsSync(path)) return;
    if (DRY) return say(dim(`  [dry-run] would remove dist/${file} (${why})`));
    rmSync(path);
    info(`Removed dist/${file} — ${why}`);
  };
  remove('404.html', 'Cloudflare serves the app for deep links without it');
  const redirects = join(dist, '_redirects');
  if (existsSync(redirects)) {
    const rules = readFileSync(redirects, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (rules.length && rules.every((l) => /^\/\*\s+\/(index\.html)?\s+200$/.test(l))) remove('_redirects', 'Cloudflare ignores that SPA rule as a loop');
  }
  if (DRY) return true;
  let count = 0;
  const big = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.isFile()) {
        count++;
        if (statSync(path).size > CF_MAX_FILE_BYTES) big.push(path.replace(`${dist}/`, ''));
      }
    }
  };
  walk(dist);
  if (big.length) fail(`Cloudflare Pages accepts files up to 25 MiB. Too big: ${big.join(', ')}`);
  if (count > CF_MAX_FILES) fail(`Cloudflare Pages accepts up to ${CF_MAX_FILES} files; dist/ has ${count}.`);
  return !big.length && count <= CF_MAX_FILES;
}

/** The last "pages-deploy-detailed" entry Wrangler wrote to its output file, if any. */
function readWranglerOutput(file) {
  try {
    const entries = readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    return entries.filter((e) => e.type === 'pages-deploy-detailed').at(-1) ?? null;
  } catch {
    return null;
  }
}

/** https://<hash>.<project>.pages.dev → https://<project>.pages.dev/ */
function productionUrlFrom(url) {
  try {
    const host = new URL(url).hostname;
    const parts = host.split('.');
    if (!host.endsWith('.pages.dev')) return null;
    return `https://${(parts.length > 3 ? parts.slice(1) : parts).join('.')}/`;
  } catch {
    return null;
  }
}

async function deployCloudflare(env, state) {
  if (!have('npx')) {
    fail('npx was not found. It comes with Node.js; reinstall Node 20 or newer.');
    return null;
  }
  const name = cloudflareName(state.project);
  if (!name) {
    fail('No Cloudflare Pages project name is saved. Run `npm run setup` and choose Cloudflare Pages again.');
    return null;
  }
  if (name !== state.project) {
    warn(`"${state.project}" is not a valid Cloudflare project name. Using "${name}".`);
    state.project = name;
  }
  if (!build(env, state)) return null;
  if (!prepareCloudflareDist()) return null;
  let branch = state.cfBranch ?? 'main';
  if (DRY) {
    run('npx', [...WRANGLER, 'pages', 'deploy', 'dist', '--project-name', name, '--branch', branch, '--commit-dirty=true']);
    return state.siteUrl;
  }

  // 1. Wrangler runs, and is signed in? CLOUDFLARE_API_TOKEN in the environment is used as is (no browser login).
  say(dim('Uses Wrangler through npx (the first run downloads it).'));
  const version = wranglerCapture(['--version']);
  if (version.status !== 0) {
    fail(`Could not run Wrangler through npx:\n${tail(version)}`);
    info('Check the internet connection and npm access (npm config get registry), then `npm run deploy`.');
    return null;
  }
  let accounts = cloudflareAccounts();
  if (!accounts) {
    if (process.env.CLOUDFLARE_API_TOKEN) {
      fail('Cloudflare rejected CLOUDFLARE_API_TOKEN. It needs the "Cloudflare Pages: Edit" permission.');
      return null;
    }
    warn('You are not logged in to Cloudflare. A browser window opens to log in.');
    if (run('npx', [...WRANGLER, 'login']).status !== 0 || !(accounts = cloudflareAccounts())) {
      fail('Cloudflare login did not finish. Run `npx wrangler login`, then `npm run deploy`.');
      return null;
    }
  }
  ok('Logged in to Cloudflare');

  // 2. Which account. Wrangler can't ask when its output is captured, so settle it here.
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || state.cfAccountId;
  if (accountId && accounts.length && !accounts.some((a) => a.id === accountId)) {
    warn(`The saved Cloudflare account ${accountId} is not available to this login.`);
    accountId = undefined;
  }
  if (!accountId && accounts.length === 1) accountId = accounts[0].id;
  if (!accountId && accounts.length > 1) {
    accountId = accounts[await choose('Which Cloudflare account?', accounts.map((a) => `${a.name} (${a.id})`))].id;
  }
  if (accountId && !process.env.CLOUDFLARE_ACCOUNT_ID) state.cfAccountId = accountId;
  const cfEnv = accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {};
  saveState(state);

  // 3. The project: create it only if it isn't there, and learn its real *.pages.dev address.
  const list = wranglerCapture(['pages', 'project', 'list'], cfEnv);
  const row = list.status === 0 ? list.stdout.split('\n').find((l) => new RegExp(`(^|[\\s│|])${name}([\\s│|]|$)`).test(l)) : undefined;
  if (list.status !== 0) warn(`Could not list your Pages projects:\n${tail(list)}`);
  let pagesDev = row?.match(/([a-z0-9-]+\.pages\.dev)/)?.[1];
  if (row) ok(`Pages project "${name}" exists`);
  else {
    const res = wranglerCapture(['pages', 'project', 'create', name, '--production-branch', branch], cfEnv);
    if (res.status === 0) {
      ok(`Created Pages project "${name}" (production branch ${branch})`);
      state.cfBranch = branch;
      pagesDev = `${res.stdout}\n${res.stderr}`.match(/([a-z0-9-]+\.pages\.dev)/)?.[1] ?? pagesDev;
    } else if (/already exists/i.test(`${res.stdout}\n${res.stderr}`)) ok(`Pages project "${name}" exists`);
    else {
      fail(`Could not create the Pages project "${name}":\n${tail(res)}`);
      return null;
    }
  }

  // 4. Upload. Wrangler writes the result (URL, production or preview) to WRANGLER_OUTPUT_FILE_PATH.
  for (let attempt = 0; attempt < 2; attempt++) {
    const outFile = join(mkdtempSync(join(tmpdir(), 'wrangler-')), 'output.json');
    const res = run('npx', [...WRANGLER, 'pages', 'deploy', 'dist', '--project-name', name, '--branch', branch, '--commit-dirty=true'], {
      env: { ...cfEnv, WRANGLER_OUTPUT_FILE_PATH: outFile },
    });
    const detail = readWranglerOutput(outFile);
    rmSync(dirname(outFile), { recursive: true, force: true });
    if (res.status !== 0) {
      fail('The upload failed (see above).');
      info('If the login expired: npx wrangler login. If the project was created from a Git repo in the');
      info('dashboard, it deploys on push and can’t take uploads — pick another project name in `npm run setup`.');
      return null;
    }
    if (detail?.environment === 'preview') {
      const prod = detail.production_branch;
      warn(`That went to a preview (${detail.url}), not the live site: the project's production branch is "${prod ?? '?'}".`);
      if (attempt === 0 && prod && prod !== branch && (await confirm(`Deploy again to "${prod}" so it goes live?`, true))) {
        branch = state.cfBranch = prod;
        continue;
      }
      return null;
    }
    state.cfBranch = branch;
    const live = (pagesDev && `https://${pagesDev}/`) || (detail?.url && productionUrlFrom(detail.url)) || state.siteUrl;
    if (!detail) info('Wrangler did not report the address; assuming the one shown above.');
    ok(`Deployed to ${live}`);
    if (state.domain) {
      if (!pagesDev && !detail) return state.siteUrl;
      info(`Until ${state.domain} is added under Custom domains, the site is at ${live}`);
      return `https://${state.domain}/`;
    }
    return live;
  }
  return null;
}

async function deployVercel(env, state) {
  if (!build(env, state)) return null;
  // dist/ is uploaded as plain static files, so it needs its own SPA rewrite rule.
  writeFile(join(ROOT, 'dist', 'vercel.json'), `${JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] }, null, 2)}\n`);
  say(dim('Uses the Vercel CLI through npx. The first run asks you to log in and to name the project.'));
  if (run('npx', ['--yes', 'vercel', 'deploy', 'dist', '--prod']).status !== 0) return null;
  return state.domain ? `https://${state.domain}/` : await ask('Live URL printed above', state.siteUrl);
}

async function deploy(env, state) {
  step(`Deploy to ${HOST_NAMES[state.host]}`);
  const fn = { github: deployGitHub, netlify: deployNetlify, cloudflare: deployCloudflare, vercel: deployVercel }[state.host];
  const url = await fn(env, state);
  if (!url) {
    warn('Deploy did not finish. Fix the issue above, then run `npm run deploy`.');
    return false;
  }
  state.siteUrl = url.replace(/\/?$/, '/');
  state.lastDeploy = new Date().toISOString();
  saveState(state);
  return true;
}

function domainHelp(state) {
  if (!state.domain) return;
  step(`Custom domain ${state.domain}`);
  if (state.host === 'github') {
    say('At your domain registrar, add these DNS records:');
    say(`   A      ${state.domain}  →  185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153`);
    say(`   CNAME  www  →  ${state.owner}.github.io`);
    say('Then in the repo: Settings → Pages → tick "Enforce HTTPS" once the certificate is issued (can take an hour).');
  } else {
    say(`Add ${state.domain} in the ${HOST_NAMES[state.host]} site's Domains settings and create the DNS records it shows.`);
  }
  say('Afterwards, make sure the Supabase Site URL / Redirect URLs (and Google origins, if used) use the domain.');
}

function finalChecklist(env, state) {
  step('Done — last steps in the browser');
  say(`1. Open ${bold(state.siteUrl)} and sign in as ${bold('admin')} / ${bold('admin')}.`);
  say('2. Change the password right away (the yellow bar takes you to /account).');
  say('3. Add people in /admin → Users, or let them sign up and approve role requests.');
  if (!env.VITE_SUPABASE_URL) warn('This is a DEMO-mode deploy: every visitor gets their own separate, browser-only blog.');
  say(dim('\nRedeploy after changes: npm run deploy   ·   Re-check everything: npm run deploy:check   ·   More: DEPLOYMENT.md'));
}

// ───────────────────────── commands ─────────────────────────
async function cmdSetup() {
  say(bold('\noded.me — deployment and configuration walkthrough'));
  say(dim(`Answers in (parentheses) are defaults — press Enter to keep them.${DRY ? '  DRY RUN: nothing will be changed.' : ''}`));
  const state = readState();
  let env = readEnv();
  if (env.VITE_SUPABASE_URL?.includes('YOUR-PROJECT')) env = {};
  await preflight();
  await chooseHost(state);
  saveState(state);
  env = await configureSupabase(env);
  env = await configureAdmin(env);
  env = await configureYouTube(env, state);
  saveEnv(env);
  await setupDatabase(env, state);
  await authSettings(env, state);
  if (state.host === 'github') {
    step('Test build');
    if (!build(env, { ...state }) && !(await confirm('The build failed. Continue anyway?', false))) return;
  }
  if (!(await confirm(`Deploy to ${HOST_NAMES[state.host]} now?`, true))) return info('Skipped. Run `npm run deploy` when ready.');
  if (!(await deploy(env, state))) return;
  domainHelp(state);
  step('Checking the live site');
  if (!DRY) await smokeTest(state.siteUrl, env.VITE_SUPABASE_URL);
  finalChecklist(env, state);
}

async function cmdDeploy() {
  const state = readState();
  const env = readEnv();
  if (!state.host) {
    fail('No host chosen yet. Run `npm run setup` first.');
    process.exitCode = 1;
    return;
  }
  if (env.VITE_SUPABASE_URL && !(await ensureDatabase(env, state))) return;
  if (await deploy(env, state)) {
    step('Checking the live site');
    if (!DRY) await smokeTest(state.siteUrl, env.VITE_SUPABASE_URL);
  }
}

/**
 * `npm run db:update`: runs schema.sql on the Supabase project in .env, whatever its state, then checks it.
 * With SUPABASE_DB_URL set and psql installed it runs straight away; otherwise it asks how (SQL editor or psql).
 */
async function cmdSchema() {
  const state = readState();
  const env = readEnv();
  step('Database: run supabase/schema.sql');
  if (!env.VITE_SUPABASE_URL) {
    info('Demo mode (no VITE_SUPABASE_URL in .env): there is no database to update.');
    return;
  }
  info(`Supabase project ${projectRef(env.VITE_SUPABASE_URL) ?? env.VITE_SUPABASE_URL}`);
  const before = await checkDatabase(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  if (before[0]?.connection) {
    report(before);
    process.exitCode = 1;
    return;
  }
  if (!(await applySchema(env, state))) process.exitCode = 1;
  else ok(bold('Database updated'));
}

async function cmdCheck() {
  const state = readState();
  const env = readEnv();
  let good = true;
  step('Configuration (.env)');
  if (!env.VITE_SUPABASE_URL) warn('No VITE_SUPABASE_URL — builds run in demo mode.');
  else {
    const err = checkPublicKey(env.VITE_SUPABASE_ANON_KEY, env.VITE_SUPABASE_URL);
    if (err) {
      fail(err);
      good = false;
    } else ok(`Supabase project ${projectRef(env.VITE_SUPABASE_URL) ?? env.VITE_SUPABASE_URL}, public key OK`);
  }
  info(`Manager email: ${env.VITE_ADMIN_EMAIL || DEFAULT_ADMIN}`);
  const sqlAdmin = readFileSync(SCHEMA_FILE, 'utf8').match(/admin_email text := '([^']+)'/)?.[1];
  if (sqlAdmin && sqlAdmin !== (env.VITE_ADMIN_EMAIL || DEFAULT_ADMIN)) {
    fail(`schema.sql creates ${sqlAdmin}, but the app maps "admin" to ${env.VITE_ADMIN_EMAIL || DEFAULT_ADMIN}.`);
    good = false;
  }
  info(env.VITE_GOOGLE_CLIENT_ID ? 'YouTube uploads: on' : 'YouTube uploads: off');
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    step('Supabase project');
    good = report(await checkDatabase(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)) && good;
    if (state.schemaHash && state.schemaHash !== schemaHash()) warn('supabase/schema.sql changed since it was last run; `npm run deploy` will offer to run it.');
  }
  step('Build');
  good = build(env, state) && good;
  if (state.siteUrl) {
    step(`Live site (${HOST_NAMES[state.host] ?? 'unknown host'})`);
    good = (await smokeTest(state.siteUrl, env.VITE_SUPABASE_URL)) && good;
  } else info('No live site recorded yet (run `npm run setup`).');
  say();
  if (good) ok(bold('All checks passed'));
  else {
    fail(bold('Some checks failed — see above. DEPLOYMENT.md § Troubleshooting has fixes.'));
    process.exitCode = 1;
  }
}

/**
 * Copies files referenced by posts from an old Supabase project's public "media" bucket into the current
 * project's bucket, signing in as the manager (no service key needed). Run after restoring the database.
 */
async function cmdMedia() {
  say(bold('\nCopy uploaded media to the current Supabase project'));
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || checkPublicKey(key, url)) return fail('Set the NEW project’s URL and key in .env first (npm run setup).');
  step('Sign in to the new project as the manager');
  const email = await ask('Manager email', env.VITE_ADMIN_EMAIL || DEFAULT_ADMIN);
  const password = await askSecret('Password');
  const auth = await http(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = auth.status === 200 ? JSON.parse(auth.text).access_token : null;
  if (!token) return fail(`Sign-in failed (HTTP ${auth.status}). Check the email and password on the NEW project.`);
  ok('Signed in');
  const headers = { apikey: key, authorization: `Bearer ${token}` };

  step('Find media links that still point to the old project');
  const posts = await http(`${url}/rest/v1/posts?select=id,content_html,cover_url`, { headers });
  if (posts.status !== 200) return fail(`Could not read posts (HTTP ${posts.status}).`);
  const rows = JSON.parse(posts.text);
  const newHost = new URL(url).host;
  const re = /https:\/\/([a-z0-9]+)\.supabase\.co\/storage\/v1\/object\/public\/media\/([^"'\s)<>?#]+)/g;
  const found = new Map();
  for (const r of rows) {
    for (const m of `${r.content_html} ${r.cover_url ?? ''}`.matchAll(re)) {
      if (`${m[1]}.supabase.co` !== newHost) found.set(m[0], { oldRef: m[1], path: decodeURIComponent(m[2]) });
    }
  }
  const oldRefs = [...new Set([...found.values()].map((f) => f.oldRef))];
  if (!found.size) return ok(`All ${rows.length} posts already use this project’s storage. Nothing to copy.`);
  ok(`${found.size} file(s) in ${rows.length} posts point to: ${oldRefs.join(', ')}`);
  if (!(await confirm(`Copy them into ${newHost}/media (same paths)?`, true))) return;

  step('Copy files');
  let copied = 0;
  for (const [src, { path }] of found) {
    if (DRY) {
      say(dim(`  [dry-run] ${path}`));
      continue;
    }
    const res = await fetch(src).catch(() => null);
    if (!res?.ok) {
      fail(`${path} — download failed (${res?.status ?? 'network error'})`);
      continue;
    }
    const up = await http(`${url}/storage/v1/object/media/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { ...headers, 'x-upsert': 'true', 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'max-age=31536000' },
      body: Buffer.from(await res.arrayBuffer()),
    });
    if (up.status === 200) {
      copied++;
      ok(path);
    } else fail(`${path} — upload failed (HTTP ${up.status}: ${up.text.slice(0, 120)})`);
  }
  say();
  ok(`${copied} of ${found.size} copied.`);

  step('Point the posts at the new files');
  const sql = [
    '-- Run in the NEW project: SQL Editor → New query.',
    '-- session_replication_role = replica keeps each post\'s "updated" date unchanged.',
    'begin;',
    'set local session_replication_role = replica;',
    ...oldRefs.map(
      (ref) =>
        `update public.posts set content_html = replace(content_html, '${ref}.supabase.co', '${newHost}'),\n  cover_url = replace(cover_url, '${ref}.supabase.co', '${newHost}')\n  where content_html like '%${ref}.supabase.co%' or cover_url like '%${ref}.supabase.co%';`,
    ),
    'commit;',
  ].join('\n');
  say(sql);
  if (copyToClipboard(sql)) ok('Copied to the clipboard');
  if (await confirm('Open the SQL editor?', true)) openUrl(`https://supabase.com/dashboard/project/${projectRef(url)}/sql/new`);
}

const COMMANDS = { setup: cmdSetup, deploy: cmdDeploy, check: cmdCheck, media: cmdMedia, schema: cmdSchema };
if (!COMMANDS[command]) {
  fail(`Unknown command "${command}". Use: setup, deploy, check, media or schema (plus --dry-run, --yes).`);
  process.exit(1);
}
try {
  await COMMANDS[command]();
} finally {
  rl.close();
}
