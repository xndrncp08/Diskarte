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
