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
