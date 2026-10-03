-- =====================================================================================
-- Diskarte HQ: the global "super server" every account belongs to.
--
--   * one system-managed server (is_system, no owner — so nobody can delete or transfer it);
--   * every new profile joins it automatically, and the existing ones are backfilled;
--   * its admins are the "creators" listed in public.system_creators (seeded with the app owner,
--     supremo.der) — separate from the early-access platform admins;
--   * #announcements is read-only: only server admins (here: the creators) can post;
--   * #global-lounge is open to everyone, behind slow mode, auto-mod and verified accounts;
--   * nobody can leave it (moderators can still kick or ban).
-- =====================================================================================

alter table public.servers alter column owner_id drop not null;
alter table public.servers add column is_system boolean not null default false;
create unique index servers_single_system_idx on public.servers ((true)) where is_system;

alter table public.channels add column read_only boolean not null default false;

create or replace function public.bootstrap_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The system server has no owner and hand-picked channels (see below).
  if new.is_system then
    return new;
  end if;
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
  -- Nobody leaves the global server (moderators may still kick; account deletion runs as the system).
  if old.user_id = caller and exists (select 1 from public.servers s where s.id = old.server_id and s.is_system) then
    raise exception 'CANNOT_LEAVE_SYSTEM_SERVER' using errcode = '42501';
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

create or replace function public.members_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  -- Everyone joins the global server automatically: those joins aren't news.
  if tg_op = 'INSERT' and exists (select 1 from public.servers s where s.id = new.server_id and s.is_system) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit(new.server_id, 'member.join', 'member', new.user_id);
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public.log_audit(new.server_id, 'member.role_update', 'member', new.user_id,
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(current_setting('diskarte.banning', true), '') = '1' then
      return old; -- ban_member logs its own entry
    end if;
    if caller is null or caller = old.user_id then
      perform public.log_audit(old.server_id, 'member.leave', 'member', old.user_id);
    else
      perform public.log_audit(old.server_id, 'member.kick', 'member', old.user_id);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

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
  -- The global server belongs to nobody, forever; and only migrations decide which server that is.
  if new.is_system is distinct from old.is_system or (old.is_system and new.owner_id is not null) then
    raise exception 'SYSTEM_SERVER_IMMUTABLE' using errcode = '42501';
  end if;
  if new.owner_id is distinct from old.owner_id then
    if old.owner_id is distinct from (select auth.uid()) then
      raise exception 'ONLY_OWNER_CAN_TRANSFER' using errcode = '42501';
    end if;
    if not exists (select 1 from public.members m where m.server_id = old.id and m.user_id = new.owner_id) then
      raise exception 'NEW_OWNER_MUST_BE_MEMBER' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

/** The global server's id (fixed, so clients and migrations can refer to it). */
create or replace function public.system_server_id()
returns uuid
language sql
immutable
set search_path = ''
as $$ select 'd15ca47e-0000-4000-8000-000000000001'::uuid $$;

insert into public.servers (id, name, description, owner_id, is_system, automod_enabled)
values (public.system_server_id(), 'Diskarte HQ', 'The tambayan for every Diskarte member: announcements from the team and a lounge for everyone.', null, true, true)
on conflict (id) do nothing;

insert into public.channels (id, server_id, name, type, category, topic, position, read_only, slowmode_seconds, requires_verification) values
  ('d15ca47e-0000-4000-8000-0000000000a1', public.system_server_id(), 'announcements', 'text', 'Diskarte HQ', 'Release notes, creator news and app updates from the Diskarte team.', 0, true, 0, false),
  ('d15ca47e-0000-4000-8000-0000000000a2', public.system_server_id(), 'global-lounge', 'text', 'Diskarte HQ', 'Chika with everyone on Diskarte. Be kind — slow mode is on.', 1, false, 5, true)
on conflict (id) do nothing;

/**
 * The creators: the only people who post in HQ's #announcements (they are HQ's admins). Managed from the
 * SQL Editor only — clients can neither read nor change it. Adding or removing a row promotes or demotes
 * that person in HQ.
 */
create table public.system_creators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.system_creators enable row level security;
revoke all on public.system_creators from anon, authenticated;

-- The app owner: Der (@supremo.der). Skipped where that account doesn't exist (local, CI).
insert into public.system_creators (user_id)
select p.id from public.profiles p where p.id = '7097605b-dbf8-4c88-808b-f60691750564'
on conflict (user_id) do nothing;

/** Puts every profile in the global server (creators as admins). Idempotent; used for the backfill. */
create or replace function public.join_everyone_to_system_server()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  insert into public.members (server_id, user_id, role)
  select public.system_server_id(), p.id,
         case when exists (select 1 from public.system_creators c where c.user_id = p.id) then 'admin'::public.member_role else 'member'::public.member_role end
  from public.profiles p
  on conflict (server_id, user_id) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function public.join_everyone_to_system_server() from public, anon, authenticated;

select public.join_everyone_to_system_server();

/** New accounts join the global server the moment their profile exists. */
create or replace function public.profiles_join_system_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (server_id, user_id, role)
  select public.system_server_id(), new.id,
         case when exists (select 1 from public.system_creators c where c.user_id = new.id) then 'admin'::public.member_role else 'member'::public.member_role end
  where exists (select 1 from public.servers s where s.id = public.system_server_id())
  on conflict (server_id, user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_join_system_server
  after insert on public.profiles
  for each row execute function public.profiles_join_system_server();

/** Adding someone to system_creators makes them an HQ admin; removing them makes them a member again. */
create or replace function public.system_creators_sync_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.members set role = 'member' where server_id = public.system_server_id() and user_id = old.user_id;
    return old;
  end if;
  insert into public.members (server_id, user_id, role)
  select public.system_server_id(), new.user_id, 'admin'
  where exists (select 1 from public.profiles p where p.id = new.user_id)
  on conflict (server_id, user_id) do update set role = 'admin';
  return new;
end;
$$;

create trigger system_creators_sync_role
  after insert or delete on public.system_creators
  for each row execute function public.system_creators_sync_role();

/** Read-only channels (#announcements): only server admins post, reply in threads, or stick stickers. */
create or replace function public.messages_read_only_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if exists (select 1 from public.channels c where c.id = new.channel_id and c.read_only)
     and not public.has_server_role(public.channel_server_id(new.channel_id), 'admin') then
    raise exception 'READ_ONLY_CHANNEL' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_read_only_guard
  before insert on public.messages
  for each row execute function public.messages_read_only_guard();
