-- =====================================================================================
-- Diskarte — complete database schema
-- Tables:   profiles, servers, members, channels, messages, reactions
-- Security: Row-Level Security on every table, SECURITY DEFINER helpers with a pinned
--           search_path, field-level guard triggers, DB-side rate limiting, private
--           Realtime channel authorization and Storage bucket policies.
--
-- Apply with `supabase db push`, `supabase start` (local) or paste into the SQL editor.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------------------------------
-- Enums. member_role is declared lowest → highest so roles compare with >= / <.
-- -------------------------------------------------------------------------------------
create type public.member_role as enum ('member', 'moderator', 'admin');
create type public.channel_type as enum ('text', 'voice');
create type public.presence_status as enum ('online', 'idle', 'dnd', 'invisible');

-- -------------------------------------------------------------------------------------
-- Utility functions
-- -------------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 10 characters from a 32-symbol alphabet without look-alikes (0/O, 1/I/L) ≈ 50 bits of entropy.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(10);
  code text := '';
begin
  for i in 0..9 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return code;
end;
$$;

-- Casts text to uuid, returning null instead of raising (used on user-controlled paths/topics).
create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- -------------------------------------------------------------------------------------
-- profiles
-- -------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,32}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 32),
  avatar_preset text not null default 'araw' check (avatar_preset ~ '^[a-z0-9-]{2,24}$'),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 1024 and avatar_url ~ '^https://[^[:space:]"''()<>]+$')),
  banner_preset text not null default 'paglubog' check (banner_preset ~ '^[a-z0-9-]{2,24}$'),
  banner_url text check (banner_url is null or (char_length(banner_url) <= 1024 and banner_url ~ '^https://[^[:space:]"''()<>]+$')),
  bio text not null default '' check (char_length(bio) <= 190),
  status public.presence_status not null default 'online',
  custom_status text check (custom_status is null or char_length(custom_status) <= 64),
  custom_status_emoji text check (custom_status_emoji is null or char_length(custom_status_emoji) <= 16),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Keep id / created_at immutable from the client side.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'PROFILE_IMMUTABLE_FIELD' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- Derive a unique, valid username from whatever the auth provider gave us.
create or replace function public.unique_username(seed text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base text;
  candidate text;
  attempt int := 0;
begin
  base := lower(coalesce(seed, ''));
  base := regexp_replace(base, '[^a-z0-9_.]', '', 'g');
  base := left(base, 24);
  if char_length(base) < 3 then
    base := 'kabayan';
  end if;
  candidate := base;
  while exists (select 1 from public.profiles p where p.username = candidate) loop
    attempt := attempt + 1;
    candidate := left(base, 24) || '_' || lpad((floor(random() * 10000))::int::text, 4, '0');
    if attempt > 50 then
      candidate := 'kabayan_' || replace(gen_random_uuid()::text, '-', '');
      candidate := left(candidate, 32);
      exit;
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text;
  dname text;
begin
  uname := public.unique_username(
    coalesce(
      nullif(meta ->> 'username', ''),
      nullif(meta ->> 'user_name', ''),
      nullif(meta ->> 'preferred_username', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  dname := left(
    btrim(coalesce(
      nullif(meta ->> 'display_name', ''),
      nullif(meta ->> 'full_name', ''),
      nullif(meta ->> 'name', ''),
      uname
    )),
    32
  );
  if char_length(dname) = 0 then
    dname := uname;
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    uname,
    dname,
    case when (meta ->> 'avatar_url') ~ '^https://[^[:space:]"''()<>]+$' and char_length(meta ->> 'avatar_url') <= 1024 then meta ->> 'avatar_url' else null end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------------------------
-- servers ("Tambayan")
-- -------------------------------------------------------------------------------------
create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 64),
  description text not null default '' check (char_length(description) <= 280),
  icon_url text check (icon_url is null or (char_length(icon_url) <= 1024 and icon_url ~ '^https://[^[:space:]"''()<>]+$')),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique default public.generate_invite_code(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index servers_owner_idx on public.servers (owner_id);

create trigger servers_set_updated_at
  before update on public.servers
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------------------
-- members (server membership + RBAC role)
-- -------------------------------------------------------------------------------------
create table public.members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  nickname text check (nickname is null or char_length(btrim(nickname)) between 1 and 32),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create index members_user_idx on public.members (user_id);

-- -------------------------------------------------------------------------------------
-- channels
-- -------------------------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  type public.channel_type not null default 'text',
  category text not null default 'Text Channels' check (char_length(btrim(category)) between 1 and 32),
  topic text not null default '' check (char_length(topic) <= 256),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint channels_name_format check (
    (type = 'text' and name ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
    or (type = 'voice' and char_length(btrim(name)) between 1 and 32)
  )
);

create index channels_server_idx on public.channels (server_id, position);

-- -------------------------------------------------------------------------------------
-- messages
-- -------------------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  content text not null default '' check (char_length(content) <= 4000),
  attachments jsonb not null default '[]'::jsonb check (
    jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10
  ),
  reply_to_id uuid references public.messages (id) on delete set null,
  pinned boolean not null default false,
  pinned_at timestamptz,
  pinned_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_not_empty check (char_length(btrim(content)) > 0 or jsonb_array_length(attachments) > 0)
);

create index messages_channel_created_idx on public.messages (channel_id, created_at desc, id desc);
create index messages_channel_pinned_idx on public.messages (channel_id, pinned_at desc) where pinned;
create index messages_author_created_idx on public.messages (author_id, created_at desc);
create index messages_server_idx on public.messages (server_id);

-- -------------------------------------------------------------------------------------
-- reactions
-- -------------------------------------------------------------------------------------
create table public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji ~ '^(:[a-z0-9_]{2,32}:|[^[:space:]]{1,16})$'),
  channel_id uuid not null references public.channels (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index reactions_channel_idx on public.reactions (channel_id);
create index reactions_server_idx on public.reactions (server_id);
create index reactions_user_idx on public.reactions (user_id);

-- =====================================================================================
-- Authorization helpers. SECURITY DEFINER so RLS policies can consult `members`
-- without recursing into members' own policies; search_path is pinned to ''.
-- =====================================================================================
create or replace function public.server_role(p_server_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.members m
  where m.server_id = p_server_id
    and m.user_id = (select auth.uid());
$$;

create or replace function public.is_server_member(p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.server_id = p_server_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_server_role(p_server_id uuid, p_min public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.server_role(p_server_id) >= p_min, false);
$$;

create or replace function public.is_server_owner(p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.servers s
    where s.id = p_server_id
      and s.owner_id = (select auth.uid())
  );
$$;

create or replace function public.channel_server_id(p_channel_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.server_id from public.channels c where c.id = p_channel_id;
$$;

-- =====================================================================================
-- Triggers: server bootstrap, membership guards, message & reaction integrity
-- =====================================================================================

-- New server → owner becomes admin + default Filipino-flavoured channels.
create or replace function public.bootstrap_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (server_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict (server_id, user_id) do update set role = 'admin';

  insert into public.channels (server_id, name, type, category, topic, position) values
    (new.id, 'general', 'text', 'Text Channels', 'Dito ang main tambayan. Be kind, walang toxic.', 0),
    (new.id, 'chika', 'text', 'Text Channels', 'Kwentuhan, memes at marites updates.', 1),
    (new.id, 'lfg-valorant', 'text', 'Text Channels', 'Looking for group? Hanap ng ka-duo dito.', 2),
    (new.id, 'Tambayan 1', 'voice', 'Voice Channels', '', 3),
    (new.id, 'Chill & Music', 'voice', 'Voice Channels', '', 4);
  return new;
end;
$$;

create trigger servers_bootstrap
  after insert on public.servers
  for each row execute function public.bootstrap_server();

-- Servers: only the owner may transfer ownership or change the invite code directly.
create or replace function public.servers_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new; -- service role / migrations
  end if;
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'SERVER_IMMUTABLE_FIELD' using errcode = '42501';
  end if;
  if new.owner_id <> old.owner_id then
    if old.owner_id <> (select auth.uid()) then
      raise exception 'ONLY_OWNER_CAN_TRANSFER' using errcode = '42501';
    end if;
    if not exists (select 1 from public.members m where m.server_id = old.id and m.user_id = new.owner_id) then
      raise exception 'NEW_OWNER_MUST_BE_MEMBER' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger servers_guard
  before update on public.servers
  for each row execute function public.servers_guard();

-- Ownership transfer promotes the new owner to admin.
create or replace function public.servers_owner_promote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then
    update public.members set role = 'admin'
    where server_id = new.id and user_id = new.owner_id;
  end if;
  return new;
end;
$$;

create trigger servers_owner_promote
  after update of owner_id on public.servers
  for each row execute function public.servers_owner_promote();

-- Members: field-level RBAC enforcement.
create or replace function public.members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.member_role;
  owner uuid;
begin
  if caller is null then
    return new;
  end if;
  if new.server_id <> old.server_id or new.user_id <> old.user_id or new.joined_at <> old.joined_at then
    raise exception 'MEMBER_IMMUTABLE_FIELD' using errcode = '42501';
  end if;

  select s.owner_id into owner from public.servers s where s.id = old.server_id;
  caller_role := public.server_role(old.server_id);

  if new.role is distinct from old.role then
    if caller_role is distinct from 'admin' then
      raise exception 'ONLY_ADMINS_CAN_CHANGE_ROLES' using errcode = '42501';
    end if;
    if old.user_id = owner then
      raise exception 'CANNOT_CHANGE_OWNER_ROLE' using errcode = '42501';
    end if;
    if old.user_id = caller then
      raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '42501';
    end if;
    if old.role = 'admin' and caller <> owner then
      raise exception 'ONLY_OWNER_CAN_DEMOTE_ADMINS' using errcode = '42501';
    end if;
  end if;

  if new.nickname is distinct from old.nickname and old.user_id <> caller then
    if caller_role is null or caller_role < 'moderator' or (old.role >= caller_role and caller <> owner) then
      raise exception 'CANNOT_RENAME_MEMBER' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger members_guard
  before update on public.members
  for each row execute function public.members_guard();

create or replace function public.members_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.member_role;
begin
  if caller is null then
    return old;
  end if;
  -- Server deletion cascades here after the server row is gone: allow it unconditionally.
  if not exists (select 1 from public.servers s where s.id = old.server_id) then
    return old;
  end if;
  -- The owner can only leave by deleting the server.
  if exists (select 1 from public.servers s where s.id = old.server_id and s.owner_id = old.user_id) then
    raise exception 'OWNER_CANNOT_LEAVE' using errcode = '42501';
  end if;
  if old.user_id <> caller then
    caller_role := public.server_role(old.server_id);
    if caller_role is null or caller_role < 'moderator'
       or (old.role >= caller_role and not public.is_server_owner(old.server_id)) then
      raise exception 'CANNOT_KICK_MEMBER' using errcode = '42501';
    end if;
  end if;
  return old;
end;
$$;

create trigger members_delete_guard
  before delete on public.members
  for each row execute function public.members_delete_guard();

-- Channels: server_id is immutable.
create or replace function public.channels_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.server_id <> old.server_id or new.id <> old.id then
    raise exception 'CHANNEL_IMMUTABLE_FIELD' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger channels_guard
  before update on public.channels
  for each row execute function public.channels_guard();

-- Messages: derive server_id, validate channel + attachments, rate limit.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  ch record;
  att jsonb;
  prefix text;
  recent int;
begin
  select c.server_id, c.type into ch from public.channels c where c.id = new.channel_id;
  if not found then
    raise exception 'CHANNEL_NOT_FOUND' using errcode = '23503';
  end if;
  if ch.type <> 'text' then
    raise exception 'NOT_A_TEXT_CHANNEL' using errcode = '23514';
  end if;

  new.server_id := ch.server_id;
  new.content := btrim(new.content);
  new.created_at := now();
  new.edited_at := null;
  new.pinned := false;
  new.pinned_at := null;
  new.pinned_by := null;

  if caller is not null then
    new.author_id := caller;

    -- 8 messages per 10 seconds per user, across all channels.
    select count(*) into recent
    from public.messages m
    where m.author_id = caller
      and m.created_at > now() - interval '10 seconds';
    if recent >= 8 then
      raise exception 'RATE_LIMITED' using errcode = '53400', hint = 'Dahan-dahan lang, kabayan. Try again in a few seconds.';
    end if;

    -- Attachments must live under {server}/{channel}/{uploader}/ in the attachments bucket.
    prefix := ch.server_id::text || '/' || new.channel_id::text || '/' || caller::text || '/';
    for att in select * from jsonb_array_elements(new.attachments) loop
      if jsonb_typeof(att) <> 'object'
         or not (att ? 'path') or not (att ? 'name') or not (att ? 'size') or not (att ? 'type')
         or left(att ->> 'path', char_length(prefix)) <> prefix
         or (att ->> 'path') like '%..%'
         or (att ->> 'size')::bigint > 26214400 then
        raise exception 'INVALID_ATTACHMENT' using errcode = '23514';
      end if;
    end loop;
  end if;

  if new.reply_to_id is not null and not exists (
    select 1 from public.messages r where r.id = new.reply_to_id and r.channel_id = new.channel_id
  ) then
    new.reply_to_id := null;
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Authors edit content; moderators pin. Nothing else is mutable.
create or replace function public.messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    return new;
  end if;
  if new.id <> old.id
     or new.channel_id <> old.channel_id
     or new.server_id <> old.server_id
     or new.author_id is distinct from old.author_id
     or new.created_at <> old.created_at
     or new.reply_to_id is distinct from old.reply_to_id
     or new.attachments <> old.attachments then
    raise exception 'MESSAGE_IMMUTABLE_FIELD' using errcode = '42501';
  end if;

  if new.content is distinct from old.content then
    if old.author_id is distinct from caller then
      raise exception 'ONLY_AUTHOR_CAN_EDIT' using errcode = '42501';
    end if;
    new.content := btrim(new.content);
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  if new.pinned is distinct from old.pinned then
    if not public.has_server_role(old.server_id, 'moderator') then
      raise exception 'ONLY_MODERATORS_CAN_PIN' using errcode = '42501';
    end if;
    if new.pinned then
      new.pinned_at := now();
      new.pinned_by := caller;
    else
      new.pinned_at := null;
      new.pinned_by := null;
    end if;
  else
    new.pinned_at := old.pinned_at;
    new.pinned_by := old.pinned_by;
  end if;
  return new;
end;
$$;

create trigger messages_before_update
  before update on public.messages
  for each row execute function public.messages_before_update();

-- Reactions: derive channel/server from the message, cap distinct emoji per message.
create or replace function public.reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg record;
  distinct_emoji int;
begin
  select m.channel_id, m.server_id into msg from public.messages m where m.id = new.message_id;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = '23503';
  end if;
  new.channel_id := msg.channel_id;
  new.server_id := msg.server_id;
  if (select auth.uid()) is not null then
    new.user_id := (select auth.uid());
  end if;

  select count(distinct r.emoji) into distinct_emoji
  from public.reactions r
  where r.message_id = new.message_id and r.emoji <> new.emoji;
  if distinct_emoji >= 20 then
    raise exception 'TOO_MANY_REACTIONS' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger reactions_before_insert
  before insert on public.reactions
  for each row execute function public.reactions_before_insert();

-- =====================================================================================
-- RPCs
-- =====================================================================================
create or replace function public.create_server(p_name text, p_description text default '', p_icon_url text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned int;
  new_id uuid;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select count(*) into owned from public.servers s where s.owner_id = caller;
  if owned >= 25 then
    raise exception 'SERVER_LIMIT_REACHED' using errcode = '53400';
  end if;
  if p_icon_url is not null and p_icon_url !~ '^https://[^[:space:]"''()<>]+$' then
    raise exception 'INVALID_ICON_URL' using errcode = '23514';
  end if;

  insert into public.servers (name, description, icon_url, owner_id)
  values (btrim(p_name), coalesce(btrim(p_description), ''), p_icon_url, caller)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.get_invite(p_code text)
returns table (server_id uuid, name text, description text, icon_url text, member_count bigint, already_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.description, s.icon_url,
         (select count(*) from public.members m where m.server_id = s.id),
         public.is_server_member(s.id)
  from public.servers s
  where s.invite_code = upper(btrim(p_code));
$$;

create or replace function public.join_server(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  joined int;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select s.id into target from public.servers s where s.invite_code = upper(btrim(p_code));
  if target is null then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select count(*) into joined from public.members m where m.user_id = caller;
  if joined >= 100 and not public.is_server_member(target) then
    raise exception 'SERVER_JOIN_LIMIT' using errcode = '53400';
  end if;
  insert into public.members (server_id, user_id, role)
  values (target, caller, 'member')
  on conflict (server_id, user_id) do nothing;
  return target;
end;
$$;

create or replace function public.regenerate_invite(p_server_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not public.has_server_role(p_server_id, 'admin') then
    raise exception 'ONLY_ADMINS_CAN_REGENERATE_INVITES' using errcode = '42501';
  end if;
  loop
    code := public.generate_invite_code();
    exit when not exists (select 1 from public.servers s where s.invite_code = code);
  end loop;
  update public.servers set invite_code = code where id = p_server_id;
  return code;
end;
$$;

-- Lets the sign-up form check a handle without exposing the profiles table to anon.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(p_username)) ~ '^[a-z0-9_.]{3,32}$'
     and not exists (select 1 from public.profiles p where p.username = lower(btrim(p_username)));
$$;

-- Lock down function execution: helpers are callable by signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.server_role(uuid),
  public.is_server_member(uuid),
  public.has_server_role(uuid, public.member_role),
  public.is_server_owner(uuid),
  public.channel_server_id(uuid),
  public.try_uuid(text),
  public.create_server(text, text, text),
  public.get_invite(text),
  public.join_server(text),
  public.regenerate_invite(uuid),
  public.username_available(text)
to authenticated;
-- Invite previews are visible before signing in.
grant execute on function public.get_invite(text), public.username_available(text) to anon;

-- =====================================================================================
-- Row-Level Security
-- =====================================================================================
alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;

-- profiles ------------------------------------------------------------------------------
create policy "profiles are readable by signed-in users"
  on public.profiles for select to authenticated
  using (true);

create policy "users insert their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- servers -------------------------------------------------------------------------------
create policy "members can view their servers"
  on public.servers for select to authenticated
  using (public.is_server_member(id));

create policy "admins can update servers"
  on public.servers for update to authenticated
  using (public.has_server_role(id, 'admin'))
  with check (public.is_server_member(id));

create policy "owners can delete servers"
  on public.servers for delete to authenticated
  using (owner_id = (select auth.uid()));

-- members -------------------------------------------------------------------------------
create policy "members can view fellow members"
  on public.members for select to authenticated
  using (public.is_server_member(server_id));

create policy "members update self, moderators update others"
  on public.members for update to authenticated
  using (user_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'))
  with check (public.is_server_member(server_id));

create policy "members leave, moderators kick"
  on public.members for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

-- channels ------------------------------------------------------------------------------
create policy "members can view channels"
  on public.channels for select to authenticated
  using (public.is_server_member(server_id));

create policy "moderators create channels"
  on public.channels for insert to authenticated
  with check (public.has_server_role(server_id, 'moderator'));

create policy "moderators update channels"
  on public.channels for update to authenticated
  using (public.has_server_role(server_id, 'moderator'))
  with check (public.has_server_role(server_id, 'moderator'));

create policy "moderators delete channels"
  on public.channels for delete to authenticated
  using (public.has_server_role(server_id, 'moderator'));

-- messages ------------------------------------------------------------------------------
create policy "members read messages"
  on public.messages for select to authenticated
  using (public.is_server_member(server_id));

create policy "members send messages as themselves"
  on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_server_member(server_id));

create policy "authors edit, moderators pin"
  on public.messages for update to authenticated
  using (author_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'))
  with check (public.is_server_member(server_id));

create policy "authors and moderators delete messages"
  on public.messages for delete to authenticated
  using (author_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

-- reactions -----------------------------------------------------------------------------
create policy "members read reactions"
  on public.reactions for select to authenticated
  using (public.is_server_member(server_id));

create policy "members react as themselves"
  on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_server_member(server_id));

create policy "users remove their reactions, moderators remove any"
  on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

-- =====================================================================================
-- Realtime: postgres_changes publication + private broadcast/presence authorization.
-- Topics: `server:<uuid>` (presence, voice occupancy) and `channel:<uuid>` (typing).
-- =====================================================================================
alter publication supabase_realtime add table public.messages, public.reactions, public.channels, public.members, public.servers;

create or replace function public.can_access_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := split_part(p_topic, ':', 1);
  target uuid := public.try_uuid(split_part(p_topic, ':', 2));
begin
  if target is null then
    return false;
  end if;
  if kind = 'server' then
    return public.is_server_member(target);
  elsif kind = 'channel' then
    return public.is_server_member(public.channel_server_id(target));
  end if;
  return false;
end;
$$;

grant execute on function public.can_access_realtime_topic(text) to authenticated;

create policy "members receive private server/channel broadcasts"
  on realtime.messages for select to authenticated
  using (public.can_access_realtime_topic((select realtime.topic())));

create policy "members send private server/channel broadcasts"
  on realtime.messages for insert to authenticated
  with check (public.can_access_realtime_topic((select realtime.topic())));

-- =====================================================================================
-- Storage
--   avatars:     public read; users write under `<uid>/...`, admins under `servers/<server>/...`
--   attachments: private; members read `<server>/...`, upload under `<server>/<channel>/<uid>/...`
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('attachments', 'attachments', false, 26214400, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload their own avatar and banner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or ((storage.foldername(name))[1] = 'servers'
          and public.has_server_role(public.try_uuid((storage.foldername(name))[2]), 'admin'))
    )
  );

create policy "users replace their own avatar and banner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or ((storage.foldername(name))[1] = 'servers'
          and public.has_server_role(public.try_uuid((storage.foldername(name))[2]), 'admin'))
    )
  );

create policy "users delete their own avatar and banner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or ((storage.foldername(name))[1] = 'servers'
          and public.has_server_role(public.try_uuid((storage.foldername(name))[2]), 'admin'))
    )
  );

create policy "members read server attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_server_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "members upload attachments to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_server_member(public.try_uuid((storage.foldername(name))[1]))
    and public.channel_server_id(public.try_uuid((storage.foldername(name))[2])) = public.try_uuid((storage.foldername(name))[1])
    and (storage.foldername(name))[3] = (select auth.uid())::text
  );

create policy "uploaders and moderators delete attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments' and (
      (storage.foldername(name))[3] = (select auth.uid())::text
      or public.has_server_role(public.try_uuid((storage.foldername(name))[1]), 'moderator')
    )
  );
