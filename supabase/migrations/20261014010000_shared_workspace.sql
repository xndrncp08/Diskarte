alter table public.audit_logs drop constraint audit_logs_target_type_check;
alter table public.audit_logs add constraint audit_logs_target_type_check check (target_type in ('member','channel','message','server','badge','soundboard','lfg','workspace'));

create table public.workspace_documents (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  kind text not null check (kind in ('note', 'board', 'focus')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 65536),
  revision integer not null default 1 check (revision > 0),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspace_documents_channel_idx on public.workspace_documents(channel_id, updated_at desc);
alter table public.workspace_documents enable row level security;
revoke all on public.workspace_documents from anon, authenticated;
grant select on public.workspace_documents to authenticated;
create policy "channel readers see workspace" on public.workspace_documents for select to authenticated
  using (public.can_view_channel(channel_id) and (select public.mfa_ok()));

create or replace function public.can_edit_workspace(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select public.mfa_ok()) and not public.is_platform_banned() and exists (
    select 1 from public.channels c where c.id = p_channel and public.can_view_channel(c.id)
      and not public.member_timed_out(c.server_id, (select auth.uid()))
      and (not c.read_only or public.has_server_role(c.server_id, 'admin'))
      and (not c.requires_verification or public.is_verified_user() or public.has_server_role(c.server_id, 'moderator'))
  );
$$;

create or replace function public.save_workspace_document(
  p_channel uuid, p_kind text, p_title text, p_content jsonb,
  p_id uuid default null, p_revision integer default 0, p_timer text default null
) returns setof public.workspace_documents
language plpgsql security definer set search_path = '' as $$
declare
  server uuid;
  saved public.workspace_documents;
  card jsonb;
  payload jsonb := p_content;
begin
  if p_revision is null or p_revision < 0 then raise exception 'WORKSPACE_INVALID'; end if;
  if not public.can_edit_workspace(p_channel) then raise exception 'WORKSPACE_FORBIDDEN' using errcode = '42501'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 or payload is null
    or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 65536 then
    raise exception 'WORKSPACE_INVALID' using errcode = '22023';
  end if;
  if p_kind = 'note' then
    if jsonb_typeof(payload->'text') is distinct from 'string' or char_length(payload->>'text') > 20000 then raise exception 'WORKSPACE_INVALID'; end if;
    payload := jsonb_build_object('text', payload->>'text');
  elsif p_kind = 'board' then
    if jsonb_typeof(payload->'cards') is distinct from 'array' then raise exception 'WORKSPACE_INVALID'; end if;
    if jsonb_array_length(payload->'cards') > 200 then raise exception 'WORKSPACE_INVALID'; end if;
    for card in select value from jsonb_array_elements(payload->'cards') loop
      if public.try_uuid(card->>'id') is null or jsonb_typeof(card->'title') is distinct from 'string'
        or char_length(btrim(card->>'title')) not between 1 and 160 or coalesce(card->>'status', '') not in ('todo', 'doing', 'done') then raise exception 'WORKSPACE_INVALID'; end if;
    end loop;
    if (select count(distinct value->>'id') from jsonb_array_elements(payload->'cards')) <> jsonb_array_length(payload->'cards') then raise exception 'WORKSPACE_INVALID'; end if;
    payload := jsonb_build_object('cards', payload->'cards');
  elsif p_kind = 'focus' then
    if jsonb_typeof(payload->'goal') is distinct from 'string' or char_length(payload->>'goal') > 200
      or jsonb_typeof(payload->'minutes') is distinct from 'number' then raise exception 'WORKSPACE_INVALID'; end if;
    if (payload->>'minutes')::numeric not between 1 and 120 or trunc((payload->>'minutes')::numeric) <> (payload->>'minutes')::numeric then raise exception 'WORKSPACE_INVALID'; end if;
    payload := jsonb_build_object('goal', payload->>'goal', 'minutes', (payload->>'minutes')::integer, 'endsAt', null);
  else raise exception 'WORKSPACE_INVALID';
  end if;
  if p_revision = 0 then
    if p_timer is not null then raise exception 'WORKSPACE_INVALID'; end if;
    -- Serialise the document count so concurrent creates cannot bypass the per-channel bound.
    select c.server_id into server from public.channels c where c.id = p_channel for update;
    if (select count(*) from public.workspace_documents d where d.channel_id = p_channel) >= 50 then raise exception 'WORKSPACE_LIMIT'; end if;
    insert into public.workspace_documents(id, server_id, channel_id, kind, title, content)
      values (coalesce(p_id, gen_random_uuid()), server, p_channel, p_kind, btrim(p_title), payload) returning * into saved;
    perform public.log_audit(server, 'workspace.create', 'workspace', saved.id, jsonb_build_object('kind', p_kind));
  else
    select * into saved from public.workspace_documents d where d.id = p_id and d.channel_id = p_channel for update;
    if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
    if saved.revision <> p_revision then raise exception 'WORKSPACE_CONFLICT' using errcode = '40001'; end if;
    if saved.kind <> p_kind then raise exception 'WORKSPACE_INVALID'; end if;
    if p_kind = 'focus' then
      if p_timer = 'start' then payload := jsonb_set(payload, '{endsAt}', to_jsonb(now() + make_interval(mins => (payload->>'minutes')::integer)));
      elsif p_timer = 'reset' then null;
      elsif p_timer is null then payload := jsonb_set(payload, '{endsAt}', coalesce(saved.content->'endsAt', 'null'::jsonb));
      else raise exception 'WORKSPACE_INVALID'; end if;
    elsif p_timer is not null then raise exception 'WORKSPACE_INVALID'; end if;
    update public.workspace_documents set title = btrim(p_title), content = payload,
      revision = revision + 1, updated_by = (select auth.uid()), updated_at = now() where id = saved.id returning * into saved;
  end if;
  return next saved;
end;
$$;

create or replace function public.delete_workspace_document(p_id uuid, p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare doc public.workspace_documents;
begin
  if p_revision is null then raise exception 'WORKSPACE_INVALID'; end if;
  select * into doc from public.workspace_documents d where d.id = p_id for update;
  if not found or not public.can_edit_workspace(doc.channel_id)
    or not (doc.created_by = (select auth.uid()) or public.has_server_role(doc.server_id, 'moderator')) then
    raise exception 'WORKSPACE_FORBIDDEN' using errcode = '42501';
  end if;
  if doc.revision <> p_revision then raise exception 'WORKSPACE_CONFLICT' using errcode = '40001'; end if;
  delete from public.workspace_documents where id = p_id;
  perform public.log_audit(doc.server_id, 'workspace.delete', 'workspace', p_id);
end;
$$;
revoke execute on function public.can_edit_workspace(uuid), public.save_workspace_document(uuid,text,text,jsonb,uuid,integer,text), public.delete_workspace_document(uuid,integer) from public, anon;
grant execute on function public.can_edit_workspace(uuid), public.save_workspace_document(uuid,text,text,jsonb,uuid,integer,text), public.delete_workspace_document(uuid,integer) to authenticated;
alter publication supabase_realtime add table public.workspace_documents;
