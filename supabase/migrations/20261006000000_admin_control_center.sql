-- =====================================================================================
-- Diskarte — Super Admin Control Center (replaces the Early Access waitlist)
--
--   * platform_admins is recycled as the platform role table: `super_admin` or `moderator`
--     (no row = standard member). Super admins run the Control Center; both roles are mirrored
--     into Diskarte HQ (admin / moderator), so super admins post in #announcements and moderators
--     moderate #global-lounge with the regular server tools.
--   * waitlist_applications is archived into admin_audit_logs, then dropped with its functions.
--   * admin_audit_logs: every Control Center action, readable by super admins only.
--   * system_broadcasts: announcements dispatched to HQ's #announcements / #global-lounge, with an
--     optional sticky banner shown on every signed-in canvas. Everyone reads; only RPCs write.
--   * account_controls: platform bans, session revocations and forced status overrides per user.
--   * user_devices: each signed-in browser's heartbeat (status, voice channel, device fingerprint,
--     last active) for the presence inspector.
-- Every write goes through SECURITY DEFINER RPCs that verify `is_super_admin()` themselves.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Platform roles (recycled platform_admins)
-- -------------------------------------------------------------------------------------
alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins add constraint platform_admins_role_check check (role in ('super_admin', 'moderator'));
alter table public.platform_admins add column if not exists granted_by uuid references auth.users (id) on delete set null;

/** The caller's platform role: 'super_admin', 'moderator' or 'member'. */
create or replace function public.platform_role(p_user uuid default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.role from public.platform_admins a where a.user_id = coalesce(p_user, (select auth.uid()))),
    'member'
  );
$$;

revoke execute on function public.platform_role(uuid) from public, anon, authenticated;

/** My own platform role (clients may only ask about themselves). */
create or replace function public.my_platform_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select public.platform_role((select auth.uid())) $$;

revoke execute on function public.my_platform_role() from public, anon;
grant execute on function public.my_platform_role() to authenticated;

/** The HQ role someone should hold: super admins and creators are admins, moderators moderators. */
create or replace function public.hq_role_for(p_user uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.system_creators c where c.user_id = p_user) then 'admin'::public.member_role
    when public.platform_role(p_user) = 'super_admin' then 'admin'::public.member_role
    when public.platform_role(p_user) = 'moderator' then 'moderator'::public.member_role
    else 'member'::public.member_role
  end;
$$;

revoke execute on function public.hq_role_for(uuid) from public, anon, authenticated;

/** Mirrors a platform role change into HQ. Runs as a trigger, so the RBAC guard on members skips it. */
create or replace function public.platform_admins_sync_hq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
begin
  if tg_op = 'DELETE' then
    -- Also runs while an account is being deleted: only touch a membership that still exists.
    update public.members set role = public.hq_role_for(target) where server_id = public.system_server_id() and user_id = target;
    return old;
  end if;
  if exists (select 1 from public.profiles p where p.id = target)
     and exists (select 1 from public.servers s where s.id = public.system_server_id()) then
    insert into public.members (server_id, user_id, role)
    values (public.system_server_id(), target, public.hq_role_for(target))
    on conflict (server_id, user_id) do update set role = excluded.role;
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.platform_admins_sync_hq() from public, anon, authenticated;

create trigger platform_admins_sync_hq
  after insert or update or delete on public.platform_admins
  for each row execute function public.platform_admins_sync_hq();

-- New accounts and creator changes now respect platform roles too.
create or replace function public.profiles_join_system_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (server_id, user_id, role)
  select public.system_server_id(), new.id, public.hq_role_for(new.id)
  where exists (select 1 from public.servers s where s.id = public.system_server_id())
  on conflict (server_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.system_creators_sync_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
begin
  insert into public.members (server_id, user_id, role)
  select public.system_server_id(), target, public.hq_role_for(target)
  where exists (select 1 from public.profiles p where p.id = target)
  on conflict (server_id, user_id) do update set role = excluded.role;
  return coalesce(new, old);
end;
$$;

-- Existing super admins (granted for the old review queue) become HQ admins.
insert into public.members (server_id, user_id, role)
select public.system_server_id(), a.user_id, public.hq_role_for(a.user_id)
from public.platform_admins a
where exists (select 1 from public.profiles p where p.id = a.user_id)
  and exists (select 1 from public.servers s where s.id = public.system_server_id())
on conflict (server_id, user_id) do update set role = excluded.role;

-- -------------------------------------------------------------------------------------
-- Audit log
-- -------------------------------------------------------------------------------------
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$' and char_length(action) <= 64),
  target_user_id uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_user_id, created_at desc) where target_user_id is not null;

alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from anon, authenticated;
grant select on table public.admin_audit_logs to authenticated;

create policy "super admins read the admin audit log"
  on public.admin_audit_logs for select to authenticated
  using (public.is_super_admin());

create or replace function public.admin_log(p_action text, p_target uuid default null, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_logs (actor_id, action, target_user_id, details)
  values ((select auth.uid()), p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;

revoke execute on function public.admin_log(text, uuid, jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- Retire the waitlist: archive every application into the audit log, then drop it.
-- -------------------------------------------------------------------------------------
insert into public.admin_audit_logs (actor_id, action, target_user_id, details, created_at)
select w.reviewed_by, 'waitlist.archived', w.approved_user_id,
       jsonb_build_object(
         'full_name', w.full_name,
         'email', w.email,
         'status', w.status::text,
         'community_type', w.community_type,
         'community_name', w.community_name,
         'reviewed_at', w.reviewed_at,
         'applied_at', w.created_at
       ),
       coalesce(w.reviewed_at, w.created_at)
from public.waitlist_applications w;

drop function if exists public.waitlist_stats();
drop table if exists public.waitlist_applications;
drop function if exists public.waitlist_before_insert();
drop function if exists public.waitlist_before_update();
drop type if exists public.waitlist_status;

-- -------------------------------------------------------------------------------------
-- Account controls: bans, revoked sessions, status overrides
-- -------------------------------------------------------------------------------------
create table public.account_controls (
  user_id uuid primary key references auth.users (id) on delete cascade,
  banned_until timestamptz,
  ban_reason text check (ban_reason is null or char_length(ban_reason) <= 300),
  banned_by uuid references auth.users (id) on delete set null,
  sessions_revoked_at timestamptz,
  status_override jsonb check (status_override is null or jsonb_typeof(status_override) = 'object'),
  status_override_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_controls enable row level security;
revoke all on table public.account_controls from anon, authenticated;
grant select on table public.account_controls to authenticated;

create policy "people see their own account controls; super admins see all"
  on public.account_controls for select to authenticated
  using (user_id = (select auth.uid()) or public.is_super_admin());

/** Whether someone is banned from the platform right now. */
create or replace function public.is_platform_banned(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_controls c
    where c.user_id = coalesce(p_user, (select auth.uid())) and c.banned_until is not null and c.banned_until > now()
  );
$$;

revoke execute on function public.is_platform_banned(uuid) from public, anon;
grant execute on function public.is_platform_banned(uuid) to authenticated;

-- Banned accounts can't post anywhere, even with an access token that hasn't expired yet.
create policy "banned accounts cannot post messages"
  on public.messages as restrictive for insert to authenticated
  with check (not public.is_platform_banned());

create policy "banned accounts cannot send direct messages"
  on public.direct_messages as restrictive for insert to authenticated
  with check (not public.is_platform_banned());

-- -------------------------------------------------------------------------------------
-- Device heartbeats (presence inspector)
-- -------------------------------------------------------------------------------------
create table public.user_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{16,64}$'),
  label text not null default '' check (char_length(label) <= 80),
  status public.presence_status not null default 'online',
  custom_status text check (custom_status is null or char_length(custom_status) <= 64),
  voice_channel_id uuid references public.channels (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index user_devices_last_seen_idx on public.user_devices (last_seen_at desc);

alter table public.user_devices enable row level security;
revoke all on table public.user_devices from anon, authenticated;
grant select on table public.user_devices to authenticated;

create policy "people see their own devices; super admins see all"
  on public.user_devices for select to authenticated
  using (user_id = (select auth.uid()) or public.is_super_admin());

/**
 * One browser's heartbeat: records its status, voice channel and fingerprint, and tells it whether
 * its session has been revoked or the account banned (so open canvases sign out promptly, not only
 * when the access token next refreshes).
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

  return jsonb_build_object('signOut', false, 'statusOverride', ctl.status_override, 'statusOverrideAt', ctl.status_override_at);
end;
$$;

revoke execute on function public.heartbeat_device(uuid, text, text, public.presence_status, text, uuid) from public, anon;
grant execute on function public.heartbeat_device(uuid, text, text, public.presence_status, text, uuid) to authenticated;

/** Signing out of a browser forgets it. */
create or replace function public.forget_device(p_device_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.user_devices where user_id = (select auth.uid()) and device_id = p_device_id $$;

revoke execute on function public.forget_device(uuid) from public, anon;
grant execute on function public.forget_device(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- System broadcasts
-- -------------------------------------------------------------------------------------
create table public.system_broadcasts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 3500),
  tone text not null default 'info' check (tone in ('info', 'success', 'warning', 'critical')),
  targets text[] not null check (cardinality(targets) between 1 and 2 and targets <@ array['announcements', 'global-lounge']::text[]),
  message_ids uuid[] not null default '{}',
  sticky boolean not null default false,
  sticky_until timestamptz,
  retracted_at timestamptz,
  created_at timestamptz not null default now()
);

create index system_broadcasts_created_idx on public.system_broadcasts (created_at desc);

alter table public.system_broadcasts enable row level security;
revoke all on table public.system_broadcasts from anon, authenticated;
grant select on table public.system_broadcasts to authenticated;

create policy "everyone signed in reads broadcasts"
  on public.system_broadcasts for select to authenticated
  using (true);

-- -------------------------------------------------------------------------------------
-- Control Center RPCs (super admins only)
-- -------------------------------------------------------------------------------------
create or replace function public.assert_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_super_admin() from public, anon, authenticated;

/** Headline numbers plus sign-ups per day for the last week (Asia/Manila days). */
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_super_admin();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'online', (select count(distinct d.user_id) from public.user_devices d where d.last_seen_at > now() - interval '2 minutes'),
    'in_voice', (select count(distinct d.user_id) from public.user_devices d where d.last_seen_at > now() - interval '2 minutes' and d.voice_channel_id is not null),
    'banned', (select count(*) from public.account_controls c where c.banned_until > now()),
    'super_admins', (select count(*) from public.platform_admins a where a.role = 'super_admin'),
    'moderators', (select count(*) from public.platform_admins a where a.role = 'moderator'),
    'broadcasts', (select count(*) from public.system_broadcasts),
    'last7', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day::date, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series((now() at time zone 'Asia/Manila')::date - 6, (now() at time zone 'Asia/Manila')::date, interval '1 day') as d(day)
      left join (
        select (p.created_at at time zone 'Asia/Manila')::date as day, count(*) as n
        from public.profiles p
        where p.created_at > now() - interval '8 days'
        group by 1
      ) c on c.day = d.day::date
    )
  );
end;
$$;

/** The network roster: every account with its role, ban state, sessions and devices. */
create or replace function public.admin_list_users(p_query text default null, p_limit integer default 500)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_preset text,
  avatar_url text,
  status public.presence_status,
  custom_status text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  role text,
  banned_until timestamptz,
  ban_reason text,
  sessions integer,
  last_seen_at timestamptz,
  devices jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public.assert_super_admin();
  return query
  select p.id, p.username, p.display_name, p.avatar_preset, p.avatar_url, p.status, p.custom_status,
         u.email::text, p.created_at, u.last_sign_in_at,
         public.platform_role(p.id),
         c.banned_until, c.ban_reason,
         (select count(*)::integer from auth.sessions s where s.user_id = p.id),
         (select max(d.last_seen_at) from public.user_devices d where d.user_id = p.id),
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'device_id', d.device_id, 'fingerprint', d.fingerprint, 'label', d.label, 'status', d.status,
             'custom_status', d.custom_status, 'voice_channel_id', d.voice_channel_id,
             'first_seen_at', d.first_seen_at, 'last_seen_at', d.last_seen_at
           ) order by d.last_seen_at desc)
           from public.user_devices d where d.user_id = p.id
         ), '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.account_controls c on c.user_id = p.id
  where q is null
     or p.username ilike '%' || q || '%'
     or p.display_name ilike '%' || q || '%'
     or u.email ilike '%' || q || '%'
  order by (select max(d.last_seen_at) from public.user_devices d where d.user_id = p.id) desc nulls last, p.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
end;
$$;

/** Names for the voice channels behind live LiveKit rooms (super admins aren't members of every server). */
create or replace function public.admin_channel_labels(p_ids uuid[])
returns table (id uuid, name text, server_id uuid, server_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_super_admin();
  return query
  select c.id, c.name, s.id, s.name
  from public.channels c join public.servers s on s.id = c.server_id
  where c.id = any (coalesce(p_ids, '{}'::uuid[]));
end;
$$;

/** Super Admin / Moderator / Standard Member. Nobody changes their own role (no self-lockout). */
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
begin
  perform public.assert_super_admin();
  if p_role not in ('super_admin', 'moderator', 'member') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = '22023';
  end if;
  previous := public.platform_role(p_user);
  if previous = p_role then
    return;
  end if;
  if p_role = 'member' then
    delete from public.platform_admins where user_id = p_user;
  else
    insert into public.platform_admins (user_id, role, note, granted_by)
    values (p_user, p_role, 'granted in the Control Center', (select auth.uid()))
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  end if;
  perform public.admin_log('user.role_update', p_user, jsonb_build_object('from', previous, 'to', p_role));
end;
$$;

/** Forces someone's status (e.g. clears an offensive custom status); their open canvases adopt it. */
create or replace function public.admin_set_status(p_user uuid, p_status public.presence_status, p_custom_status text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  custom text := nullif(btrim(coalesce(p_custom_status, '')), '');
begin
  perform public.assert_super_admin();
  if custom is not null and char_length(custom) > 64 then
    raise exception 'STATUS_TOO_LONG' using errcode = '22023';
  end if;
  update public.profiles set status = p_status, custom_status = custom, custom_status_emoji = null where id = p_user;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = '22023';
  end if;
  insert into public.account_controls (user_id, status_override, status_override_at, updated_at)
  values (p_user, jsonb_build_object('status', p_status, 'custom_status', custom), now(), now())
  on conflict (user_id) do update
    set status_override = excluded.status_override, status_override_at = now(), updated_at = now();
  perform public.admin_log('user.status_override', p_user, jsonb_build_object('status', p_status, 'custom_status', custom));
end;
$$;

/** Ends every session: refresh tokens die now, open canvases sign out on their next heartbeat. */
create or replace function public.revoke_sessions_internal(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended integer := 0;
begin
  insert into public.account_controls (user_id, sessions_revoked_at, updated_at)
  values (p_user, now(), now())
  on conflict (user_id) do update set sessions_revoked_at = now(), updated_at = now();
  delete from public.user_devices where user_id = p_user;
  begin
    delete from auth.sessions where user_id = p_user;
    get diagnostics ended = row_count;
  exception when insufficient_privilege or undefined_table then
    ended := 0; -- the account_controls stamp still signs every client out
  end;
  return ended;
end;
$$;

revoke execute on function public.revoke_sessions_internal(uuid) from public, anon, authenticated;

create or replace function public.admin_revoke_sessions(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended integer;
begin
  perform public.assert_super_admin();
  if p_user = (select auth.uid()) then
    raise exception 'CANNOT_REVOKE_OWN_SESSIONS' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = '22023';
  end if;
  ended := public.revoke_sessions_internal(p_user);
  perform public.admin_log('user.sessions_revoke', p_user, jsonb_build_object('sessions', ended));
  return ended;
end;
$$;

/** Temporary (1 hour – 1 year) or permanent (p_hours null) ban; never yourself or another super admin. */
create or replace function public.admin_ban_user(p_user uuid, p_hours integer default null, p_reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  until timestamptz;
begin
  perform public.assert_super_admin();
  if p_user = (select auth.uid()) then
    raise exception 'CANNOT_BAN_SELF' using errcode = '42501';
  end if;
  if public.platform_role(p_user) = 'super_admin' then
    raise exception 'CANNOT_BAN_SUPER_ADMIN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = '22023';
  end if;
  if p_hours is not null and (p_hours < 1 or p_hours > 8760) then
    raise exception 'INVALID_BAN_DURATION' using errcode = '22023';
  end if;
  if reason is not null and char_length(reason) > 300 then
    raise exception 'REASON_TOO_LONG' using errcode = '22023';
  end if;
  until := case when p_hours is null then 'infinity'::timestamptz else now() + make_interval(hours => p_hours) end;

  insert into public.account_controls (user_id, banned_until, ban_reason, banned_by, updated_at)
  values (p_user, until, reason, (select auth.uid()), now())
  on conflict (user_id) do update
    set banned_until = excluded.banned_until, ban_reason = excluded.ban_reason, banned_by = excluded.banned_by, updated_at = now();
  -- Supabase Auth refuses sign-in and token refresh while banned_until is in the future.
  begin
    update auth.users set banned_until = until where id = p_user;
  exception when insufficient_privilege or undefined_column then
    null; -- account_controls + revoked sessions still keep them out
  end;
  perform public.revoke_sessions_internal(p_user);
  perform public.admin_log('user.ban', p_user, jsonb_build_object('hours', p_hours, 'permanent', p_hours is null, 'reason', reason, 'until', until));
  return until;
end;
$$;

create or replace function public.admin_unban_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_super_admin();
  update public.account_controls set banned_until = null, ban_reason = null, banned_by = null, updated_at = now() where user_id = p_user;
  begin
    update auth.users set banned_until = null where id = p_user;
  exception when insufficient_privilege or undefined_column then
    null;
  end;
  perform public.admin_log('user.unban', p_user, '{}'::jsonb);
end;
$$;

/**
 * Posts an announcement to HQ's #announcements and/or #global-lounge as the calling super admin (an
 * HQ admin through the role mirror), records it, and optionally pins it as a sticky banner on every
 * signed-in canvas (indefinitely, or for p_sticky_hours).
 */
create or replace function public.admin_dispatch_broadcast(
  p_title text,
  p_body text,
  p_tone text default 'info',
  p_targets text[] default array['announcements']::text[],
  p_sticky boolean default false,
  p_sticky_hours integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  title text := btrim(coalesce(p_title, ''));
  body text := btrim(coalesce(p_body, ''));
  targets text[] := array(select distinct t from unnest(coalesce(p_targets, '{}'::text[])) t order by t);
  target text;
  channel uuid;
  posted uuid;
  ids uuid[] := '{}';
  broadcast uuid;
begin
  perform public.assert_super_admin();
  if char_length(title) not between 1 and 120 then
    raise exception 'INVALID_TITLE' using errcode = '22023';
  end if;
  if char_length(body) not between 1 and 3500 then
    raise exception 'INVALID_BODY' using errcode = '22023';
  end if;
  if p_tone not in ('info', 'success', 'warning', 'critical') then
    raise exception 'INVALID_TONE' using errcode = '22023';
  end if;
  if cardinality(targets) = 0 or not (targets <@ array['announcements', 'global-lounge']::text[]) then
    raise exception 'INVALID_TARGETS' using errcode = '22023';
  end if;
  if p_sticky_hours is not null and (p_sticky_hours < 1 or p_sticky_hours > 720) then
    raise exception 'INVALID_STICKY_DURATION' using errcode = '22023';
  end if;

  foreach target in array targets loop
    select c.id into channel from public.channels c where c.server_id = public.system_server_id() and c.name = target and c.type = 'text';
    if channel is null then
      raise exception 'CHANNEL_MISSING' using errcode = '22023', detail = target;
    end if;
    insert into public.messages (channel_id, server_id, author_id, content)
    values (channel, public.system_server_id(), (select auth.uid()), '## ' || title || E'\n\n' || body)
    returning id into posted;
    ids := ids || posted;
  end loop;

  insert into public.system_broadcasts (author_id, title, body, tone, targets, message_ids, sticky, sticky_until)
  values ((select auth.uid()), title, body, p_tone, targets, ids, coalesce(p_sticky, false),
          case when coalesce(p_sticky, false) and p_sticky_hours is not null then now() + make_interval(hours => p_sticky_hours) end)
  returning id into broadcast;

  perform public.admin_log('broadcast.dispatch', null,
    jsonb_build_object('broadcast_id', broadcast, 'title', title, 'tone', p_tone, 'targets', to_jsonb(targets), 'sticky', coalesce(p_sticky, false)));
  return broadcast;
end;
$$;

/** Takes a broadcast's sticky banner down (the channel messages stay, like any post). */
create or replace function public.admin_retract_broadcast(p_broadcast uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_super_admin();
  update public.system_broadcasts set retracted_at = now() where id = p_broadcast and retracted_at is null;
  if not found then
    raise exception 'BROADCAST_NOT_FOUND' using errcode = '22023';
  end if;
  perform public.admin_log('broadcast.retract', null, jsonb_build_object('broadcast_id', p_broadcast));
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_list_users(text, integer) from public, anon;
revoke execute on function public.admin_channel_labels(uuid[]) from public, anon;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
revoke execute on function public.admin_set_status(uuid, public.presence_status, text) from public, anon;
revoke execute on function public.admin_revoke_sessions(uuid) from public, anon;
revoke execute on function public.admin_ban_user(uuid, integer, text) from public, anon;
revoke execute on function public.admin_unban_user(uuid) from public, anon;
revoke execute on function public.admin_dispatch_broadcast(text, text, text, text[], boolean, integer) from public, anon;
revoke execute on function public.admin_retract_broadcast(uuid) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_users(text, integer) to authenticated;
grant execute on function public.admin_channel_labels(uuid[]) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_status(uuid, public.presence_status, text) to authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to authenticated;
grant execute on function public.admin_ban_user(uuid, integer, text) to authenticated;
grant execute on function public.admin_unban_user(uuid) to authenticated;
grant execute on function public.admin_dispatch_broadcast(text, text, text, text[], boolean, integer) to authenticated;
grant execute on function public.admin_retract_broadcast(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- Realtime
--   db:broadcasts:<HQ id>  — everyone in HQ (i.e. everyone): banner + new broadcasts
--   db:admin:<my id>       — super admins: device heartbeats, audit entries, account controls
--   db:account:<my id>     — my own bans / revocations / status overrides
-- -------------------------------------------------------------------------------------
alter publication supabase_realtime add table public.system_broadcasts, public.user_devices, public.admin_audit_logs, public.account_controls;

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
      when 'chat' then public.is_server_member(public.channel_server_id(target))
      when 'server' then public.is_server_member(target)
      when 'lfg' then public.is_server_member(target)
      when 'dm' then public.is_dm_participant(target)
      when 'memberships' then target = (select auth.uid())
      when 'friends' then target = (select auth.uid())
      when 'dms' then target = (select auth.uid())
      when 'rings' then target = (select auth.uid())
      when 'account' then target = (select auth.uid())
      when 'broadcasts' then target = public.system_server_id() and public.is_server_member(target)
      when 'admin' then target = (select auth.uid()) and public.is_super_admin()
      else false
    end;
  end if;

  target := public.try_uuid(split_part(p_topic, ':', 2));
  if target is null then
    return false;
  end if;
  if kind = 'server' then
    return public.is_server_member(target);
  elsif kind = 'channel' then
    return public.is_server_member(public.channel_server_id(target));
  elsif kind = 'dm' then
    return public.is_dm_participant(target);
  end if;
  return false;
end;
$$;
