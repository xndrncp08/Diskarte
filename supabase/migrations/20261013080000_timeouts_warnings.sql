-- =====================================================================================
-- Timeouts and warnings (Discord's moderation tools).
--   Timeout: for a set time the member can read but not send, react or join voice. Admins and
--   the owner can't be timed out; moderators only time out members below them.
--   Warning: a moderator's note to a member, shown to them once; moderators see the history.
-- =====================================================================================

alter table public.members add column timeout_until timestamptz;

/** Is this person timed out in this server right now? */
create or replace function public.member_timed_out(p_server uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.server_id = p_server and m.user_id = p_user and m.timeout_until > now()
  );
$$;
revoke execute on function public.member_timed_out(uuid, uuid) from public, anon;
grant execute on function public.member_timed_out(uuid, uuid) to authenticated;

-- Only timeout_member()/remove_timeout() (running as the owner) may change it, so nobody can
-- clear their own timeout with a direct update.
create or replace function public.members_timeout_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timeout_until is distinct from old.timeout_until and current_user in ('authenticated', 'anon') then
    raise exception 'USE_TIMEOUT_RPC' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger members_timeout_guard
  before update on public.members
  for each row execute function public.members_timeout_guard();

-- Sending and reacting are blocked while timed out. Triggers (not policies) so RPC paths such as
-- create_poll() are covered too. Triggers fire in name order: this one runs after
-- messages_before_insert fills server_id and before AutoMod (which may silently drop the row).
create or replace function public.timeout_send_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := (to_jsonb(new) ->> tg_argv[0])::uuid; -- the author column, named by the trigger
  until timestamptz;
begin
  select m.timeout_until into until from public.members m where m.server_id = new.server_id and m.user_id = who;
  if until > now() then
    raise exception 'TIMED_OUT' using errcode = '42501', detail = until::text;
  end if;
  return new;
end;
$$;
create trigger messages_before_insert_a_timeout
  before insert on public.messages
  for each row execute function public.timeout_send_guard('author_id');
create trigger reactions_timeout_guard
  before insert on public.reactions
  for each row execute function public.timeout_send_guard('user_id');

/** Time someone out for 1, 5, 10, 60 minutes, a day or a week. */
create or replace function public.timeout_member(p_server uuid, p_user uuid, p_minutes integer, p_reason text default '')
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.member_role := public.server_role(p_server);
  target public.member_role;
  owner uuid;
  until timestamptz;
begin
  select m.role into target from public.members m where m.server_id = p_server and m.user_id = p_user;
  select s.owner_id into owner from public.servers s where s.id = p_server;
  if caller is null or caller_role is null or caller_role < 'moderator' or target is null
     or p_user = caller or p_user = owner or target = 'admin'
     or (target >= caller_role and caller <> owner) then
    raise exception 'CANNOT_TIMEOUT_MEMBER' using errcode = '42501';
  end if;
  if p_minutes not in (1, 5, 10, 60, 1440, 10080) then
    raise exception 'INVALID_TIMEOUT' using errcode = '22023';
  end if;
  until := now() + make_interval(mins => p_minutes);
  update public.members set timeout_until = until where server_id = p_server and user_id = p_user;
  perform public.log_audit(p_server, 'member.timeout', 'member', p_user,
    jsonb_build_object('minutes', p_minutes, 'reason', left(btrim(coalesce(p_reason, '')), 200)));
  return until;
end;
$$;

create or replace function public.remove_timeout(p_server uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.member_role := public.server_role(p_server);
  target public.member_role;
  owner uuid;
begin
  select m.role into target from public.members m where m.server_id = p_server and m.user_id = p_user;
  select s.owner_id into owner from public.servers s where s.id = p_server;
  if caller is null or caller_role is null or caller_role < 'moderator' or target is null
     or (target >= caller_role and caller <> owner) then
    raise exception 'CANNOT_TIMEOUT_MEMBER' using errcode = '42501';
  end if;
  update public.members set timeout_until = null where server_id = p_server and user_id = p_user;
  perform public.log_audit(p_server, 'member.timeout_remove', 'member', p_user);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Warnings
-- -------------------------------------------------------------------------------------
create table public.member_warnings (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  moderator_id uuid references public.profiles (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index member_warnings_lookup_idx on public.member_warnings (server_id, user_id, created_at desc);
create index member_warnings_user_idx on public.member_warnings (user_id);
create index member_warnings_moderator_idx on public.member_warnings (moderator_id);

alter table public.member_warnings enable row level security;
revoke all on table public.member_warnings from anon, authenticated;
grant select on table public.member_warnings to authenticated;

create policy "the warned member and moderators read warnings"
  on public.member_warnings for select to authenticated
  using (user_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

/** Warn a member below you; they see it the next time they're in the server. */
create or replace function public.warn_member(p_server uuid, p_user uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.member_role := public.server_role(p_server);
  target public.member_role;
  owner uuid;
  new_id uuid;
begin
  select m.role into target from public.members m where m.server_id = p_server and m.user_id = p_user;
  select s.owner_id into owner from public.servers s where s.id = p_server;
  if caller is null or caller_role is null or caller_role < 'moderator' or target is null
     or p_user = caller or p_user = owner or (target >= caller_role and caller <> owner) then
    raise exception 'CANNOT_WARN_MEMBER' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then
    raise exception 'INVALID_WARNING' using errcode = '22023';
  end if;
  insert into public.member_warnings (server_id, user_id, moderator_id, reason)
  values (p_server, p_user, caller, btrim(p_reason))
  returning id into new_id;
  perform public.log_audit(p_server, 'member.warn', 'member', p_user, jsonb_build_object('reason', btrim(p_reason)));
  return new_id;
end;
$$;

/** "Got it": the warned member dismisses their own warnings in a server. */
create or replace function public.acknowledge_warnings(p_server uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.member_warnings set acknowledged_at = now()
  where server_id = p_server and user_id = (select auth.uid()) and acknowledged_at is null;
$$;

revoke execute on function public.timeout_member(uuid, uuid, integer, text), public.remove_timeout(uuid, uuid),
  public.warn_member(uuid, uuid, text), public.acknowledge_warnings(uuid) from public, anon;
grant execute on function public.timeout_member(uuid, uuid, integer, text), public.remove_timeout(uuid, uuid),
  public.warn_member(uuid, uuid, text), public.acknowledge_warnings(uuid) to authenticated;

-- The warned member gets it live (RLS limits each subscriber to rows they can read).
alter publication supabase_realtime add table public.member_warnings;
