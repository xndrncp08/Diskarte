-- =====================================================================================
-- Voice messages: recordings from the browser (MediaRecorder) are WebM/Opus (Chrome, Firefox),
-- Ogg/Opus, or MP4/AAC (Safari). Allow those audio types as attachments everywhere the
-- allow-list is enforced: the message trigger, the bucket and the upload policy.
-- =====================================================================================

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
  if ch.type <> 'text' then
    raise exception 'NOT_A_TEXT_CHANNEL' using errcode = '23514';
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

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'video/mp4', 'audio/webm', 'audio/ogg', 'audio/mp4']
where id = 'attachments';

drop policy if exists "members upload attachments to their own folder" on storage.objects;
create policy "members upload attachments to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_server_member(public.try_uuid((storage.foldername(name))[1]))
    and public.channel_server_id(public.try_uuid((storage.foldername(name))[2])) = public.try_uuid((storage.foldername(name))[1])
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp3|mp4|webm|ogg|m4a)$'
  );
