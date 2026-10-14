-- =====================================================================================
-- Tambayan discovery (Explore): admins can list their server publicly with a category. Anyone
-- signed in can browse and search listed servers and join without an invite. Nothing about
-- unlisted servers is ever returned; joining goes through join_server() (bans, server limit).
-- =====================================================================================

alter table public.servers
  add column is_public boolean not null default false,
  add column category text not null default 'other'
    check (category in ('gaming', 'study', 'creators', 'friends', 'music', 'tech', 'anime', 'sports', 'other'));

create index servers_public_idx on public.servers (category) where is_public;

/** Listed servers, most active first. `p_query` matches name or description. */
create or replace function public.discover_servers(p_query text default '', p_category text default null, p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, name text, description text, icon_url text, category text, member_count bigint, active_members bigint, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.description, s.icon_url, s.category,
         (select count(*) from public.members m where m.server_id = s.id) as member_count,
         (select count(distinct x.author_id) from public.messages x where x.server_id = s.id and x.created_at > now() - interval '7 days') as active_members,
         public.is_server_member(s.id) as is_member
  from public.servers s
  where s.is_public and not s.is_system
    and (p_category is null or s.category = p_category)
    and (coalesce(btrim(p_query), '') = '' or s.name ilike '%' || btrim(p_query) || '%' or s.description ilike '%' || btrim(p_query) || '%')
  order by active_members desc, member_count desc, s.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 60) offset greatest(coalesce(p_offset, 0), 0);
$$;

/** Join a listed server without an invite (same rules as joining by invite). */
create or replace function public.join_public_server(p_server uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  select s.invite_code into code from public.servers s where s.id = p_server and s.is_public and not s.is_system;
  if code is null then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return public.join_server(code);
end;
$$;

revoke execute on function public.discover_servers(text, text, integer, integer), public.join_public_server(uuid) from public, anon;
grant execute on function public.discover_servers(text, text, integer, integer), public.join_public_server(uuid) to authenticated;
