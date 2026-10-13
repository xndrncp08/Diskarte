-- =====================================================================================
-- Privacy settings (Discord's "Who can send you a friend request"): everyone, people who share
-- a server with you (Diskarte HQ doesn't count, everyone is in it), or nobody. Own row only.
-- =====================================================================================

create table public.privacy_settings (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  friend_requests_from text not null default 'everyone' check (friend_requests_from in ('everyone', 'server_members', 'nobody')),
  updated_at timestamptz not null default now()
);

alter table public.privacy_settings enable row level security;
revoke all on table public.privacy_settings from anon, authenticated;
grant select, insert, update on table public.privacy_settings to authenticated;

create policy "own privacy settings"
  on public.privacy_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  existing record;
  outgoing int;
  req_policy text;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select p.id into target from public.profiles p where p.username = lower(btrim(ltrim(btrim(p_username), '@')));
  if target is null or public.is_blocked_between(caller, target) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target = caller then
    raise exception 'CANNOT_FRIEND_SELF' using errcode = '23514';
  end if;

  select * into existing from public.friendships f
  where f.user_low = least(caller, target) and f.user_high = greatest(caller, target) for update;
  if found then
    if existing.status = 'accepted' then
      return 'accepted';
    end if;
    if existing.requested_by = target then
      update public.friendships set status = 'accepted', accepted_at = now()
      where user_low = existing.user_low and user_high = existing.user_high;
      return 'accepted';
    end if;
    return 'pending';
  end if;

  -- Their privacy setting (accepting a request they sent is never blocked).
  select ps.friend_requests_from into req_policy from public.privacy_settings ps where ps.user_id = target;
  if req_policy = 'nobody' or (req_policy = 'server_members' and not exists (
    select 1 from public.members a
    join public.members b on b.server_id = a.server_id and b.user_id = target
    join public.servers s on s.id = a.server_id and not s.is_system
    where a.user_id = caller
  )) then
    raise exception 'FRIEND_REQUESTS_CLOSED' using errcode = '42501';
  end if;

  select count(*) into outgoing from public.friendships f where f.requested_by = caller and f.status = 'pending';
  if outgoing >= 50 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = '53400';
  end if;
  insert into public.friendships (user_low, user_high, requested_by)
  values (least(caller, target), greatest(caller, target), caller);
  return 'pending';
end;
$$;
