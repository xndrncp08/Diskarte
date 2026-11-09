-- =====================================================================================
-- Instant Hangouts + friends' live activity.
--
-- A Hangout is a temporary group conversation: a `dm_conversations` row (kind 'group', any size
-- 2–10) with `hangout_until` set. It reuses everything group DMs already have — text, the DM call
-- room (`dm:<id>`), rings, read state, realtime — and adds an end time. When it passes, the
-- conversation and its messages are deleted (purge_expired_hangouts, run by tick_platform and
-- whenever someone starts a new hangout). File attachments are refused while it is temporary, so a
-- purge never orphans Storage objects. "Keep" clears the end time and it becomes a normal group DM.
--
-- friends_activity() is the Home hub's "who's around" feed: accepted, unblocked friends with a
-- device heartbeat in the last 2 minutes. Invisible users and people who turned off
-- privacy_settings.share_activity are left out; a voice channel is only revealed when the caller
-- can see that channel themselves.
-- =====================================================================================

alter table public.dm_conversations
  add column hangout_until timestamptz,
  add column hangout_topic text check (hangout_topic in ('hangout', 'gaming', 'study', 'project', 'watch', 'create')),
  add constraint dm_conversations_hangout_group check (hangout_until is null or kind = 'group');

create index dm_conversations_hangout_until_idx on public.dm_conversations (hangout_until) where hangout_until is not null;

alter table public.privacy_settings add column share_activity boolean not null default true;

/** Deletes hangouts whose end time has passed (messages and rings cascade). Returns how many. */
create or replace function public.purge_expired_hangouts()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.dm_conversations where hangout_until < now() returning 1)
  select count(*)::int from gone;
$$;
revoke all on function public.purge_expired_hangouts() from public, anon, authenticated;
grant execute on function public.purge_expired_hangouts() to service_role;

/** Start a hangout with 1–9 friends for 1–24 hours. Same friendship/block rules as group DMs. */
create or replace function public.create_hangout(p_user_ids uuid[], p_name text default null, p_topic text default 'hangout', p_hours int default 3)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  others uuid[];
  other uuid;
  conv uuid;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.mfa_ok() or public.is_platform_banned() then
    raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_hours is null or p_hours not between 1 and 24 then
    raise exception 'INVALID_HANGOUT' using errcode = '23514';
  end if;
  select coalesce(array_agg(distinct u), '{}') into others from unnest(p_user_ids) as u where u is not null and u <> caller;
  if cardinality(others) < 1 or cardinality(others) > 9 then
    raise exception 'INVALID_GROUP_SIZE' using errcode = '23514';
  end if;
  foreach other in array others loop
    if not public.are_friends(caller, other) or public.is_blocked_between(caller, other) then
      raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
    end if;
  end loop;
  -- At most 3 live hangouts hosted at once keeps this from becoming a spam vector.
  if (select count(*) from public.dm_conversations c where c.owner_id = caller and c.hangout_until > now()) >= 3 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;
  perform public.purge_expired_hangouts();
  insert into public.dm_conversations (kind, name, owner_id, hangout_until, hangout_topic)
  values ('group', left(nullif(btrim(coalesce(p_name, '')), ''), 64), caller, now() + make_interval(hours => p_hours), coalesce(p_topic, 'hangout'))
  returning id into conv;
  insert into public.dm_participants (conversation_id, user_id)
  select conv, u from unnest(array_append(others, caller)) as u;
  return conv;
end;
$$;
revoke all on function public.create_hangout(uuid[], text, text, int) from public, anon;
grant execute on function public.create_hangout(uuid[], text, text, int) to authenticated;

/**
 * Any participant can push the end time out by 1–6 hours (never more than 24 hours from now).
 * The host can also keep it for good (p_keep), which turns it into an ordinary group DM.
 */
create or replace function public.extend_hangout(p_conversation_id uuid, p_hours int default 1, p_keep boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv record;
  next_until timestamptz;
begin
  select * into conv from public.dm_conversations c where c.id = p_conversation_id;
  if not found or conv.hangout_until is null or conv.hangout_until < now() or not public.is_dm_participant(p_conversation_id) then
    raise exception 'HANGOUT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_keep then
    if conv.owner_id is distinct from (select auth.uid()) then
      raise exception 'NOT_HANGOUT_HOST' using errcode = '42501';
    end if;
    update public.dm_conversations set hangout_until = null where id = p_conversation_id;
    return null;
  end if;
  if p_hours is null or p_hours not between 1 and 6 then
    raise exception 'INVALID_HANGOUT' using errcode = '23514';
  end if;
  next_until := least(conv.hangout_until + make_interval(hours => p_hours), now() + interval '24 hours');
  update public.dm_conversations set hangout_until = next_until where id = p_conversation_id;
  return next_until;
end;
$$;
revoke all on function public.extend_hangout(uuid, int, boolean) from public, anon;
grant execute on function public.extend_hangout(uuid, int, boolean) to authenticated;

/** The host ends a hangout for everyone now: the conversation and its messages are deleted. */
create or replace function public.end_hangout(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dm_conversations c
  where c.id = p_conversation_id and c.hangout_until is not null and c.owner_id = (select auth.uid());
  if not found then
    raise exception 'NOT_HANGOUT_HOST' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.end_hangout(uuid) from public, anon;
grant execute on function public.end_hangout(uuid) to authenticated;

/** No new messages once a hangout's time is up (the purge may not have run yet). */
create or replace function public.direct_messages_hangout_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.dm_conversations c where c.id = new.conversation_id and c.hangout_until < now()) then
    raise exception 'HANGOUT_ENDED' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.direct_messages_hangout_guard() from public, anon, authenticated;
create trigger direct_messages_hangout_guard before insert on public.direct_messages
  for each row execute function public.direct_messages_hangout_guard();

-- Temporary hangouts take no file uploads, so deleting one never leaves files behind in Storage.
create or replace function public.can_upload_dm_attachment(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.mfa_ok() and not public.is_platform_banned() and public.is_dm_participant(p_conversation)
    and exists(select 1 from public.dm_conversations c where c.id = p_conversation and c.hangout_until is null and
      (c.kind = 'group' or exists(select 1 from public.dm_participants p where p.conversation_id = c.id
        and p.user_id <> (select auth.uid()) and public.are_friends((select auth.uid()), p.user_id)
        and not public.is_blocked_between((select auth.uid()), p.user_id))));
$$;

/**
 * Friends who are around right now (heartbeat in the last 2 minutes). Status is the newest
 * device's; invisible friends and friends who don't share activity are omitted. The voice channel
 * (and its server) is returned only when the caller can view that channel.
 */
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
    and not public.is_blocked_between(me.id, l.user_id)
    and coalesce((select ps.share_activity from public.privacy_settings ps where ps.user_id = l.user_id), true)
    and public.mfa_ok() and not public.is_platform_banned();
$$;
revoke all on function public.friends_activity() from public, anon;
grant execute on function public.friends_activity() to authenticated;

create or replace function public.tick_platform()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.publish_scheduled_messages();
  perform public.clear_expired_custom_statuses();
  perform public.run_due_announcements();
  perform public.purge_expired_hangouts();
  delete from public.moments where expires_at < now() - interval '1 day';
end;
$$;
