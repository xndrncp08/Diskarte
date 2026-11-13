-- =====================================================================================
-- Production catch-up (2026-11-12): brings production's schema to exactly the repository's
-- final schema. Production never received these migrations, although later ones were applied:
--   20261014030000_dm_attachments        20261014070000_event_capacity
--   20261014040000_reaction_snapshot     20261014080000_account_export_sync
--   20261014050000_community_templates   20261014090000_account_cleanup
--   20261014060000_workspace_assets      20261107000000_release_announcements
-- They can't be replayed verbatim: Hangouts already created can_upload_dm_attachment (so only
-- its grants are applied), and 20261029060000 renamed the old export_my_data to export_my_data_base (so
-- account_export_sync's body goes to export_my_data_base; its grants are not repeated, keeping
-- export_my_data_base private). Everything else is copied from the migrations unchanged.
--
-- Safety: the preflight refuses to run unless production's whole public schema (functions and
-- their grants, columns, constraints, indexes, policies, triggers, RLS, table grants, realtime
-- publication) matches the rehearsed pre-state exactly; the postcheck aborts before COMMIT unless
-- it then matches the full-migration schema exactly and no rows were lost. Additive only: no rows
-- are deleted; server_events.rsvp_count is filled from event_rsvps. Release announcements are not
-- published (only the table and functions are created).
-- Rehearsed by diskarte/tests/db/production-catchup.test.ts. Run as postgres, all or nothing:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f diskarte/docs/sql/production-catchup.sql
-- =====================================================================================

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp view catchup_fingerprint as
with a as (
  select 'fn' cat, p.oid::regprocedure::text n, md5(p.prosrc || '|' || pg_get_function_result(p.oid) || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')) h from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select 'fnacl', p.oid::regprocedure::text, coalesce(array_to_string(p.proacl, ','), '') from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select 'col', table_name || '.' || column_name, md5(data_type || coalesce(column_default, '') || is_nullable) from information_schema.columns where table_schema = 'public'
  union all select 'con', conrelid::regclass::text || '.' || conname, md5(pg_get_constraintdef(oid)) from pg_constraint where connamespace = 'public'::regnamespace and contype <> 'n'
  union all select 'idx', indexrelid::regclass::text, md5(pg_get_indexdef(indexrelid)) from pg_index where indrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
  union all select 'pol', schemaname || '.' || tablename || '.' || policyname, md5(permissive || cmd || array_to_string(roles, ',') || coalesce(qual, '') || '|' || coalesce(with_check, '')) from pg_policies where schemaname in ('public', 'storage', 'realtime')
  union all select 'trg', tgrelid::regclass::text || '.' || tgname, md5(pg_get_triggerdef(oid) || tgenabled::text) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
  union all select 'rls', relname, relrowsecurity::text from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
  union all select 'tblacl', relname, coalesce(array_to_string(relacl, ','), '') from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
  union all select 'pub', 'supabase_realtime', string_agg(schemaname || '.' || tablename, ',' order by schemaname || '.' || tablename collate "C") from pg_publication_tables where pubname = 'supabase_realtime'
)
select cat, count(*)::int as n, md5(string_agg(n || '=' || h, ',' order by n collate "C")) as h from a group by cat order by cat collate "C";

do $$
declare
  expected constant jsonb := '{
    "col": "396:aea1fb956d52fb60a3a5e0caf9271108",
    "con": "321:af919aa3eb3ff85fa68dfd80b378e6eb",
    "fn": "197:6ca8d2044827cf33084e354e7369a302",
    "fnacl": "197:824c14e98d115f2ec0a50c04981792d5",
    "idx": "137:599560b543733ac4583f5d3512c02200",
    "pol": "113:8ae621d833c46bcd4fd28cc3d0bcafd1",
    "pub": "1:0934d79244a50d7402ea8c204aef0d25",
    "rls": "56:6ac3c74b949ea49933bcecb6e547677d",
    "tblacl": "56:7c0d43928fbfc90e77cfcc93b61aeef7",
    "trg": "64:fb35eae73e7cd9f1d54a24e5b18b995e"
  }';
  actual jsonb := (select jsonb_object_agg(cat, n || ':' || h) from catchup_fingerprint);
begin
  if actual is distinct from expected then
    raise exception 'catch-up preflight failed: schema differs in %',
      (select string_agg(k, ', ') from jsonb_object_keys(expected) k where actual -> k is distinct from expected -> k);
  end if;
end;
$$;

create temp table catchup_counts on commit drop as
  select (select count(*) from public.direct_messages) as direct_messages, (select count(*) from public.server_events) as server_events;

-- ===================== 20261014030000_dm_attachments.sql =====================
alter table public.direct_messages add column attachments jsonb not null default '[]'
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);
alter table public.direct_messages drop constraint direct_messages_not_empty;
alter table public.direct_messages add constraint direct_messages_not_empty
  check (char_length(btrim(content)) > 0 or sticker is not null or jsonb_array_length(attachments) > 0);

-- (create function can_upload_dm_attachment skipped: 20261108000000_hangouts.sql already defines
-- its final version, but without these grants, so anon could still execute it)
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

-- ===================== 20261014040000_reaction_snapshot.sql =====================
-- One statement snapshot avoids offset-pagination races and PostgREST's row-count truncation.
create function public.get_reactions_snapshot(p_channel uuid, p_messages uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reactions r
  where public.mfa_ok() and not public.is_platform_banned() and r.channel_id = p_channel
    and cardinality(p_messages) between 1 and 100 and r.message_id = any(p_messages);
$$;
revoke all on function public.get_reactions_snapshot(uuid,uuid[]) from public, anon;
grant execute on function public.get_reactions_snapshot(uuid,uuid[]) to authenticated;

-- ===================== 20261014050000_community_templates.sql =====================
create function public.create_server_from_template(p_name text, p_description text default '', p_template text default 'gaming')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare server uuid;
begin
  if not public.mfa_ok() or public.is_platform_banned() then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_template is null or p_template not in ('gaming','study','creator','friends','team') then raise exception 'INVALID_TEMPLATE'; end if;
  server := public.create_server(p_name, p_description);
  if p_template <> 'gaming' then delete from public.channels where server_id = server and name = 'lfg-valorant'; end if;
  if p_template = 'study' then
    insert into public.channels(server_id,name,type,category,position,read_only) values
      (server,'resources','text','Study',10,true),(server,'questions','forum','Study',11,false),(server,'Quiet room','voice','Study',12,false);
  elsif p_template = 'creator' then
    insert into public.channels(server_id,name,type,category,position,read_only) values
      (server,'announcements','text','Creator',10,true),(server,'feedback','forum','Creator',11,false),(server,'resources','text','Creator',12,true);
  elsif p_template = 'team' then
    insert into public.channels(server_id,name,type,category,position,read_only) values
      (server,'announcements','text','Team',10,true),(server,'projects','forum','Team',11,false),(server,'resources','text','Team',12,true);
  end if;
  return server;
end;
$$;
revoke all on function public.create_server_from_template(text,text,text) from public, anon;
grant execute on function public.create_server_from_template(text,text,text) to authenticated;

create function public.export_server_settings(p_server uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare server public.servers;
begin
  select * into server from public.servers where id = p_server and owner_id = (select auth.uid());
  if not found or not public.mfa_ok() or public.is_platform_banned() then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
  return jsonb_build_object('format', 'diskarte-community-settings-v1', 'exported_at', now(),
    'server', to_jsonb(server) - 'invite_code',
    'channels', coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.id) from public.channels c where c.server_id=p_server),'[]'),
    'roles', coalesce((select jsonb_agg(to_jsonb(r)) from public.server_roles r where r.server_id=p_server),'[]'),
    'emoji', coalesce((select jsonb_agg(to_jsonb(e)) from public.server_emojis e where e.server_id=p_server),'[]'));
end;
$$;
revoke all on function public.export_server_settings(uuid) from public, anon;
grant execute on function public.export_server_settings(uuid) to authenticated;

-- ===================== 20261014060000_workspace_assets.sql =====================
-- Separate additive assets keep older workspace clients compatible with notes/boards/focus.
create table public.workspace_assets (
  channel_id uuid not null references public.channels(id) on delete cascade,
  kind text not null check (kind in ('resources','whiteboard')),
  content jsonb not null check (jsonb_typeof(content)='object' and octet_length(content::text)<=65536),
  revision integer not null default 1 check (revision>0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(channel_id,kind)
);
alter table public.workspace_assets enable row level security;
revoke all on public.workspace_assets from anon,authenticated;
grant select on public.workspace_assets to authenticated;
create policy "channel members see workspace assets" on public.workspace_assets for select to authenticated
  using (public.can_view_channel(channel_id) and public.mfa_ok() and not public.is_platform_banned());
create function public.save_workspace_asset(p_channel uuid,p_kind text,p_content jsonb,p_revision integer)
returns setof public.workspace_assets language plpgsql security definer set search_path='' as $$
declare saved public.workspace_assets; item jsonb; point jsonb; points integer:=0;
begin
  if not public.can_edit_workspace(p_channel) then raise exception 'WORKSPACE_FORBIDDEN' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>65536 then raise exception 'WORKSPACE_INVALID'; end if;
  if p_kind='resources' then
    if jsonb_typeof(p_content->'items') is distinct from 'array' then raise exception 'WORKSPACE_INVALID'; end if;
    if jsonb_array_length(p_content->'items')>30 then raise exception 'WORKSPACE_INVALID'; end if;
    for item in select value from jsonb_array_elements(p_content->'items') loop
      if public.try_uuid(item->>'id') is null or jsonb_typeof(item->'title') is distinct from 'string' or length(btrim(item->>'title')) not between 1 and 160
        or jsonb_typeof(item->'url') is distinct from 'string' or length(item->>'url')>1000 or item->>'url' !~ '^https://[^[:space:]"''<>]+$'
        or jsonb_typeof(item->'description') is distinct from 'string' or length(item->>'description')>300 then raise exception 'WORKSPACE_INVALID'; end if;
      if public.automod_match((item->>'title')||' '||(item->>'url')||' '||(item->>'description'),array['phishing']) is not null then raise exception 'AUTOMOD_BLOCKED'; end if;
    end loop;
    if (select count(distinct value->>'id') from jsonb_array_elements(p_content->'items'))<>jsonb_array_length(p_content->'items') then raise exception 'WORKSPACE_INVALID'; end if;
  elsif p_kind='whiteboard' then
    if jsonb_typeof(p_content->'strokes') is distinct from 'array' then raise exception 'WORKSPACE_INVALID'; end if;
    if jsonb_array_length(p_content->'strokes')>100 then raise exception 'WORKSPACE_INVALID'; end if;
    for item in select value from jsonb_array_elements(p_content->'strokes') loop
      if public.try_uuid(item->>'id') is null or coalesce(item->>'color','') not in ('#142138','#b91c1c','#1d4ed8','#047857','#854d0e')
        or jsonb_typeof(item->'width') is distinct from 'number' or jsonb_typeof(item->'points') is distinct from 'array' then raise exception 'WORKSPACE_INVALID'; end if;
      if (item->>'width')::numeric not between 1 and 12 or jsonb_array_length(item->'points') not between 1 and 256 then raise exception 'WORKSPACE_INVALID'; end if;
      points:=points+jsonb_array_length(item->'points');
      for point in select value from jsonb_array_elements(item->'points') loop
        if jsonb_typeof(point) is distinct from 'array' then raise exception 'WORKSPACE_INVALID'; end if;
        if jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'WORKSPACE_INVALID'; end if;
        if (point->>0)::numeric not between 0 and 1200 or (point->>1)::numeric not between 0 and 800 then raise exception 'WORKSPACE_INVALID'; end if;
      end loop;
    end loop;
    if points>2500 or (select count(distinct value->>'id') from jsonb_array_elements(p_content->'strokes'))<>jsonb_array_length(p_content->'strokes') then raise exception 'WORKSPACE_INVALID'; end if;
  else raise exception 'WORKSPACE_INVALID'; end if;
  perform 1 from public.channels where id=p_channel for update;
  select * into saved from public.workspace_assets where channel_id=p_channel and kind=p_kind;
  if coalesce(saved.revision,0)<>p_revision then raise exception 'WORKSPACE_CONFLICT' using errcode='40001'; end if;
  insert into public.workspace_assets(channel_id,kind,content,updated_by) values(p_channel,p_kind,p_content,(select auth.uid()))
    on conflict(channel_id,kind) do update set content=excluded.content,revision=public.workspace_assets.revision+1,updated_by=excluded.updated_by,updated_at=now()
    returning * into saved;
  return next saved;
end;
$$;
revoke all on function public.save_workspace_asset(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.save_workspace_asset(uuid,text,jsonb,integer) to authenticated;
alter publication supabase_realtime add table public.workspace_assets;

-- ===================== 20261014070000_event_capacity.sql =====================
-- Additive RSVP accounting; updates serialize on the event row to prevent overbooking.
alter table public.server_events add column capacity integer check(capacity between 1 and 10000);
alter table public.server_events add column rsvp_count integer not null default 0 check(rsvp_count>=0);
update public.server_events e set rsvp_count=(select count(*) from public.event_rsvps r where r.event_id=e.id);
alter table public.server_events add constraint event_capacity_bound check(capacity is null or rsvp_count<=capacity);
create function public.guard_event_count() returns trigger language plpgsql set search_path='' as $$
begin
  if (select auth.uid()) is not null and pg_trigger_depth()=1 then
    if (tg_op='INSERT' and new.rsvp_count<>0) or (tg_op='UPDATE' and new.rsvp_count<>old.rsvp_count) then
      raise exception 'EVENT_COUNT_IMMUTABLE' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger event_count_guard before insert or update on public.server_events for each row execute function public.guard_event_count();
create function public.update_event_count() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    update public.server_events set rsvp_count=rsvp_count+1 where id=new.event_id and (capacity is null or rsvp_count<capacity);
    if not found then raise exception 'EVENT_FULL' using errcode='23514'; end if;
  else
    update public.server_events set rsvp_count=greatest(0,rsvp_count-1) where id=old.event_id;
  end if;
  return null;
end;
$$;
-- AFTER excludes ignored duplicate RSVPs from the count (INSERT ON CONFLICT DO NOTHING).
create trigger event_rsvp_count after insert or delete on public.event_rsvps for each row execute function public.update_event_count();
revoke all on function public.guard_event_count(), public.update_event_count() from public,anon,authenticated;

-- Only the caller's own RSVP is returned. Counts are independent of PostgREST's row limit.
create function public.list_server_events(p_server uuid)
returns table(id uuid,server_id uuid,channel_id uuid,location text,name text,description text,starts_at timestamptz,ends_at timestamptz,created_by uuid,created_at timestamptz,capacity integer,rsvp_count integer,interested boolean)
language sql stable security invoker set search_path='' as $$
  select e.id,e.server_id,e.channel_id,e.location,e.name,e.description,e.starts_at,e.ends_at,e.created_by,e.created_at,e.capacity,e.rsvp_count,
    exists(select 1 from public.event_rsvps r where r.event_id=e.id and r.user_id=(select auth.uid()))
  from public.server_events e where e.server_id=p_server and public.mfa_ok() and not public.is_platform_banned()
    and coalesce(e.ends_at,e.starts_at+interval '4 hours')>now()
  order by e.starts_at,e.id limit 200;
$$;
revoke all on function public.list_server_events(uuid) from public,anon;
grant execute on function public.list_server_events(uuid) to authenticated;

-- ===================== 20261014080000_account_export_sync.sql (as export_my_data_base) =====================
-- Extends the existing private export without changing its earlier fields.
-- =====================================================================================
-- "Request all of my data": one JSON document of everything this account wrote or set —
-- profile, servers, messages, DMs, reactions, friends, blocks, notes, nicknames, saved
-- messages, poll votes, event RSVPs, warnings received, LFG posts, problem reports and
-- settings. Other people's content (beyond who you're connected to) isn't included.
-- =====================================================================================

create or replace function public.export_my_data_base()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.mfa_ok() or public.is_platform_banned() then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'account_state', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'updated_at', s.updated_at)) from public.account_state s where s.user_id=me), '[]'),
    'privacy', (select to_jsonb(ps) - 'user_id' from public.privacy_settings ps where ps.user_id = me),
    'servers', coalesce((
      select jsonb_agg(jsonb_build_object('server_id', s.id, 'name', s.name, 'role', m.role, 'nickname', m.nickname, 'joined_at', m.joined_at, 'owner', coalesce(s.owner_id = me, false)) order by m.joined_at)
      from public.members m join public.servers s on s.id = m.server_id where m.user_id = me), '[]'),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'server', s.name, 'channel', c.name, 'content', x.content, 'title', x.title, 'attachments', x.attachments, 'sticker', x.sticker, 'reply_to_id', x.reply_to_id, 'thread_id', x.thread_id, 'created_at', x.created_at, 'edited_at', x.edited_at) order by x.created_at)
      from (select * from public.messages where author_id = me order by created_at desc limit 50000) x
      join public.channels c on c.id = x.channel_id join public.servers s on s.id = x.server_id), '[]'),
    'direct_messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'conversation_id', d.conversation_id, 'content', d.content, 'sticker', d.sticker, 'attachments', d.attachments, 'created_at', d.created_at, 'edited_at', d.edited_at) order by d.created_at)
      from (select * from public.direct_messages where author_id = me order by created_at desc limit 50000) d), '[]'),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('message_id', r.message_id, 'emoji', r.emoji, 'created_at', r.created_at)) from public.reactions r where r.user_id = me), '[]'),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('username', p.username, 'status', f.status, 'requested_by_me', f.requested_by = me, 'since', coalesce(f.accepted_at, f.created_at)))
      from public.friendships f join public.profiles p on p.id = case when f.user_low = me then f.user_high else f.user_low end
      where me in (f.user_low, f.user_high)), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'since', b.created_at)) from public.user_blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = me), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('about', p.username, 'note', n.note, 'updated_at', n.updated_at)) from public.user_notes n join public.profiles p on p.id = n.target_id where n.owner_id = me), '[]'),
    'friend_nicknames', coalesce((select jsonb_agg(jsonb_build_object('for', p.username, 'nickname', n.nickname)) from public.friend_nicknames n join public.profiles p on p.id = n.target_id where n.owner_id = me), '[]'),
    'saved_messages', coalesce((select jsonb_agg(jsonb_build_object('message_id', sm.message_id, 'saved_at', sm.saved_at)) from public.saved_messages sm where sm.user_id = me), '[]'),
    'poll_votes', coalesce((select jsonb_agg(jsonb_build_object('message_id', v.message_id, 'option', v.option, 'created_at', v.created_at)) from public.poll_votes v where v.user_id = me), '[]'),
    'event_rsvps', coalesce((select jsonb_agg(jsonb_build_object('event', e.name, 'starts_at', e.starts_at)) from public.event_rsvps r join public.server_events e on e.id = r.event_id where r.user_id = me), '[]'),
    'warnings_received', coalesce((select jsonb_agg(jsonb_build_object('server', s.name, 'reason', w.reason, 'created_at', w.created_at)) from public.member_warnings w join public.servers s on s.id = w.server_id where w.user_id = me), '[]'),
    'lfg_posts', coalesce((select jsonb_agg(jsonb_build_object('game', l.game, 'description', l.description, 'created_at', l.created_at)) from public.lfg_beacons l where l.author_id = me), '[]'),
    'problem_reports', coalesce((select jsonb_agg(jsonb_build_object('category', pr.category, 'description', pr.description, 'status', pr.status, 'created_at', pr.created_at)) from public.problem_reports pr where pr.reporter_id = me), '[]')
  );
end;
$$;

-- ===================== 20261014090000_account_cleanup.sql =====================
-- Auth-user deletion nulls event attribution; signed-in clients still cannot change creators.
create or replace function public.server_events_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.server_id<>old.server_id or new.created_at<>old.created_at
    or (new.created_by is distinct from old.created_by and ((select auth.uid()) is not null or new.created_by is not null)) then
    raise exception 'EVENT_IMMUTABLE_FIELD' using errcode='42501';
  end if;
  return new;
end;
$$;

create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_username text;
  owned record;
  heir uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.mfa_ok() then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  select p.username into my_username from public.profiles p where p.id = me;
  if my_username is null or lower(btrim(coalesce(p_confirm, ''))) <> lower(my_username) then
    raise exception 'CONFIRMATION_MISMATCH' using errcode = '22023';
  end if;

  for owned in select s.id from public.servers s where s.owner_id = me loop
    heir := null;
    select m.user_id into heir
    from public.members m
    where m.server_id = owned.id and m.user_id <> me
    order by m.role desc, m.joined_at asc
    limit 1;
    if heir is null then
      delete from public.servers where id = owned.id;
    else
      update public.servers set owner_id = heir where id = owned.id;
    end if;
  end loop;

  delete from public.messages where author_id = me and jsonb_array_length(attachments) > 0;
  delete from public.direct_messages where author_id = me and jsonb_array_length(attachments) > 0;

  -- The cascade nulls author_id on my remaining messages and removes my memberships; user-facing
  -- guards forbid both for signed-in callers. Identity and confirmation are checked above, so finish
  -- as the system (auth.uid() reads these claims) for the rest of this transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  delete from auth.users where id = me;
end;
$$;

-- ===================== 20261107000000_release_announcements.sql =====================
-- =====================================================================================
-- Official release announcements: when a production deployment of Diskarte starts serving, the
-- server posts that release's developer-written notes (diskarte/src/content/releases.json) to
-- Diskarte HQ #announcements as "Diskarte Updates" — once per release, never for an older release
-- after a newer one (rollbacks), and only through the service role. Super admins can withdraw a post
-- or reset it so corrected notes are published again.
-- =====================================================================================

-- One row per announced release. Readable by everyone signed in (the What's New status); written only
-- by the definer functions below.
create table public.release_announcements (
  release_id text primary key check (release_id ~ '^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,60}$'),
  released_on date not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  message_id uuid references public.messages (id) on delete set null,
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
alter table public.release_announcements enable row level security;
create policy "signed-in users read release announcements" on public.release_announcements
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.release_announcements from anon, authenticated;

-- Posts a release's notes to Diskarte HQ #announcements, at most once. Service role only (the
-- deployment's own server). Returns 'published', 'already-published' or 'superseded'.
create or replace function public.publish_release_announcement(p_release_id text, p_released_on date, p_title text, p_content text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  original text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  posted uuid;
begin
  if p_content is null or char_length(btrim(p_content)) not between 1 and 4000 then
    raise exception 'INVALID_CONTENT' using errcode = '22023';
  end if;
  -- Serialize publishers (several instances of a new deployment can start at once).
  perform pg_advisory_xact_lock(hashtext('diskarte:release-announcements'));
  if exists (select 1 from public.release_announcements r where r.release_id = p_release_id) then
    return 'already-published';
  end if;
  -- An instance of an older deployment (a rollback) never announces after a newer release.
  if exists (select 1 from public.release_announcements r where r.released_on > p_released_on) then
    return 'superseded';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('diskarte.system_post', 'on', true);
  insert into public.messages (channel_id, server_id, author_id, content, webhook_name)
  values ('d15ca47e-0000-4000-8000-0000000000a1', public.system_server_id(), null, btrim(p_content), 'Diskarte Updates')
  returning id into posted;
  perform set_config('diskarte.system_post', '', true);
  perform set_config('request.jwt.claim.sub', original, true);
  insert into public.release_announcements (release_id, released_on, title, message_id)
  values (p_release_id, p_released_on, btrim(p_title), posted);
  return 'published';
end;
$$;
revoke all on function public.publish_release_announcement(text, date, text, text) from public, anon, authenticated;
grant execute on function public.publish_release_announcement(text, date, text, text) to service_role;

-- Removes a release's post and keeps the record, so it isn't published again automatically.
create or replace function public.admin_withdraw_release_announcement(p_release_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform public.assert_super_admin();
  select * into r from public.release_announcements where release_id = p_release_id for update;
  if not found then
    raise exception 'RELEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if r.message_id is not null then
    delete from public.messages where id = r.message_id;
  end if;
  update public.release_announcements set message_id = null, withdrawn_at = coalesce(withdrawn_at, now()) where release_id = p_release_id;
  perform public.admin_log('release.withdraw', null, jsonb_build_object('release', p_release_id));
end;
$$;
revoke all on function public.admin_withdraw_release_announcement(text) from public, anon;
grant execute on function public.admin_withdraw_release_announcement(text) to authenticated;

-- Removes a release's post and its record, so corrected notes can be published again.
create or replace function public.admin_reset_release_announcement(p_release_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform public.assert_super_admin();
  delete from public.release_announcements where release_id = p_release_id returning * into r;
  if r.message_id is not null then
    delete from public.messages where id = r.message_id;
  end if;
  perform public.admin_log('release.reset', null, jsonb_build_object('release', p_release_id));
end;
$$;
revoke all on function public.admin_reset_release_announcement(text) from public, anon;
grant execute on function public.admin_reset_release_announcement(text) to authenticated;

-- ===================== postchecks =====================
do $$
declare
  expected constant jsonb := '{
    "col": "411:58e6a5f5473c8889e192a88653c7c413",
    "con": "335:07e3d9fe1eb8263e968def4ddcb611ad",
    "fn": "208:03b913305c1d47a97b60a765fd017c4a",
    "fnacl": "208:24a2de76cd4cf65f35b3d9a916156292",
    "idx": "140:b7e500caa14a695d9bb8acdf553adc1a",
    "pol": "118:0fe63331e1d8010370f4a409c9226c8a",
    "pub": "1:c9d73134fa24dabf86c4ff39eaeb7747",
    "rls": "58:ea23e9b797e91a9febcce8eacfd24062",
    "tblacl": "58:9d6279a56503af95c0119f370939ab71",
    "trg": "67:6994b7b803a46d73081598d584896f41"
  }';
  actual jsonb := (select jsonb_object_agg(cat, n || ':' || h) from catchup_fingerprint);
begin
  if actual is distinct from expected then
    raise exception 'catch-up postcheck failed: schema differs in %',
      (select string_agg(k, ', ') from jsonb_object_keys(expected) k where actual -> k is distinct from expected -> k);
  end if;
  if (select direct_messages from catchup_counts) <> (select count(*) from public.direct_messages)
      or (select server_events from catchup_counts) <> (select count(*) from public.server_events) then
    raise exception 'catch-up postcheck failed: row counts changed';
  end if;
  if exists (select 1 from public.server_events e
      where e.rsvp_count <> (select count(*) from public.event_rsvps r where r.event_id = e.id)) then
    raise exception 'catch-up postcheck failed: rsvp counts are wrong';
  end if;
  if exists (select 1 from public.release_announcements) then
    raise exception 'catch-up postcheck failed: a release announcement exists';
  end if;
end;
$$;

drop view catchup_fingerprint;
commit;
