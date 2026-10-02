-- =====================================================================================
-- Ringing: incoming call pop-ups for DM calls and "ring to voice" pings.
--
-- A ring is one caller → one callee invitation that lives for 45 seconds. Clients never write the
-- table directly: `ring_call` validates the relationship (DM participants, or fellow server members
-- for a voice channel; never across a block) and dedupes/limits, `respond_ring` lets the callee
-- accept or decline, `cancel_rings` lets the caller hang up first. Each user watches their own rings
-- over the private Realtime topic `db:rings:<user>`.
-- =====================================================================================
create table public.call_rings (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'voice')),
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.dm_conversations (id) on delete cascade,
  server_id uuid references public.servers (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete cascade,
  video boolean not null default false,
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'missed', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '45 seconds',
  responded_at timestamptz,
  check (caller_id <> callee_id),
  check ((kind = 'dm' and conversation_id is not null) or (kind = 'voice' and server_id is not null and channel_id is not null))
);

create index call_rings_callee_idx on public.call_rings (callee_id, status, expires_at);
create index call_rings_caller_idx on public.call_rings (caller_id, created_at);

alter table public.call_rings enable row level security;
revoke insert, update, delete, truncate on public.call_rings from anon, authenticated;

create policy "callers and callees see their rings"
  on public.call_rings for select to authenticated
  using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));

alter publication supabase_realtime add table public.call_rings;

/** Ring everyone else in a DM (p_target = conversation), or one member into a voice channel
    (p_target = channel, p_callee = member). Returns the new ring ids (already-ringing callees are skipped). */
create or replace function public.ring_call(p_kind text, p_target uuid, p_callee uuid default null, p_video boolean default false)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  srv uuid;
  callee uuid;
  ring_id uuid;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if (select count(*) from public.call_rings r where r.caller_id = caller and r.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;

  if p_kind = 'dm' then
    if not public.is_dm_participant(p_target) then
      raise exception 'NOT_A_PARTICIPANT' using errcode = '42501';
    end if;
    for callee in
      select p.user_id from public.dm_participants p
      where p.conversation_id = p_target and p.user_id <> caller and not public.is_blocked_between(caller, p.user_id)
    loop
      if not exists (
        select 1 from public.call_rings r
        where r.caller_id = caller and r.callee_id = callee and r.conversation_id = p_target and r.status = 'ringing' and r.expires_at > now()
      ) then
        insert into public.call_rings (kind, caller_id, callee_id, conversation_id, video)
        values ('dm', caller, callee, p_target, coalesce(p_video, false))
        returning id into ring_id;
        return next ring_id;
      end if;
    end loop;
  elsif p_kind = 'voice' then
    select c.server_id into srv from public.channels c where c.id = p_target and c.type = 'voice';
    if srv is null then
      raise exception 'NOT_A_VOICE_CHANNEL' using errcode = '22023';
    end if;
    if p_callee is null or p_callee = caller
       or not public.is_server_member(srv)
       or not exists (select 1 from public.members m where m.server_id = srv and m.user_id = p_callee)
       or public.is_blocked_between(caller, p_callee) then
      raise exception 'CANNOT_RING' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.call_rings r
      where r.caller_id = caller and r.callee_id = p_callee and r.channel_id = p_target and r.status = 'ringing' and r.expires_at > now()
    ) then
      insert into public.call_rings (kind, caller_id, callee_id, server_id, channel_id)
      values ('voice', caller, p_callee, srv, p_target)
      returning id into ring_id;
      return next ring_id;
    end if;
  else
    raise exception 'INVALID_RING' using errcode = '22023';
  end if;
end;
$$;

/** Callee answers. A ring that has run out is marked missed and refused. */
create or replace function public.respond_ring(p_ring uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.call_rings;
begin
  select * into r from public.call_rings where id = p_ring and callee_id = (select auth.uid()) for update;
  if not found then
    raise exception 'RING_NOT_FOUND' using errcode = '42501';
  end if;
  if r.status <> 'ringing' then
    return r.status;
  end if;
  if r.expires_at <= now() then
    update public.call_rings set status = 'missed' where id = p_ring;
    return 'missed';
  end if;
  update public.call_rings
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_ring;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

/** Caller hangs up before anyone answers: cancel their ringing invitations for that DM or channel. */
create or replace function public.cancel_rings(p_target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.call_rings
  set status = 'cancelled', responded_at = now()
  where caller_id = (select auth.uid()) and status = 'ringing' and (conversation_id = p_target or channel_id = p_target);
$$;

revoke all on function public.ring_call(text, uuid, uuid, boolean) from public, anon;
revoke all on function public.respond_ring(uuid, boolean) from public, anon;
revoke all on function public.cancel_rings(uuid) from public, anon;
grant execute on function public.ring_call(text, uuid, uuid, boolean) to authenticated;
grant execute on function public.respond_ring(uuid, boolean) to authenticated;
grant execute on function public.cancel_rings(uuid) to authenticated;

-- Realtime: authorise each user's own `db:rings:<user>` topic.
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
