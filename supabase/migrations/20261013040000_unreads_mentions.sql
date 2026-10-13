-- =====================================================================================
-- Unread channels and mentions (Discord's white unread pill and red mention badge).
--   * channels.last_message_at — when the channel last got a (non-thread) message.
--   * channel_reads — when each person last read each channel (theirs only).
--   * message_mentions — who a message @mentions, only people who can see the channel.
--   * messages.mentions_everyone — @everyone / @here, only honoured from moderators.
--   * my_unreads() — per visible text channel: last message, my read point, mention count.
-- Apply after 20261013020000_roles_private_channels.sql (uses channels.is_private).
-- =====================================================================================

alter table public.channels add column last_message_at timestamptz;
update public.channels c set last_message_at = (select max(m.created_at) from public.messages m where m.channel_id = c.id and m.thread_id is null);

alter table public.messages add column mentions_everyone boolean not null default false;
create index messages_everyone_idx on public.messages (channel_id, created_at) where mentions_everyone;

create table public.channel_reads (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.channel_reads enable row level security;
revoke all on table public.channel_reads from anon, authenticated;
grant select on table public.channel_reads to authenticated;
create policy "people see their own read points"
  on public.channel_reads for select to authenticated
  using (user_id = (select auth.uid()));

create table public.message_mentions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_mentions_user_idx on public.message_mentions (user_id, channel_id, created_at);
alter table public.message_mentions enable row level security;
revoke all on table public.message_mentions from anon, authenticated;
grant select on table public.message_mentions to authenticated;
create policy "people see their own mentions"
  on public.message_mentions for select to authenticated
  using (user_id = (select auth.uid()));

-- Live mention alerts: each person subscribes to their own rows only, on db:mentions:<me>.
alter publication supabase_realtime add table public.message_mentions;

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

/** can_view_channel for someone other than the caller (mentions are delivered on their behalf). */
create or replace function public.user_can_view_channel(p_user uuid, p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.channels c
    join public.members m on m.server_id = c.server_id and m.user_id = p_user
    where c.id = p_channel
      and (
        not c.is_private
        or m.role = 'admin'
        or exists (select 1 from public.channel_access a where a.channel_id = c.id and a.user_id = p_user)
        or exists (select 1 from public.channel_access a join public.member_roles r on r.role_id = a.role_id and r.user_id = p_user where a.channel_id = c.id)
      )
  );
$$;
revoke execute on function public.user_can_view_channel(uuid, uuid) from public, anon, authenticated;

/** @everyone / @here only count from moderators (anyone else's is plain text). */
create or replace function public.messages_mentions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.mentions_everyone := new.content ~* '(^|\s)@(everyone|here)(\W|$)'
    and coalesce((select m.role >= 'moderator' from public.members m where m.server_id = new.server_id and m.user_id = new.author_id), false);
  return new;
end;
$$;
create trigger messages_mentions_before_insert
  before insert on public.messages
  for each row execute function public.messages_mentions_before_insert();

/** Channel activity time, and @username mentions for members who can see the channel. */
create or replace function public.messages_after_insert_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.thread_id is null then
    update public.channels set last_message_at = new.created_at
    where id = new.channel_id and (last_message_at is null or last_message_at < new.created_at);
  end if;
  if position('@' in new.content) > 0 then
    insert into public.message_mentions (message_id, user_id, channel_id, server_id, created_at)
    select new.id, p.id, new.channel_id, new.server_id, new.created_at
    from public.profiles p
    where p.username in (select lower(x[1]) from regexp_matches(new.content, '(?:^|[^\w.])@([A-Za-z0-9_.]{3,32})', 'g') as x)
      and p.id is distinct from new.author_id
      and public.user_can_view_channel(p.id, new.channel_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger messages_after_insert_activity
  after insert on public.messages
  for each row execute function public.messages_after_insert_activity();

revoke execute on function public.messages_mentions_before_insert(), public.messages_after_insert_activity() from public, anon, authenticated;

/** Every text channel I can see: when it last had a message, where I've read up to, and my unread mentions. */
create or replace function public.my_unreads()
returns table (channel_id uuid, server_id uuid, last_message_at timestamptz, read_at timestamptz, mentions integer)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.id, c.server_id, c.last_message_at, coalesce(r.last_read_at, m.joined_at) as read_at
    from public.members m
    join public.channels c on c.server_id = m.server_id and c.type = 'text'
    left join public.channel_reads r on r.user_id = m.user_id and r.channel_id = c.id
    where m.user_id = (select auth.uid()) and public.can_view_channel(c.id)
  )
  select mine.id, mine.server_id, mine.last_message_at, mine.read_at,
    (
      (select count(*) from public.message_mentions mm where mm.user_id = (select auth.uid()) and mm.channel_id = mine.id and mm.created_at > mine.read_at)
      + (select count(*) from public.messages x where x.channel_id = mine.id and x.mentions_everyone and x.thread_id is null
           and x.author_id is distinct from (select auth.uid()) and x.created_at > mine.read_at)
    )::integer
  from mine;
$$;
revoke execute on function public.my_unreads() from public, anon;
grant execute on function public.my_unreads() to authenticated;

/** I've read this channel up to now. */
create or replace function public.mark_channel_read(p_channel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_view_channel(p_channel) then
    return;
  end if;
  insert into public.channel_reads (user_id, channel_id, last_read_at)
  values ((select auth.uid()), p_channel, now())
  on conflict (user_id, channel_id) do update set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at);
end;
$$;
revoke execute on function public.mark_channel_read(uuid) from public, anon;
grant execute on function public.mark_channel_read(uuid) to authenticated;
