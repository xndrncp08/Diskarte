-- =====================================================================================
-- Realtime: authorise the `db:*` Postgres Changes topics as private channels.
--
-- DEPLOYMENT.md has Realtime's "Allow public access" turned off, which makes Realtime reject every
-- non-private channel join. The app's Postgres Changes subscriptions (chat, DMs, friends, LFG,
-- memberships, server updates) were public, so in production they never joined and new messages
-- only appeared after a reload. They now join as private channels, authorised here per topic.
-- Rows are still filtered by each table's RLS; this only gates who may join the topic.
--
--   db:chat:<channel>[:<thread>]  members of the channel's server
--   db:server:<server>            members of the server
--   db:lfg:<server>               members of the server
--   db:dm:<conversation>          participants of the conversation
--   db:memberships|friends|dms:<user>  that user only
-- =====================================================================================
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

-- `db:*` topics only carry Postgres Changes: nobody may broadcast on them.
drop policy if exists "members send private server/channel broadcasts" on realtime.messages;
create policy "members send private server/channel broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    split_part((select realtime.topic()), ':', 1) <> 'db'
    and public.can_access_realtime_topic((select realtime.topic()))
  );
