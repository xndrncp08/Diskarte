-- =====================================================================================
-- Forum channels (Discord's): every top-level message is a post with a title; replies go in
-- the post's thread. Sorted by latest activity in the app. The new enum value is compared as
-- text below because Postgres won't use a just-added enum value in the same transaction.
-- =====================================================================================

alter type public.channel_type add value if not exists 'forum';

alter table public.channels drop constraint channels_name_format;
alter table public.channels add constraint channels_name_format check (
  (type::text in ('text', 'forum') and name ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
  or (type::text = 'voice' and char_length(btrim(name)) between 1 and 32)
);

alter table public.messages add column title text check (title is null or char_length(title) between 1 and 100);

create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  ch record;
  att jsonb;
  prefix text;
  recent int;
begin
  select c.server_id, c.type into ch from public.channels c where c.id = new.channel_id;
  if not found then
    raise exception 'CHANNEL_NOT_FOUND' using errcode = '23503';
  end if;
  if ch.type::text not in ('text', 'forum') then
    raise exception 'NOT_A_TEXT_CHANNEL' using errcode = '23514';
  end if;
  -- Forum posts (top-level messages in a forum) need a title; nothing else has one.
  if ch.type::text = 'forum' and new.thread_id is null then
    new.title := btrim(coalesce(new.title, ''));
    if char_length(new.title) not between 1 and 100 then
      raise exception 'POST_TITLE_REQUIRED' using errcode = '23514';
    end if;
  else
    new.title := null;
  end if;

  new.server_id := ch.server_id;
  new.content := btrim(new.content);
  new.created_at := now();
  new.edited_at := null;
  new.pinned := false;
  new.pinned_at := null;
  new.pinned_by := null;

  if caller is not null then
    new.author_id := caller;

    -- 8 messages per 10 seconds per user, across all channels.
    select count(*) into recent
    from public.messages m
    where m.author_id = caller
      and m.created_at > now() - interval '10 seconds';
    if recent >= 8 then
      raise exception 'RATE_LIMITED' using errcode = '53400', hint = 'Dahan-dahan lang, kabayan. Try again in a few seconds.';
    end if;

    -- Attachments must live under {server}/{channel}/{uploader}/ in the attachments bucket.
    prefix := ch.server_id::text || '/' || new.channel_id::text || '/' || caller::text || '/';
    for att in select * from jsonb_array_elements(new.attachments) loop
      if jsonb_typeof(att) <> 'object'
         or not (att ? 'path') or not (att ? 'name') or not (att ? 'size') or not (att ? 'type')
         or left(att ->> 'path', char_length(prefix)) <> prefix
         or substr(att ->> 'path', char_length(prefix) + 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp3|mp4|webm|ogg|m4a)$'
         or (att ->> 'type') not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'video/mp4', 'audio/webm', 'audio/ogg', 'audio/mp4')
         or jsonb_typeof(att -> 'size') <> 'number'
         or (att ->> 'size')::numeric <= 0
         or (att ->> 'size')::numeric > 10485760
         or char_length(att ->> 'name') > 120 then
        raise exception 'INVALID_ATTACHMENT' using errcode = '23514';
      end if;
    end loop;
  end if;

  if new.reply_to_id is not null and not exists (
    select 1 from public.messages r where r.id = new.reply_to_id and r.channel_id = new.channel_id
  ) then
    new.reply_to_id := null;
  end if;
  return new;
end;
$$;

-- Forums count for unread pills too.
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
    join public.channels c on c.server_id = m.server_id and c.type::text in ('text', 'forum')
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
