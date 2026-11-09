-- Bilingual blog — Supabase schema.
-- Run once in Supabase Dashboard → SQL Editor (safe to re-run).
--
-- Roles:
--   admin     manager: everything, incl. user roles
--   editor    write / publish / edit own posts, upload media
--   reviewer  read drafts, comment, resolve comments
--   commenter (default for new sign-ups) comment on published posts, like; can request any other role
--   reader    read and like
-- A prebuilt admin is created at the end of this file: sign in as "admin" / "admin"
-- (email odedsme@gmail.com) and change the password right away.

create extension if not exists pg_trgm;
create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  username     text not null unique,
  role         text not null default 'commenter'
               check (role in ('admin', 'editor', 'reviewer', 'commenter', 'reader')),
  created_at   timestamptz not null default now()
);

-- Upgrades for projects created with an earlier version of this file.
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists suspended boolean not null default false;
-- Why a new account is on hold for the admin ('name': it looks machine-made; see looks_machine_made below), or
-- 'approved' once the admin has checked it.
alter table public.profiles add column if not exists review_reason text;

-- True when a name looks machine-made, like "cdBcejzKTYXUYQrtNTbE": a 10+ letter run of Latin letters with few
-- vowels, long consonant clusters and capitals scattered inside. Mirrors looksMachineMade() in src/lib/util.ts.
create or replace function public.looks_machine_made(t text)
returns boolean language plpgsql immutable as $$
declare
  w text;
  letters int;
  vowels int;
  switches int;
  longest int;
  score int;
begin
  foreach w in array regexp_split_to_array(coalesce(t, ''), '[[:space:]._+-]+') loop
    if length(w) < 10 or w !~ '^[A-Za-z0-9]+$' then
      continue;
    end if;
    letters := length(regexp_replace(w, '[^A-Za-z]', '', 'g'));
    vowels := length(regexp_replace(w, '[^AEIOUaeiou]', '', 'g'));
    select count(*) into switches from regexp_matches(w, '[a-z](?=[A-Z])', 'g');
    select coalesce(max(length(m[1])), 0) into longest
      from regexp_matches(w, '([B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z]+)', 'g') as m;
    score := (case when letters > 0 and vowels::numeric / letters < 0.25 then 1 else 0 end)
           + (case when switches >= 3 then 1 else 0 end)
           + (case when longest >= 5 then 1 else 0 end);
    if score >= 2 and (switches >= 3 or length(w) >= 14) then
      return true;
    end if;
  end loop;
  return false;
end $$;
alter table public.profiles alter column role set default 'commenter';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'reviewer', 'commenter', 'reader'));

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Email sign-ups send display_name; Google, Facebook etc. send full_name / name (see the profile insert below).
  base text := coalesce(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]', '', 'g'), '');
  uname text;
  n int := 1;
  shown text := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''));
  -- A machine-made looking name or e-mail: create the account on hold (suspended) for the admin to approve.
  held boolean := public.looks_machine_made(shown) or public.looks_machine_made(split_part(new.email, '@', 1));
begin
  if base = '' then base := 'user'; end if;
  uname := base;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into public.profiles (id, display_name, username, role, suspended, review_reason)
  values (new.id, coalesce(shown, base), uname, 'commenter', held, case when held then 'name' end);
  if held then
    update auth.users set banned_until = 'infinity'::timestamptz where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change roles; users may rename themselves.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL editor / service role, which may set roles directly.
  if new.role is distinct from old.role and auth.uid() is not null
     and coalesce(public.current_role_name(), '') <> 'admin' then
    raise exception 'only admins can change roles';
  end if;
  if (new.suspended is distinct from old.suspended or new.review_reason is distinct from old.review_reason)
     and auth.uid() is not null and coalesce(public.current_role_name(), '') <> 'admin' then
    raise exception 'only admins can suspend accounts';
  end if;
  new.id := old.id;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ───────────────────────── posts ─────────────────────────
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  excerpt       text not null default '',
  content_html  text not null default '',
  content_text  text not null default '',
  cover_url     text,
  tags          text[] not null default '{}',
  lang          text not null default 'he' check (lang in ('he', 'en')),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  author_id     uuid not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint posts_author_id_fkey foreign key (author_id) references public.profiles (id) on delete restrict
);

-- Audience: public | members (any signed-in user) | private (author + admin) | restricted (allowed_users + members of allowed_groups)
alter table public.posts add column if not exists visibility text not null default 'public';
alter table public.posts add column if not exists allowed_users uuid[] not null default '{}';
alter table public.posts add column if not exists allowed_groups uuid[] not null default '{}';
alter table public.posts drop constraint if exists posts_visibility_check;
alter table public.posts add constraint posts_visibility_check check (visibility in ('public', 'members', 'private', 'restricted'));

create index if not exists posts_tags_idx on public.posts using gin (tags);
create index if not exists posts_published_idx on public.posts (published_at desc);
create index if not exists posts_search_idx on public.posts
  using gin ((title || ' ' || content_text) gin_trgm_ops);

create or replace function public.touch_post()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  if new.status = 'draft' then new.published_at := null; end if;
  if tg_op = 'UPDATE' then
    -- Authorship is fixed, except when admin_delete_user() hands posts to the admin.
    if coalesce(current_setting('blog.reassign_posts', true), '') <> 'on' then
      new.author_id := old.author_id;
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before insert or update on public.posts
  for each row execute function public.touch_post();

-- ───────────────────────── groups (audiences you can pre-create) ─────────────────────────
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 80),
  description text not null default '',
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);

-- Who may read a post. Mirrors canViewPost() in src/lib/util.ts.
create or replace function public.can_view_post(p public.posts)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false)
      or p.author_id = auth.uid()
      or (
        (p.status = 'published' or coalesce(public.current_role_name() in ('editor', 'reviewer'), false))
        and (
          p.visibility = 'public'
          or (p.visibility = 'members' and auth.uid() is not null)
          or (p.visibility = 'restricted' and auth.uid() is not null and (
                auth.uid() = any (p.allowed_users)
                or exists (select 1 from public.group_members gm
                           where gm.user_id = auth.uid() and gm.group_id = any (p.allowed_groups))))
        )
      )
$$;

-- ───────────────────────── comments & likes ─────────────────────────
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null,
  parent_id  uuid references public.comments (id) on delete cascade,
  quote      text not null default '',
  prefix     text not null default '',
  suffix     text not null default '',
  body       text not null check (length(body) between 1 and 5000),
  resolved   boolean not null default false,
  created_at timestamptz not null default now(),
  constraint comments_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ───────────────────────── tag groups (sites inside the site) ─────────────────────────
-- /<slug> shows only public, published posts carrying at least one of `tags`, with its own landing page.
-- `config` holds the landing page's texts and media (see TagGroupConfig in src/lib/types.ts).
create table if not exists public.tag_groups (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  tags       text[] not null default '{}',
  landing    text not null default 'default',
  config     jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Addresses the blog itself uses can't be taken. Keep in step with RESERVED_SITE_SLUGS in src/lib/util.ts.
alter table public.tag_groups drop constraint if exists tag_groups_slug_check;
alter table public.tag_groups add constraint tag_groups_slug_check check (
  slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'
  and slug not in ('posts', 'tags', 'authors', 'archive', 'search', 'login', 'signup', 'logout', 'account', 'privacy',
                   'admin', 'apps', 'assets', 'brand', 'api', 'auth', 'index', 'static', 'public', '404')
);
create index if not exists tag_groups_tags_idx on public.tag_groups using gin (tags);

create or replace function public.touch_tag_group()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists tag_groups_touch on public.tag_groups;
create trigger tag_groups_touch before insert or update on public.tag_groups
  for each row execute function public.touch_tag_group();

-- Visitors (no account) may comment on and like what a tag-group site shows: public, published posts with a tag
-- from some tag group. Mirrors guestCanEngage() in src/lib/api/local.ts.
create or replace function public.guest_can_engage(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post and p.status = 'published' and p.visibility = 'public'
      and exists (select 1 from public.tag_groups g where g.tags && p.tags)
  )
$$;

-- Visitor comments: a typed name instead of an account.
alter table public.comments add column if not exists guest_name text;
alter table public.comments alter column user_id drop not null;
alter table public.comments drop constraint if exists comments_author_check;
alter table public.comments add constraint comments_author_check
  check (user_id is not null or (guest_name is not null and length(btrim(guest_name)) between 1 and 60));

-- Visitor likes, keyed by a hash of a random secret kept in the visitor's browser.
-- Written only through guest_toggle_like(), so nobody can remove someone else's like.
create table if not exists public.guest_likes (
  post_id      uuid not null references public.posts (id) on delete cascade,
  visitor_hash text not null check (length(visitor_hash) = 64),
  created_at   timestamptz not null default now(),
  primary key (post_id, visitor_hash)
);

create or replace function public.guest_toggle_like(p_post uuid, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if length(coalesce(p_secret, '')) < 32 then raise exception 'invalid visitor'; end if;
  if not public.guest_can_engage(p_post) then raise exception 'permission denied'; end if;
  h := encode(extensions.digest(p_secret, 'sha256'), 'hex');
  if exists (select 1 from public.guest_likes where post_id = p_post and visitor_hash = h) then
    delete from public.guest_likes where post_id = p_post and visitor_hash = h;
  else
    insert into public.guest_likes (post_id, visitor_hash) values (p_post, h);
  end if;
end $$;

-- ───────────────────────── role requests ─────────────────────────
create table if not exists public.role_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  requested_role text not null check (requested_role in ('admin', 'editor', 'reviewer', 'commenter', 'reader')),
  message        text not null default '' check (length(message) <= 2000),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.profiles (id),
  constraint role_requests_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade
);
-- One open request per user.
create unique index if not exists role_requests_one_pending on public.role_requests (user_id) where status = 'pending';

-- ───────────────────────── RPCs ─────────────────────────
create or replace function public.decide_role_request(req_id uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.role_requests;
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then
    raise exception 'only admins can decide role requests';
  end if;
  update public.role_requests
     set status = case when approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid()
   where id = req_id and status = 'pending'
  returning * into r;
  if found and approve then
    update public.profiles set role = r.requested_role where id = r.user_id;
  end if;
end $$;

-- Substring search works for Hebrew (no stemming dictionary needed); RLS still applies.
create or replace function public.search_posts(q text default '', tag_list text[] default '{}')
returns setof public.posts language sql stable as $$
  select p.* from public.posts p
  where (coalesce(array_length(tag_list, 1), 0) = 0 or p.tags @> tag_list)
    and (
      q = '' or not exists (
        select 1 from unnest(string_to_array(lower(regexp_replace(q, '[֑-ׇ]', '', 'g')), ' ')) as term
        where term <> ''
          and position(term in lower(p.title || ' ' || p.content_text || ' ' || array_to_string(p.tags, ' '))) = 0
      )
    )
$$;

create or replace function public.tag_counts()
returns table (tag text, count bigint) language sql stable as $$
  select t, count(*) from public.posts, unnest(tags) t
  where status = 'published' group by t order by count(*) desc, t
$$;

-- ───────────────────────── User management (admin only) ─────────────────────────
-- These touch auth.users directly, so the browser never needs the service-role key.
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (id uuid, display_name text, username text, role text, created_at timestamptz, email text,
               must_change_password boolean, suspended boolean, last_sign_in_at timestamptz, review_reason text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.role, p.created_at, u.email::text,
         p.must_change_password, p.suspended, u.last_sign_in_at, p.review_reason
  from public.profiles p join auth.users u on u.id = p.id
  where public.current_role_name() = 'admin'
  order by p.created_at
$$;

create or replace function public.require_admin_on(target uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then
    raise exception 'permission denied: admins only';
  end if;
  if target = auth.uid() then
    raise exception 'user/self';
  end if;
end $$;

create or replace function public.admin_create_user(p_email text, p_password text, p_display_name text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := gen_random_uuid();
  e text := lower(trim(p_email));
begin
  if coalesce(public.current_role_name(), '') <> 'admin' then
    raise exception 'permission denied: admins only';
  end if;
  if exists (select 1 from auth.users where email = e) then
    raise exception 'auth/exists';
  end if;
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', p_display_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true),
          'email', null, now(), now());
  -- The profile was created by on_auth_user_created.
  update public.profiles set role = p_role, must_change_password = true where id = uid;
  return uid;
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin_on(p_user);
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user;
  delete from auth.sessions where user_id = p_user;
  update public.profiles set must_change_password = true where id = p_user;
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin_on(p_user);
  update auth.users set banned_until = case when p_suspended then 'infinity'::timestamptz end, updated_at = now()
   where id = p_user;
  if p_suspended then
    delete from auth.sessions where user_id = p_user;
  end if;
  -- Lifting a suspension also approves the account: 'approved' keeps it off the admin's review list for good.
  update public.profiles set suspended = p_suspended,
         review_reason = case when p_suspended then review_reason else 'approved' end
   where id = p_user;
end $$;

-- Comments, likes, group memberships and role requests go with the account; posts move to the acting admin.
create or replace function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin_on(p_user);
  perform set_config('blog.reassign_posts', 'on', true);
  update public.posts set author_id = auth.uid() where author_id = p_user;
  perform set_config('blog.reassign_posts', 'off', true);
  update public.posts set allowed_users = array_remove(allowed_users, p_user) where p_user = any (allowed_users);
  update public.role_requests set decided_by = null where decided_by = p_user;
  delete from auth.users where id = p_user;
end $$;

revoke execute on function public.admin_create_user(text, text, text, text) from anon;
revoke execute on function public.admin_set_password(uuid, text) from anon;
revoke execute on function public.admin_set_suspended(uuid, boolean) from anon;
revoke execute on function public.admin_delete_user(uuid) from anon;

-- ───────────────────────── Row level security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.comments enable row level security;
alter table public.likes    enable row level security;
alter table public.role_requests enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.tag_groups enable row level security;
alter table public.guest_likes enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profiles self or admin update" on public.profiles;
create policy "profiles self or admin update" on public.profiles for update
  using (id = auth.uid() or public.current_role_name() = 'admin');

drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select
  using (public.can_view_post(posts));
drop policy if exists "posts insert" on public.posts;
create policy "posts insert" on public.posts for insert
  with check (author_id = auth.uid() and public.current_role_name() in ('admin', 'editor'));
drop policy if exists "posts update" on public.posts;
create policy "posts update" on public.posts for update
  using (public.current_role_name() = 'admin'
         or (public.current_role_name() = 'editor' and author_id = auth.uid()));
drop policy if exists "posts delete" on public.posts;
create policy "posts delete" on public.posts for delete
  using (public.current_role_name() = 'admin'
         or (public.current_role_name() = 'editor' and author_id = auth.uid()));

drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments for select
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "comments insert" on public.comments;
create policy "comments insert" on public.comments for insert
  with check (user_id = auth.uid()
              and public.current_role_name() in ('admin', 'editor', 'reviewer', 'commenter')
              and exists (select 1 from public.posts p where p.id = post_id));
-- Visitors on a tag-group site: no account, a name instead.
drop policy if exists "comments insert guest" on public.comments;
create policy "comments insert guest" on public.comments for insert
  with check (user_id is null and auth.uid() is null and guest_name is not null and resolved = false
              and public.guest_can_engage(post_id));
drop policy if exists "comments update" on public.comments;
create policy "comments update" on public.comments for update
  using (user_id = auth.uid() or public.current_role_name() in ('admin', 'editor', 'reviewer'));
drop policy if exists "comments delete" on public.comments;
create policy "comments delete" on public.comments for delete
  using (user_id = auth.uid() or public.current_role_name() = 'admin');

drop policy if exists "likes read" on public.likes;
create policy "likes read" on public.likes for select
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "likes insert own" on public.likes;
create policy "likes insert own" on public.likes for insert
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "likes delete own" on public.likes;
create policy "likes delete own" on public.likes for delete using (user_id = auth.uid());

drop policy if exists "guest likes read" on public.guest_likes;
create policy "guest likes read" on public.guest_likes for select
  using (exists (select 1 from public.posts p where p.id = post_id));
-- No insert/update/delete policies: changes go through guest_toggle_like().

-- Tag groups: everyone reads (the sites are public); only the admin writes. Mirrors can.manageTagGroups.
drop policy if exists "tag groups read" on public.tag_groups;
create policy "tag groups read" on public.tag_groups for select using (true);
drop policy if exists "tag groups admin write" on public.tag_groups;
create policy "tag groups admin write" on public.tag_groups for all
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

drop policy if exists "role requests read own or admin" on public.role_requests;
create policy "role requests read own or admin" on public.role_requests for select
  using (user_id = auth.uid() or public.current_role_name() = 'admin');
drop policy if exists "role requests create own" on public.role_requests;
create policy "role requests create own" on public.role_requests for insert
  with check (user_id = auth.uid() and status = 'pending' and decided_at is null and decided_by is null
              and requested_role <> coalesce(public.current_role_name(), ''));
-- Decisions go through decide_role_request(); no direct updates.

-- Groups: each author creates and manages their own; the admin sees and manages all.
drop policy if exists "groups read" on public.groups;
create policy "groups read" on public.groups for select
  using (public.current_role_name() = 'admin' or created_by = auth.uid());
drop policy if exists "groups write" on public.groups;
drop policy if exists "groups insert" on public.groups;
create policy "groups insert" on public.groups for insert
  with check (created_by = auth.uid() and public.current_role_name() in ('admin', 'editor'));
drop policy if exists "groups update" on public.groups;
create policy "groups update" on public.groups for update
  using (public.current_role_name() = 'admin' or created_by = auth.uid());
drop policy if exists "groups delete" on public.groups;
create policy "groups delete" on public.groups for delete
  using (public.current_role_name() = 'admin' or created_by = auth.uid());

-- Members are managed by whoever owns the group (or the admin).
create or replace function public.owns_group(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false)
      or exists (select 1 from public.groups g where g.id = gid and g.created_by = auth.uid())
$$;
drop policy if exists "group members read" on public.group_members;
create policy "group members read" on public.group_members for select
  using (public.owns_group(group_id));
drop policy if exists "group members write" on public.group_members;
create policy "group members write" on public.group_members for all
  using (public.owns_group(group_id))
  with check (public.owns_group(group_id));

-- ───────────────────────── possessions (the Possessions app, src/apps/possessions) ─────────────────────────
-- Each signed-in user's list of things they own. Private: only the owner reads or changes their rows (not even
-- the admin). Mirrors the owner checks in src/lib/api/local.ts and can.useApps() in src/lib/util.ts.
create table if not exists public.possessions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_type      text not null default '' check (length(item_type) <= 80),  -- what kind of thing: Book, Laptop
  category       text not null default '' check (length(category) <= 80),   -- a sub-type within it: Health
  title          text not null default '' check (length(title) <= 300),
  maker          text not null default '' check (length(maker) <= 200),
  description    text not null default '' check (length(description) <= 4000),
  quantity       numeric not null default 1,
  value          numeric,
  cost           numeric,
  date_purchased date,
  location       text not null default '' check (length(location) <= 200),
  condition      text not null default '' check (length(condition) <= 120),
  notes          text not null default '' check (length(notes) <= 4000),
  image_url      text,
  position       double precision not null default (extract(epoch from clock_timestamp()) * 1000),
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Upgrades for projects that ran an earlier version of this table.
alter table public.possessions add column if not exists item_type text not null default '';
alter table public.possessions add column if not exists position double precision not null
  default (extract(epoch from clock_timestamp()) * 1000);
alter table public.possessions drop constraint if exists possessions_item_type_check;
alter table public.possessions add constraint possessions_item_type_check check (length(item_type) <= 80);
drop index if exists public.possessions_owner_idx;
create index if not exists possessions_owner_type_idx on public.possessions (owner_id, item_type, category);

create or replace function public.touch_possession()
returns trigger language plpgsql as $$
begin
  new.owner_id := coalesce(old.owner_id, new.owner_id);  -- ownership never moves
  new.created_at := coalesce(old.created_at, new.created_at);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists possessions_touch on public.possessions;
create trigger possessions_touch before insert or update on public.possessions
  for each row execute function public.touch_possession();

alter table public.possessions enable row level security;
drop policy if exists "possessions own" on public.possessions;
create policy "possessions own" on public.possessions for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and not coalesce((select suspended from public.profiles where id = auth.uid()), false));

-- ───────────────────────── todos (the To-do app, src/apps/todo) ─────────────────────────
-- Each signed-in user's tasks. Private: only the owner reads or changes their rows (not even the admin).
-- Mirrors the owner checks in src/lib/api/local.ts and can.useApps() in src/lib/util.ts; field rules mirror
-- todoFields() in util.ts. `day` is the day list a task is on (null: the general pool). A task with no root_id
-- is a root purpose; its children are its steps and theirs its actions (root_id), each chained to its
-- siblings by prev_id / next_id. A list is every task naming it in `lists`; `tags` group tasks.
create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null default '' check (length(title) <= 300),
  description text not null default '' check (length(description) <= 4000),
  status      text not null default 'discovered',
  priority    smallint not null default 0 check (priority between 0 and 3),
  urgency     smallint not null default 0 check (urgency between 0 and 3),
  complexity  smallint not null default 0 check (complexity between 0 and 5),
  due_date    date,
  remind_on   date,
  day         date,
  depends_on  uuid[] not null default '{}',
  root_id     uuid references public.todos (id) on delete set null,
  prev_id     uuid references public.todos (id) on delete set null,
  next_id     uuid references public.todos (id) on delete set null,
  position    double precision not null default (extract(epoch from clock_timestamp()) * 1000),
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Added after the first draft of the table: safe to run again.
alter table public.todos add column if not exists type          text not null default 'achieving';
alter table public.todos add column if not exists estimate_date date;
alter table public.todos add column if not exists deadline      date;
alter table public.todos add column if not exists tags          text[] not null default '{}';
alter table public.todos add column if not exists lists         text[] not null default '{}';
-- Named values, people involved, comments and history: arrays of small objects (see TodoDatum, TodoContact,
-- TodoComment, TodoLogEntry in src/lib/types.ts; todoFields() caps their sizes).
alter table public.todos add column if not exists data          jsonb not null default '[]';
alter table public.todos add column if not exists contacts      jsonb not null default '[]';
alter table public.todos add column if not exists comments      jsonb not null default '[]';
alter table public.todos add column if not exists log           jsonb not null default '[]';
alter table public.todos drop constraint if exists todos_json_check;
alter table public.todos add constraint todos_json_check check (
  jsonb_typeof(data) = 'array' and jsonb_typeof(contacts) = 'array' and jsonb_typeof(comments) = 'array'
  and jsonb_typeof(log) = 'array' and pg_column_size(comments) + pg_column_size(log) + pg_column_size(data) < 2000000);
alter table public.todos alter column status set default 'discovered';
alter table public.todos drop constraint if exists todos_status_check;
update public.todos set status = case status
  when 'todo' then 'defined' when 'doing' then 'inprogress' when 'waiting' then 'onhold'
  when 'done' then 'completed' when 'dropped' then 'quit' else status end
  where status in ('todo', 'doing', 'waiting', 'done', 'dropped');
alter table public.todos add constraint todos_status_check
  check (status in ('discovered', 'researched', 'defined', 'blocked', 'onhold', 'inprogress', 'completed', 'quit'));
alter table public.todos drop constraint if exists todos_type_check;
alter table public.todos add constraint todos_type_check check (type in
  ('understanding', 'learning', 'achieving', 'decisions', 'checking', 'opportunities', 'enrichments', 'planning'));
alter table public.todos drop constraint if exists todos_labels_check;
alter table public.todos add constraint todos_labels_check
  check (coalesce(array_length(tags, 1), 0) <= 30 and coalesce(array_length(lists, 1), 0) <= 30);
create index if not exists todos_owner_day_idx on public.todos (owner_id, day);
create index if not exists todos_root_idx on public.todos (root_id);

create or replace function public.touch_todo()
returns trigger language plpgsql as $$
begin
  new.owner_id := coalesce(old.owner_id, new.owner_id);  -- ownership never moves
  new.created_at := coalesce(old.created_at, new.created_at);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists todos_touch on public.todos;
create trigger todos_touch before insert or update on public.todos
  for each row execute function public.touch_todo();

alter table public.todos enable row level security;
drop policy if exists "todos own" on public.todos;
create policy "todos own" on public.todos for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and not coalesce((select suspended from public.profiles where id = auth.uid()), false));

-- ───────────────────────── Storage (uploaded images / videos) ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media writers upload" on storage.objects;
create policy "media writers upload" on storage.objects for insert
  with check (bucket_id = 'media' and public.current_role_name() in ('admin', 'editor'));
-- Any signed-in user may upload photos of their possessions, only into possessions/<their id>/.
drop policy if exists "media own possessions upload" on storage.objects;
create policy "media own possessions upload" on storage.objects for insert
  with check (bucket_id = 'media' and auth.uid() is not null
              and (storage.foldername(name))[1] = 'possessions'
              and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects for delete
  using (bucket_id = 'media' and public.current_role_name() = 'admin');

-- ───────────────────────── Prebuilt admin ─────────────────────────
-- Creates odedsme@gmail.com with password "admin" (sign in with just "admin").
-- The app keeps nagging until the password is changed. Change the email here
-- (and VITE_ADMIN_EMAIL in the app) if you prefer another address.
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  admin_email text := 'odedsme@gmail.com';
  uid uuid;
begin
  select id into uid from auth.users where email = admin_email;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', admin_email,
      extensions.crypt('admin', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"Admin"}', now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', admin_email, 'email_verified', true),
            'email', now(), now(), now());
    -- The profile was created by on_auth_user_created; promote it.
    update public.profiles set role = 'admin', display_name = 'Admin', must_change_password = true where id = uid;
  else
    -- The account already existed (e.g. signed up before this file was run, so it may have no profile).
    -- Make it the manager and confirm its email; its password is left as it is.
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = uid;
    insert into public.profiles (id, display_name, username, role)
    values (uid, 'Admin',
            case when exists (select 1 from public.profiles where username = 'admin')
                 then 'admin' || left(replace(uid::text, '-', ''), 6) else 'admin' end,
            'admin')
    on conflict (id) do update set role = 'admin';
  end if;
end $$;
