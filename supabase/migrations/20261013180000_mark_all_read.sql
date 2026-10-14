-- =====================================================================================
-- Clearing old unreads. A channel you'd never opened counted everything since you joined as
-- unread, so old activity kept showing; this marks that backlog read once. From now on, Discord's
-- "Mark As Read" (one server) and the inbox's "Mark all as read" (every channel + your DMs).
-- =====================================================================================

create or replace function public.mark_all_read(p_server uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    return;
  end if;
  insert into public.channel_reads (user_id, channel_id, last_read_at)
  select me, c.id, now()
  from public.channels c
  join public.members m on m.server_id = c.server_id and m.user_id = me
  where c.type::text in ('text', 'forum')
    and (p_server is null or c.server_id = p_server)
    and public.can_view_channel(c.id)
  on conflict (user_id, channel_id) do update set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at);
  if p_server is null then
    update public.dm_participants set last_read_at = now() where user_id = me;
  end if;
end;
$$;
revoke execute on function public.mark_all_read(uuid) from public, anon;
grant execute on function public.mark_all_read(uuid) to authenticated;

-- One-time: channels nobody has opened yet start out read (their history isn't "new").
insert into public.channel_reads (user_id, channel_id, last_read_at)
select m.user_id, c.id, now()
from public.members m
join public.channels c on c.server_id = m.server_id
where c.type::text in ('text', 'forum')
on conflict (user_id, channel_id) do nothing;
