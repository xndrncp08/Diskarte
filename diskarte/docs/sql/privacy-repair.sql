-- =====================================================================================
-- Production privacy repair (2026-11-12): applies, in one transaction,
--   supabase/migrations/20261109000000_privacy_hardening.sql
--   supabase/migrations/20261109020000_avatar_listing.sql
-- to a database that never received them. Both are copied below verbatim (a test checks that).
--
-- Production has no supabase_migrations history, so `db push` must not be used. Run this whole
-- file once, as the postgres role, only with the owner's approval:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f diskarte/docs/sql/privacy-repair.sql
-- (or paste it whole into the Supabase SQL editor). Deploy order: the app is already deployed.
--
-- Safety: a preflight refuses to run unless the schema is exactly the one this was rehearsed on
-- (diskarte/tests/db/privacy-repair.test.ts); postchecks abort before COMMIT if any Invisible
-- choice, row count or audit tag is wrong. Any error rolls everything back; nothing is half-done.
-- If it fails, do not retry blindly: read the error, rerun the preflight block alone.
-- Locks: brief strong locks on profiles, privacy_settings, audit_logs, message_edits,
-- realtime.messages and storage.objects until COMMIT; lock_timeout keeps it from queueing traffic.
-- =====================================================================================

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Preflight (read-only; safe to run on its own).
do $$
declare
  problems text[] := '{}';
  -- md5(prosrc) of the definitions these migrations replace (latest before 20261109000000).
  expected constant jsonb := '{
    "public.can_access_realtime_topic(text)": "32df48d5aae690aed0babca7ff1ef7a7",
    "public.channels_audit()": "e184beba29a735e208b374f1f4d2fa39",
    "public.friends_activity()": "492a6f9ffd519695e5dd3a92ec9d1a9c",
    "public.heartbeat_device(uuid,text,text,public.presence_status,text,uuid)": "6fdf595df53a56122cf6a6c3498e18d0"
  }';
  fn text;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
      and ((table_name = 'privacy_settings' and column_name = 'invisible')
        or (table_name = 'audit_logs' and column_name in ('channel_id', 'channel_private')))) then
    problems := array_append(problems, 'privacy_settings.invisible or audit_logs.channel_* already exists');
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_status_not_invisible') then
    problems := array_append(problems, 'profiles_status_not_invisible already exists');
  end if;
  if exists (select 1 from pg_trigger where not tgisinternal and tgname in ('profiles_hide_invisible', 'audit_logs_tag_channel')) then
    problems := array_append(problems, 'repair triggers already exist');
  end if;
  if exists (select 1 from pg_policies where (schemaname, tablename, policyname) in (
      ('realtime', 'messages', 'invisible users publish no presence'),
      ('storage', 'objects', 'uploaders see their own avatar folders'))) then
    problems := array_append(problems, 'repair policies already exist');
  end if;
  if (select count(*) from pg_policies where (schemaname, tablename, policyname) in (
      ('public', 'audit_logs', 'moderators read the audit log'),
      ('public', 'message_edits', 'authors and moderators read edit history'))) <> 2 then
    problems := array_append(problems, 'audit log / edit history policies to replace are missing');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_set_updated_at') then
    problems := array_append(problems, 'profiles_set_updated_at trigger missing');
  end if;
  for fn in select jsonb_object_keys(expected) loop
    if to_regprocedure(fn) is null then
      problems := array_append(problems, ('missing function ' || fn));
    elsif (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(fn)) <> expected ->> fn then
      problems := array_append(problems, ('function differs from the repository: ' || fn));
    end if;
  end loop;
  if cardinality(problems) > 0 then
    raise exception 'privacy repair preflight failed: %', array_to_string(problems, '; ');
  end if;
end;
$$;

-- What the postchecks compare against (dropped at COMMIT or ROLLBACK).
create temp table privacy_repair_invisible on commit drop as
  select id, updated_at from public.profiles where status = 'invisible';
create temp table privacy_repair_counts on commit drop as
  select (select count(*) from public.profiles) as profiles, (select count(*) from public.audit_logs) as audit_logs;

-- ===================== 20261109000000_privacy_hardening.sql =====================
-- =====================================================================================
-- Privacy hardening: three leaks found in a security review.
--
-- 1) Invisible was public. profiles.status is readable by every signed-in user, so anyone could
--    list who chose Invisible. The choice now lives in the owner-only privacy_settings row
--    (privacy_settings.invisible). Setting profiles.status to 'invisible' still works (every
--    client write keeps working): a trigger records the choice privately and leaves the public
--    column on its previous value, so others see nothing change. A check constraint keeps
--    'invisible' out of profiles for good. The app reads its own real status from both.
--    Realtime: a restrictive policy stops an invisible user from publishing presence on any
--    topic (realtime.messages.extension = 'presence'), so a stale or buggy client can't announce
--    them online either.
--
-- 2) Private voice channels were announced server-wide. Occupancy of a private voice channel moves
--    to its own Realtime topic `voice:<channel id>`, authorised by can_view_channel, so only people
--    let into the channel see who is in it. (The client stops putting private channel ids on the
--    server-wide `server:<id>` presence.)
--
-- 3) The audit log leaked private channels. Channel and message audit rows carry channel names and
--    200-character message excerpts. Every row is now tagged with the channel it is about
--    (audit_logs.channel_id, plus channel_private: whether that channel was private when logged)
--    and moderators only read a channel's rows if they can view that channel. Admins see
--    everything; server-level and member entries (bans, timeouts, warnings, joins) are unchanged.
--    Existing rows are tagged too; rows about channels that no longer exist are treated as private
--    (we can't tell any more), so only admins see those.
--
-- 4) Edit history leaked private channels. Moderators could read every earlier version of messages
--    in private channels they can't open. They now only read edits of messages they can see.
--
-- Also: friends_activity and heartbeat_device read the private invisible flag (a stale tab can't
-- make an invisible user look around, and learns the real status within one heartbeat); choosing
-- Invisible no longer touches the public profile row at all (not even updated_at); and
-- can_read_audit_channel answers only for the server's moderators.
--
-- Deploy order: deploy the app first, then apply this migration.
-- Rollback SQL is at the bottom.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1) Invisible is private
-- -------------------------------------------------------------------------------------
alter table public.privacy_settings add column invisible boolean not null default false;

insert into public.privacy_settings (user_id, invisible)
select p.id, true from public.profiles p where p.status = 'invisible'
on conflict (user_id) do update set invisible = true, updated_at = now();

-- Without this, every moved row would share one updated_at (the transaction time): a public
-- fingerprint of exactly who was invisible at deploy.
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles set status = 'online' where status = 'invisible';
alter table public.profiles enable trigger profiles_set_updated_at;

alter table public.profiles add constraint profiles_status_not_invisible check (status <> 'invisible');

/** Choosing Invisible is stored privately; the public status keeps its last visible value. */
create or replace function public.profiles_hide_invisible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'invisible' then
    insert into public.privacy_settings (user_id, invisible) values (new.id, true)
    on conflict (user_id) do update set invisible = true, updated_at = now();
    new.status := old.status;
    -- Nothing public changed: skip the write so updated_at (and any change feed) doesn't give it away.
    if new is not distinct from old then
      return null;
    end if;
  else
    update public.privacy_settings set invisible = false, updated_at = now()
    where user_id = new.id and invisible;
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_hide_invisible() from public, anon, authenticated;

create trigger profiles_hide_invisible
  before update of status on public.profiles
  for each row execute function public.profiles_hide_invisible();

-- Realtime only checks this when a client joins a topic (and on token refresh); the client also
-- stops tracking the moment you go invisible.
create policy "invisible users publish no presence"
  on realtime.messages as restrictive for insert to authenticated
  with check (
    extension <> 'presence'
    or not coalesce((select ps.invisible from public.privacy_settings ps where ps.user_id = (select auth.uid())), false)
  );

-- Latest friends_activity (20261108000000_hangouts.sql) + the private invisible flag: a stale tab
-- still reporting "online" must not make an invisible friend look around.
create or replace function public.friends_activity()
returns table (user_id uuid, status public.presence_status, voice_server_id uuid, voice_channel_id uuid, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  friends as (
    select case when f.user_low = me.id then f.user_high else f.user_low end as id
    from public.friendships f, me
    where f.status = 'accepted' and (f.user_low = me.id or f.user_high = me.id)
  ),
  latest as (
    select distinct on (d.user_id) d.user_id, d.status, d.voice_channel_id, d.last_seen_at
    from public.user_devices d
    join friends fr on fr.id = d.user_id
    where d.last_seen_at > now() - interval '2 minutes'
    order by d.user_id, (d.voice_channel_id is not null) desc, d.last_seen_at desc
  )
  select l.user_id, l.status,
    case when l.voice_channel_id is not null and public.can_view_channel(l.voice_channel_id) then public.channel_server_id(l.voice_channel_id) end,
    case when l.voice_channel_id is not null and public.can_view_channel(l.voice_channel_id) then l.voice_channel_id end,
    l.last_seen_at
  from latest l, me
  where l.status <> 'invisible'
    and not coalesce((select ps.invisible from public.privacy_settings ps where ps.user_id = l.user_id), false)
    and not public.is_blocked_between(me.id, l.user_id)
    and coalesce((select ps.share_activity from public.privacy_settings ps where ps.user_id = l.user_id), true)
    and public.mfa_ok() and not public.is_platform_banned();
$$;
revoke all on function public.friends_activity() from public, anon;
grant execute on function public.friends_activity() to authenticated;

/**
 * Latest heartbeat_device (20261006000000_admin_control_center.sql) + my real status: whether I'm
 * invisible (and when that last changed) and my public status, so a stale tab adopts a choice made
 * in another tab within one beat and stops publishing presence.
 */
create or replace function public.heartbeat_device(
  p_device_id uuid,
  p_fingerprint text,
  p_label text,
  p_status public.presence_status,
  p_custom_status text default null,
  p_voice_channel_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ctl record;
  priv record;
  issued timestamptz;
  voice uuid := p_voice_channel_id;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select c.banned_until, c.ban_reason, c.sessions_revoked_at, c.status_override, c.status_override_at
  into ctl from public.account_controls c where c.user_id = me;
  begin
    issued := to_timestamp(nullif((select auth.jwt()) ->> 'iat', '')::double precision);
  exception when others then
    issued := null;
  end;

  if ctl.banned_until is not null and ctl.banned_until > now() then
    return jsonb_build_object('signOut', true, 'reason', 'banned', 'bannedUntil', ctl.banned_until, 'banReason', ctl.ban_reason);
  end if;
  if ctl.sessions_revoked_at is not null and issued is not null and issued < ctl.sessions_revoked_at then
    return jsonb_build_object('signOut', true, 'reason', 'revoked');
  end if;

  -- Only channels I can actually see count as my voice channel.
  if voice is not null and not public.is_server_member(public.channel_server_id(voice)) then
    voice := null;
  end if;

  insert into public.user_devices (user_id, device_id, fingerprint, label, status, custom_status, voice_channel_id)
  values (me, p_device_id, lower(p_fingerprint), left(coalesce(p_label, ''), 80), p_status, left(p_custom_status, 64), voice)
  on conflict (user_id, device_id) do update
    set fingerprint = excluded.fingerprint,
        label = excluded.label,
        status = excluded.status,
        custom_status = excluded.custom_status,
        voice_channel_id = excluded.voice_channel_id,
        last_seen_at = now();

  select coalesce(ps.invisible, false) as invisible, ps.updated_at, p.status
  into priv
  from public.profiles p left join public.privacy_settings ps on ps.user_id = p.id
  where p.id = me;

  return jsonb_build_object('signOut', false, 'statusOverride', ctl.status_override, 'statusOverrideAt', ctl.status_override_at,
    'invisible', coalesce(priv.invisible, false), 'invisibleAt', priv.updated_at, 'status', priv.status);
end;
$$;
revoke all on function public.heartbeat_device(uuid, text, text, public.presence_status, text, uuid) from public, anon;
grant execute on function public.heartbeat_device(uuid, text, text, public.presence_status, text, uuid) to authenticated;

-- Edit history of a message follows the message: moderators only read edits of messages they can
-- see (messages' own RLS applies can_view_channel), so a private channel's old versions stay in it.
drop policy "authors and moderators read edit history" on public.message_edits;
create policy "authors and moderators read edit history"
  on public.message_edits for select to authenticated
  using (
    author_id = (select auth.uid())
    or (public.has_server_role(server_id, 'moderator')
      and exists (select 1 from public.messages m where m.id = message_edits.message_id))
  );

-- -------------------------------------------------------------------------------------
-- 2) Private voice occupancy on `voice:<channel id>` (latest definition + the voice case)
-- -------------------------------------------------------------------------------------
create or replace function public.can_access_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := split_part(p_topic, ':', 1);
  target uuid;
begin
  if kind = 'db' then
    kind := split_part(p_topic, ':', 2);
    target := public.try_uuid(split_part(p_topic, ':', 3));
    if target is null then
      return false;
    end if;
    return case kind
      when 'chat' then public.can_view_channel(target)
      when 'server' then public.is_server_member(target)
      when 'lfg' then public.is_server_member(target)
      when 'dm' then public.is_dm_participant(target)
      when 'memberships' then target = (select auth.uid())
      when 'friends' then target = (select auth.uid())
      when 'dms' then target = (select auth.uid())
      when 'mentions' then target = (select auth.uid())
      when 'rings' then target = (select auth.uid())
      when 'account' then target = (select auth.uid())
      when 'broadcasts' then target = public.system_server_id() and public.is_server_member(target)
      when 'admin' then target = (select auth.uid()) and public.is_super_admin()
      when 'join-requests' then public.has_server_role(target, 'moderator')
      else false
    end;
  end if;

  target := public.try_uuid(split_part(p_topic, ':', 2));
  if target is null then
    return false;
  end if;
  if kind = 'server' then
    return public.is_server_member(target);
  elsif kind = 'channel' or kind = 'voice' then
    return public.can_view_channel(target);
  elsif kind = 'dm' then
    return public.is_dm_participant(target);
  end if;
  return false;
end;
$$;

-- -------------------------------------------------------------------------------------
-- 3) Audit rows about a private channel follow the channel's access
-- -------------------------------------------------------------------------------------
alter table public.audit_logs
  add column channel_id uuid,
  add column channel_private boolean not null default false;

/** Tags untagged (pre-migration) audit rows; unknown (deleted) channels count as private. Idempotent. */
create or replace function public.audit_logs_backfill_channels()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.audit_logs a
  set channel_id = x.channel_id,
      channel_private = coalesce((select c.is_private from public.channels c where c.id = x.channel_id), true)
  from (
    select l.id, case when l.target_type = 'channel' then l.target_id else public.try_uuid(l.metadata ->> 'channel_id') end as channel_id
    from public.audit_logs l
    where l.channel_id is null
  ) x
  where x.id = a.id and x.channel_id is not null;
$$;
revoke all on function public.audit_logs_backfill_channels() from public, anon, authenticated;

select public.audit_logs_backfill_channels();

/** Tags every new audit row with the channel it is about (callers can't choose these columns). */
create or replace function public.audit_logs_tag_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.channel_id := case when new.target_type = 'channel' then new.target_id else public.try_uuid(new.metadata ->> 'channel_id') end;
  -- A deleted channel is gone by now; channels_audit passes its privacy along in the metadata.
  new.channel_private := new.channel_id is not null and coalesce(
    (select c.is_private from public.channels c where c.id = new.channel_id),
    (new.metadata ->> 'private')::boolean,
    false);
  return new;
end;
$$;
revoke all on function public.audit_logs_tag_channel() from public, anon, authenticated;

create trigger audit_logs_tag_channel
  before insert on public.audit_logs
  for each row execute function public.audit_logs_tag_channel();

/**
 * Can I read an audit row about this channel? Only the server's moderators ever get true. Admins:
 * always. Moderators: if they can view it. Says nothing about channels in other servers.
 */
create or replace function public.can_read_audit_channel(p_server_id uuid, p_channel_id uuid, p_private boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_server_role(p_server_id, 'moderator') and (
    p_channel_id is null
    or public.has_server_role(p_server_id, 'admin')
    or coalesce((select public.can_view_channel(c.id) from public.channels c where c.id = p_channel_id and c.server_id = p_server_id), not p_private));
$$;
revoke all on function public.can_read_audit_channel(uuid, uuid, boolean) from public, anon;
grant execute on function public.can_read_audit_channel(uuid, uuid, boolean) to authenticated;

drop policy "moderators read the audit log" on public.audit_logs;
create policy "moderators read the audit log"
  on public.audit_logs for select to authenticated
  using (public.has_server_role(server_id, 'moderator') and public.can_read_audit_channel(server_id, channel_id, channel_private));

-- Latest channels_audit (20260927000000_community.sql) + the deleted channel's privacy.
create or replace function public.channels_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit(new.server_id, 'channel.create', 'channel', new.id,
      jsonb_build_object('name', new.name, 'type', new.type));
  elsif tg_op = 'DELETE' then
    perform public.log_audit(old.server_id, 'channel.delete', 'channel', old.id,
      jsonb_build_object('name', old.name, 'type', old.type, 'private', old.is_private));
  else
    changed := array_remove(array[
      case when new.name is distinct from old.name then 'name' end,
      case when new.topic is distinct from old.topic then 'topic' end,
      case when new.category is distinct from old.category then 'category' end,
      case when new.slowmode_seconds is distinct from old.slowmode_seconds then 'slowmode_seconds' end,
      case when new.requires_verification is distinct from old.requires_verification then 'requires_verification' end
    ], null);
    if cardinality(changed) > 0 then
      perform public.log_audit(new.server_id, 'channel.update', 'channel', new.id,
        jsonb_build_object('name', new.name, 'changed', to_jsonb(changed),
          'slowmode_seconds', new.slowmode_seconds, 'requires_verification', new.requires_verification));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- =====================================================================================
-- ROLLBACK (run by hand, in this order):
--
-- drop policy "moderators read the audit log" on public.audit_logs;
-- create policy "moderators read the audit log" on public.audit_logs for select to authenticated
--   using (public.has_server_role(server_id, 'moderator'));
-- drop trigger audit_logs_tag_channel on public.audit_logs;
-- drop function public.audit_logs_tag_channel();
-- drop function public.can_read_audit_channel(uuid, uuid, boolean);
-- drop function public.audit_logs_backfill_channels();
-- alter table public.audit_logs drop column channel_id, drop column channel_private;
-- drop policy "authors and moderators read edit history" on public.message_edits;
-- create policy "authors and moderators read edit history" on public.message_edits for select to authenticated
--   using (author_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));
-- -- heartbeat_device: re-run its definition from 20261006000000_admin_control_center.sql (the only
-- -- change here is the extra invisible/invisibleAt/status keys in the reply, harmless to keep).
-- -- friends_activity: re-run its definition from 20261108000000_hangouts.sql.
-- -- (Both read privacy_settings.invisible: re-run them before dropping that column below.)
-- -- channels_audit: re-run its definition from 20260927000000_community.sql (the only change
-- -- here is the extra 'private' key on channel.delete metadata, harmless to keep).
-- -- can_access_realtime_topic: re-run its definition from 20261108010000_membership_screening.sql
-- -- (the only change here is the 'voice' kind; harmless to keep while old clients run).
-- drop policy "invisible users publish no presence" on realtime.messages;
-- drop trigger profiles_hide_invisible on public.profiles;
-- drop function public.profiles_hide_invisible();
-- alter table public.profiles drop constraint profiles_status_not_invisible;
-- alter table public.profiles disable trigger profiles_set_updated_at;
-- update public.profiles p set status = 'invisible'
--   from public.privacy_settings ps where ps.user_id = p.id and ps.invisible;
-- alter table public.profiles enable trigger profiles_set_updated_at;
-- alter table public.privacy_settings drop column invisible;
-- =====================================================================================

-- ===================== 20261109020000_avatar_listing.sql =====================
-- Avatar listing: stop anyone from enumerating the avatars bucket.
--
-- The old SELECT policy "avatar images are publicly readable" had no role and no path check, so the
-- anon key could call storage.from('avatars').list('servers/') (or list the root) and read every
-- server id (private servers included), every user id, file names, sizes and timestamps.
--
-- The bucket is public, so images are served from /storage/v1/object/public/avatars/... without
-- touching storage.objects RLS: avatars, banners and server icons keep loading for everyone. Storage
-- still needs SELECT on the rows it inserts or deletes (upload and remove() use RETURNING), so the
-- new policy keeps exactly the uploaders who may write: a user in their own `<uid>/` folder and a
-- server admin (or owner) in `servers/<server>/`. That matches the existing insert/update/delete
-- scope, so profile uploads, server icon uploads and account deletion's remove() still work.
-- The restrictive "two-factor sessions only (storage)" policy is untouched and still applies.

drop policy if exists "avatar images are publicly readable" on storage.objects;

create policy "uploaders see their own avatar folders"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or ((storage.foldername(name))[1] = 'servers'
          and public.has_server_role(public.try_uuid((storage.foldername(name))[2]), 'admin'))
    )
  );

-- Rollback (restores public listing; run by hand only if the new policy breaks uploads):
--   drop policy if exists "uploaders see their own avatar folders" on storage.objects;
--   create policy "avatar images are publicly readable"
--     on storage.objects for select
--     using (bucket_id = 'avatars');

-- ===================== postchecks =====================
do $$
begin
  if exists (select 1 from public.profiles where status = 'invisible') then
    raise exception 'privacy repair: a profile is still publicly invisible';
  end if;
  if exists (select 1 from privacy_repair_invisible b left join public.privacy_settings ps on ps.user_id = b.id
      where not coalesce(ps.invisible, false)) then
    raise exception 'privacy repair: an Invisible choice was not kept privately';
  end if;
  if exists (select 1 from privacy_repair_invisible b join public.profiles p on p.id = b.id
      where p.updated_at is distinct from b.updated_at) then
    raise exception 'privacy repair: a moved profile''s updated_at changed';
  end if;
  if (select profiles from privacy_repair_counts) <> (select count(*) from public.profiles)
      or (select audit_logs from privacy_repair_counts) <> (select count(*) from public.audit_logs) then
    raise exception 'privacy repair: row counts changed';
  end if;
  if exists (select 1 from public.audit_logs where channel_id is null
      and (target_type = 'channel' or public.try_uuid(metadata ->> 'channel_id') is not null)) then
    raise exception 'privacy repair: audit rows about a channel were left untagged';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatar images are publicly readable') then
    raise exception 'privacy repair: public avatar listing policy still present';
  end if;
  if (select count(*) from pg_policies where (schemaname, tablename, policyname) in (
      ('realtime', 'messages', 'invisible users publish no presence'),
      ('storage', 'objects', 'uploaders see their own avatar folders'),
      ('public', 'audit_logs', 'moderators read the audit log'),
      ('public', 'message_edits', 'authors and moderators read edit history'))) <> 4
    or (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
      and tgname in ('profiles_hide_invisible', 'audit_logs_tag_channel', 'profiles_set_updated_at')) <> 3 then
    raise exception 'privacy repair: expected policies or triggers missing';
  end if;
end;
$$;

commit;
