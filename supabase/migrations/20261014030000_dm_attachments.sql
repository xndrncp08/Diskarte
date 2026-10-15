alter table public.direct_messages add column attachments jsonb not null default '[]'
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);
alter table public.direct_messages drop constraint direct_messages_not_empty;
alter table public.direct_messages add constraint direct_messages_not_empty
  check (char_length(btrim(content)) > 0 or sticker is not null or jsonb_array_length(attachments) > 0);

create function public.can_upload_dm_attachment(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.mfa_ok() and not public.is_platform_banned() and public.is_dm_participant(p_conversation)
    and exists(select 1 from public.dm_conversations c where c.id = p_conversation and
      (c.kind = 'group' or exists(select 1 from public.dm_participants p where p.conversation_id = c.id
        and p.user_id <> (select auth.uid()) and public.are_friends((select auth.uid()), p.user_id)
        and not public.is_blocked_between((select auth.uid()), p.user_id))));
$$;
revoke all on function public.can_upload_dm_attachment(uuid) from public, anon;
grant execute on function public.can_upload_dm_attachment(uuid) to authenticated;

create policy "participants upload their own DM attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and name ~ '^dm/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp3|mp4|webm|ogg|m4a)$'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and public.can_upload_dm_attachment(public.try_uuid((storage.foldername(name))[2])));
create policy "participants read sent DM attachments or their own previews" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = 'dm'
    and not public.is_platform_banned() and public.is_dm_participant(public.try_uuid((storage.foldername(name))[2]))
    and ((storage.foldername(name))[3] = (select auth.uid())::text or exists (
      select 1 from public.direct_messages d where d.conversation_id = public.try_uuid((storage.foldername(name))[2])
        and d.attachments @> jsonb_build_array(jsonb_build_object('path', name)))));
create policy "uploaders remove DM attachments" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = 'dm'
    and (storage.foldername(name))[3] = (select auth.uid())::text and not public.is_platform_banned());

create function public.dm_attachment_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare att jsonb; prefix text; caller uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' then
    if caller is not null and new.attachments is distinct from old.attachments then raise exception 'MESSAGE_IMMUTABLE_FIELD' using errcode = '42501'; end if;
    return new;
  end if;
  if jsonb_typeof(new.attachments) is distinct from 'array' or jsonb_array_length(new.attachments) > 10 then raise exception 'INVALID_ATTACHMENT' using errcode = '23514'; end if;
  if jsonb_array_length(new.attachments) = 0 then return new; end if;
  if caller is not null and not public.can_upload_dm_attachment(new.conversation_id) then raise exception 'DM_NOT_ALLOWED' using errcode = '42501'; end if;
  prefix := 'dm/' || new.conversation_id::text || '/' || coalesce(caller, new.author_id)::text || '/';
  for att in select * from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(att) is distinct from 'object' or not (att ?& array['path','name','size','type'])
      or (att->>'path') is null or left(att->>'path', length(prefix)) is distinct from prefix
      or substr(att->>'path', length(prefix)+1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp3|mp4|webm|ogg|m4a)$'
      or jsonb_typeof(att->'name') is distinct from 'string' or length(att->>'name') not between 1 and 120
      or (att->>'type') is null or (att->>'type') not in ('image/jpeg','image/png','image/webp','image/gif','audio/mpeg','video/mp4','audio/webm','audio/ogg','audio/mp4')
      or jsonb_typeof(att->'size') is distinct from 'number' then raise exception 'INVALID_ATTACHMENT' using errcode = '23514'; end if;
    if (att->>'size')::numeric not between 1 and 10485760 or trunc((att->>'size')::numeric) <> (att->>'size')::numeric
      or not exists (select 1 from storage.objects o where o.bucket_id = 'attachments' and o.name = att->>'path'
        and o.metadata->>'mimetype' = att->>'type' and (o.metadata->>'size')::numeric = (att->>'size')::numeric)
      then raise exception 'INVALID_ATTACHMENT' using errcode = '23514'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.dm_attachment_guard() from public, anon, authenticated;
create trigger dm_attachment_guard before insert or update on public.direct_messages for each row execute function public.dm_attachment_guard();
create index direct_messages_attachments_idx on public.direct_messages using gin(attachments jsonb_path_ops);

-- Retain invoker RLS while including permitted DM media in global search.
create or replace function public.search_all_messages(
  p_query text,
  p_server uuid default null,
  p_channel uuid default null,
  p_author uuid default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_kind text default null,
  p_cursor_date timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns table (source text, id uuid, server_id uuid, channel_id uuid, conversation_id uuid, thread_id uuid, author_id uuid, content text, created_at timestamptz, attachments jsonb)
language sql stable security invoker set search_path = ''
as $$
  with candidates as (
    select 'channel'::text as source, m.id, m.server_id, m.channel_id, null::uuid as conversation_id,
      m.thread_id, m.author_id, m.content, m.created_at, m.attachments
    from public.messages m
    where (p_server is null or m.server_id = p_server)
      and (p_channel is null or m.channel_id = p_channel)
      and (p_kind is null or p_kind = 'attachment' and jsonb_array_length(m.attachments) > 0
        or p_kind in ('image','audio','video') and exists (
          select 1 from jsonb_array_elements(m.attachments) a where a->>'type' like p_kind || '/%'))
      and (public.search_tsquery(p_query) is null or to_tsvector('simple', m.content) @@ public.search_tsquery(p_query))
    union all
    select 'dm'::text, d.id, null::uuid, null::uuid, d.conversation_id, null::uuid,
      d.author_id, d.content, d.created_at, d.attachments
    from public.direct_messages d
    where p_server is null and p_channel is null
      and (p_kind is null or p_kind = 'attachment' and jsonb_array_length(d.attachments) > 0
        or p_kind in ('image','audio','video') and exists (
          select 1 from jsonb_array_elements(d.attachments) a where a->>'type' like p_kind || '/%'))
      and (public.search_tsquery(p_query) is null or to_tsvector('simple', d.content) @@ public.search_tsquery(p_query))
  )
  select c.* from candidates c
  where (p_author is null or c.author_id = p_author)
    and (p_after is null or c.created_at >= p_after)
    and (p_before is null or c.created_at < p_before)
    and (p_cursor_date is null or c.created_at < p_cursor_date or c.created_at = p_cursor_date and p_cursor_id is not null and c.id < p_cursor_id)
    and (public.search_tsquery(p_query) is not null or p_server is not null or p_channel is not null or p_author is not null or p_after is not null or p_before is not null or p_kind is not null)
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;
revoke execute on function public.search_all_messages(text, uuid, uuid, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.search_all_messages(text, uuid, uuid, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer) to authenticated;
