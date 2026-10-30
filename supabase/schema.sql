-- Bilingual blog — Supabase schema.
-- Run once in Supabase Dashboard → SQL Editor (safe to re-run).
--
-- Roles:
--   admin     manager: everything, incl. user roles
--   editor    write / publish / edit own posts, upload media
--   reviewer  read drafts, comment, resolve comments
--   commenter comment on published posts, like
--   reader    (default for new sign-ups) read and like; can request any other role
-- A prebuilt admin is created at the end of this file: sign in as "admin" / "admin"
-- (email admin@oded.me) and change the password right away.

create extension if not exists pg_trgm;

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  username     text not null unique,
  role         text not null default 'reader'
               check (role in ('admin', 'editor', 'reviewer', 'commenter', 'reader')),
  created_at   timestamptz not null default now()
);

-- Upgrades for projects created with an earlier version of this file.
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists suspended boolean not null default false;
alter table public.profiles alter column role set default 'reader';
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
  base text := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]', '', 'g');
  uname text;
  n int := 1;
begin
  if base = '' then base := 'user'; end if;
  uname := base;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into public.profiles (id, display_name, username, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), base),
    uname,
    'reader'
  );
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
  if new.suspended is distinct from old.suspended and auth.uid() is not null
     and coalesce(public.current_role_name(), '') <> 'admin' then
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

-- Audience: public | private (author + admin) | restricted (allowed_users + members of allowed_groups)
alter table public.posts add column if not exists visibility text not null default 'public';
alter table public.posts add column if not exists allowed_users uuid[] not null default '{}';
alter table public.posts add column if not exists allowed_groups uuid[] not null default '{}';
alter table public.posts drop constraint if exists posts_visibility_check;
alter table public.posts add constraint posts_visibility_check check (visibility in ('public', 'private', 'restricted'));

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
               must_change_password boolean, suspended boolean, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.role, p.created_at, u.email::text,
         p.must_change_password, p.suspended, u.last_sign_in_at
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
  update public.profiles set suspended = p_suspended where id = p_user;
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

-- ───────────────────────── Storage (uploaded images / videos) ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media writers upload" on storage.objects;
create policy "media writers upload" on storage.objects for insert
  with check (bucket_id = 'media' and public.current_role_name() in ('admin', 'editor'));
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects for delete
  using (bucket_id = 'media' and public.current_role_name() = 'admin');

-- ───────────────────────── Prebuilt admin ─────────────────────────
-- Creates admin@oded.me with password "admin" (sign in with just "admin").
-- The app keeps nagging until the password is changed. Change the email here
-- (and VITE_ADMIN_EMAIL in the app) if you prefer another address.
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  admin_email text := 'hamecoded@gmail.com';
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
