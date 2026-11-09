-- =====================================================================================
-- Membership screening: joining questions and moderator approval.
--
-- Admins set up to 5 questions (`servers.join_questions`) and/or require approval
-- (`servers.join_approval`). While either is on, join_server refuses with SCREENING_REQUIRED and the
-- app shows the questions (join_screening) and submits them with request_to_join:
--   * questions only → the answers are kept and the person joins straight away;
--   * approval on    → a pending `join_requests` row that moderators approve or reject
--                      (decide_join_request), which is audit-logged.
-- Non-members never read `servers` directly: join_screening returns only what the join form needs,
-- for a live invite code or a server listed in Explore.
-- =====================================================================================

alter table public.servers
  add column join_questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(join_questions) = 'array' and jsonb_array_length(join_questions) <= 5),
  add column join_approval boolean not null default false;

create table public.join_requests (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  primary key (server_id, user_id)
);

create index join_requests_pending_idx on public.join_requests (server_id, created_at) where status = 'pending';
create index join_requests_user_idx on public.join_requests (user_id);

alter table public.join_requests enable row level security;
revoke all on table public.join_requests from anon, authenticated;
grant select on table public.join_requests to authenticated;

create policy "applicants and moderators see join requests"
  on public.join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

alter publication supabase_realtime add table public.join_requests;

/** Server (and the limited invite, if any) a join form refers to: a live invite code, or a public server. */
create or replace function public.resolve_join_target(p_code text, p_server uuid, out server_id uuid, out invite_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  invite public.server_invites;
begin
  if p_server is not null then
    select s.id into server_id from public.servers s where s.id = p_server and s.is_public and not s.is_system;
  else
    select s.id into server_id from public.servers s where s.invite_code = upper(btrim(p_code));
    if server_id is null then
      select * into invite from public.server_invites i where i.code = upper(btrim(p_code));
      if invite.code is not null and public.invite_is_live(invite) then
        server_id := invite.server_id;
        invite_code := invite.code;
      end if;
    end if;
  end if;
  if server_id is null then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.resolve_join_target(text, uuid) from public, anon, authenticated;

/** What the join form shows: the server's name, rules, questions, and whether approval is needed. */
create or replace function public.join_screening(p_code text default null, p_server uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid;
  srv record;
  mine record;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select r.server_id into target from public.resolve_join_target(p_code, p_server) r;
  select s.name, s.rules, s.join_questions, s.join_approval into srv from public.servers s where s.id = target;
  select j.status into mine from public.join_requests j where j.server_id = target and j.user_id = (select auth.uid());
  return jsonb_build_object(
    'server_id', target, 'name', srv.name, 'rules', srv.rules, 'questions', srv.join_questions,
    'approval', srv.join_approval, 'request_status', mine.status, 'member', public.is_server_member(target)
  );
end;
$$;
revoke all on function public.join_screening(text, uuid) from public, anon;
grant execute on function public.join_screening(text, uuid) to authenticated;

/**
 * Answer the questions and join (no approval), or file a pending request (approval). Returns
 * 'joined' or 'pending'. A rejected applicant can ask again after a day.
 */
create or replace function public.request_to_join(p_code text default null, p_server uuid default null, p_answers jsonb default '[]'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  invite text;
  srv record;
  prior record;
  answers jsonb := coalesce(p_answers, '[]'::jsonb);
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.mfa_ok() or public.is_platform_banned() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select r.server_id, r.invite_code into target, invite from public.resolve_join_target(p_code, p_server) r;
  if exists (select 1 from public.server_bans b where b.server_id = target and b.user_id = caller) then
    raise exception 'BANNED' using errcode = '42501';
  end if;
  if public.is_server_member(target) then
    return 'joined';
  end if;
  select s.join_questions, s.join_approval into srv from public.servers s where s.id = target;
  if jsonb_typeof(answers) <> 'array' or jsonb_array_length(answers) <> jsonb_array_length(srv.join_questions)
     or exists (select 1 from jsonb_array_elements(answers) a where jsonb_typeof(a) <> 'string' or char_length(btrim(a #>> '{}')) not between 1 and 500) then
    raise exception 'INVALID_ANSWERS' using errcode = '23514';
  end if;
  select * into prior from public.join_requests j where j.server_id = target and j.user_id = caller;
  if prior.status = 'pending' then
    return 'pending';
  end if;
  if prior.status = 'rejected' and prior.decided_at > now() - interval '1 day' then
    raise exception 'JOIN_REQUEST_REJECTED' using errcode = '42501';
  end if;
  if (select count(*) from public.join_requests j where j.user_id = caller and j.status = 'pending') >= 10 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;

  insert into public.join_requests (server_id, user_id, answers, status, created_at, decided_by, decided_at)
  values (target, caller, answers, case when srv.join_approval then 'pending' else 'approved' end, now(), null, case when srv.join_approval then null else now() end)
  on conflict (server_id, user_id) do update
    set answers = excluded.answers, status = excluded.status, created_at = now(), decided_by = null, decided_at = excluded.decided_at;
  if invite is not null then
    update public.server_invites set uses = uses + 1 where code = invite;
  end if;
  if srv.join_approval then
    return 'pending';
  end if;
  if (select count(*) from public.members m where m.user_id = caller) >= 100 then
    raise exception 'SERVER_JOIN_LIMIT' using errcode = '53400';
  end if;
  insert into public.members (server_id, user_id, role) values (target, caller, 'member') on conflict do nothing;
  return 'joined';
end;
$$;
revoke all on function public.request_to_join(text, uuid, jsonb) from public, anon;
grant execute on function public.request_to_join(text, uuid, jsonb) to authenticated;

/** Moderators approve (adds the member) or reject a pending request. */
create or replace function public.decide_join_request(p_server uuid, p_user uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_server_role(p_server, 'moderator') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.join_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_by = (select auth.uid()), decided_at = now()
  where server_id = p_server and user_id = p_user and status = 'pending';
  if not found then
    raise exception 'JOIN_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_approve then
    if exists (select 1 from public.server_bans b where b.server_id = p_server and b.user_id = p_user) then
      raise exception 'BANNED' using errcode = '42501';
    end if;
    insert into public.members (server_id, user_id, role) values (p_server, p_user, 'member') on conflict do nothing;
  end if;
  perform public.log_audit(p_server, case when p_approve then 'member.approve' else 'member.reject' end, 'member', p_user);
end;
$$;
revoke all on function public.decide_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.decide_join_request(uuid, uuid, boolean) to authenticated;

/** Admins set the questions (0–5, each 1–200 characters) and whether moderators approve joins. */
create or replace function public.set_join_screening(p_server uuid, p_questions jsonb, p_approval boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned jsonb;
begin
  if not public.has_server_role(p_server, 'admin') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if exists (select 1 from public.servers s where s.id = p_server and s.is_system) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_QUESTIONS' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(btrim(q #>> '{}') order by n), '[]'::jsonb) into cleaned
  from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) with ordinality as t(q, n)
  where jsonb_typeof(q) = 'string' and btrim(q #>> '{}') <> '';
  if jsonb_array_length(cleaned) > 5 or exists (select 1 from jsonb_array_elements_text(cleaned) q where char_length(q) > 200) then
    raise exception 'INVALID_QUESTIONS' using errcode = '23514';
  end if;
  update public.servers set join_questions = cleaned, join_approval = coalesce(p_approval, false) where id = p_server;
  perform public.log_audit(p_server, 'server.screening', 'server', p_server, jsonb_build_object('questions', jsonb_array_length(cleaned), 'approval', coalesce(p_approval, false)));
end;
$$;
revoke all on function public.set_join_screening(uuid, jsonb, boolean) from public, anon;
grant execute on function public.set_join_screening(uuid, jsonb, boolean) to authenticated;

-- Joining by invite (and so from Explore) defers to the screening form while it's switched on.
create or replace function public.join_server(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  invite public.server_invites;
  joined int;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select s.id into target from public.servers s where s.invite_code = upper(btrim(p_code));
  if target is null then
    select * into invite from public.server_invites i where i.code = upper(btrim(p_code)) for update;
    if invite.code is null or not public.invite_is_live(invite) then
      raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
    end if;
    target := invite.server_id;
  end if;
  if exists (select 1 from public.server_bans b where b.server_id = target and b.user_id = caller) then
    raise exception 'BANNED' using errcode = '42501';
  end if;
  if public.is_server_member(target) then
    return target;
  end if;
  if exists (select 1 from public.servers s where s.id = target and (s.join_approval or jsonb_array_length(s.join_questions) > 0)) then
    raise exception 'SCREENING_REQUIRED' using errcode = 'P0001';
  end if;
  select count(*) into joined from public.members m where m.user_id = caller;
  if joined >= 100 then
    raise exception 'SERVER_JOIN_LIMIT' using errcode = '53400';
  end if;
  insert into public.members (server_id, user_id, role)
  values (target, caller, 'member')
  on conflict (server_id, user_id) do nothing;
  if invite.code is not null then
    update public.server_invites set uses = uses + 1 where code = invite.code;
  end if;
  return target;
end;
$$;

-- Data export: your join requests and the answers you gave.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  -- The base raises for signed-out, banned or step-up-required callers.
  return public.export_my_data_base() || jsonb_build_object(
    'favourite_friends', coalesce((select jsonb_agg(p.username) from public.friend_favourites f join public.profiles p on p.id = f.target_id where f.owner_id = me), '[]'),
    'scheduled_messages', coalesce((select jsonb_agg(jsonb_build_object('channel_id', s.channel_id, 'content', s.content, 'send_at', s.send_at, 'failed_reason', s.failed_reason)) from public.scheduled_messages s where s.author_id = me), '[]'),
    'moments', coalesce((select jsonb_agg(jsonb_build_object('body', m.body, 'image_path', m.image_path, 'audience', m.audience, 'created_at', m.created_at, 'expires_at', m.expires_at)) from public.moments m where m.author_id = me), '[]'),
    'muted_moments_from', coalesce((select jsonb_agg(p.username) from public.moment_mutes mm join public.profiles p on p.id = mm.target_id where mm.owner_id = me), '[]'),
    'community_xp', coalesce((select jsonb_agg(jsonb_build_object('server', s.name, 'xp', x.xp)) from public.member_xp x join public.servers s on s.id = x.server_id where x.user_id = me), '[]'),
    'join_requests', coalesce((select jsonb_agg(jsonb_build_object('server', s.name, 'answers', j.answers, 'status', j.status, 'created_at', j.created_at)) from public.join_requests j join public.servers s on s.id = j.server_id where j.user_id = me), '[]')
  );
end;
$$;

-- Moderators watch their server's join queue live (rows are still filtered by RLS).
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
  elsif kind = 'channel' then
    return public.can_view_channel(target);
  elsif kind = 'dm' then
    return public.is_dm_participant(target);
  end if;
  return false;
end;
$$;
