-- =====================================================================================
-- Diskarte — security hardening (applied after 20260926000000_schema.sql)
--   * anon gets no table privileges at all (RLS already returned nothing; now it's denied)
--   * attachments: MIME allow-list, 10 MB cap, UUID-only object names (DB, bucket and policy)
--   * avatars: object names must follow <owner>/<kind>-<uuid>.<ext>
-- =====================================================================================

-- 1) Defence in depth: signed-out clients can't touch application tables directly.
revoke all on table public.profiles, public.servers, public.members, public.channels, public.messages, public.reactions from anon;

-- 2) Stricter attachment validation for new messages.
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
         or substr(att ->> 'path', char_length(prefix) + 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp3|mp4)$'
         or (att ->> 'type') not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'video/mp4')
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

-- 3) Bucket-level limits (enforced by Supabase Storage before any policy runs).
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'video/mp4']
where id = 'attachments';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'avatars';

-- 4) Object names: random UUIDs only, inside the uploader's own folder.
drop policy if exists "members upload attachments to their own folder" on storage.objects;
create policy "members upload attachments to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_server_member(public.try_uuid((storage.foldername(name))[1]))
    and public.channel_server_id(public.try_uuid((storage.foldername(name))[2])) = public.try_uuid((storage.foldername(name))[1])
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp3|mp4)$'
  );

drop policy if exists "users upload their own avatar and banner" on storage.objects;
create policy "users upload their own avatar and banner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars' and (
      (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and name ~ '^[0-9a-f-]{36}/(avatar|banner)-[0-9a-f-]{36}\.(png|jpg|webp|gif)$'
      )
      or (
        (storage.foldername(name))[1] = 'servers'
        and public.has_server_role(public.try_uuid((storage.foldername(name))[2]), 'admin')
        and name ~ '^servers/[0-9a-f-]{36}/icon-[0-9a-f-]{36}\.(png|jpg|webp|gif)$'
      )
    )
  );
