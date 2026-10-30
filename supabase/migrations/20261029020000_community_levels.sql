-- Optional community levels. Off by default; admins turn them on per Tambayan. Members earn
-- 15 XP for a message, at most once a minute (so flooding earns nothing), and the level is
-- floor(sqrt(xp / 50)). Turning levels off stops earning and hides them; XP is kept.

alter table public.servers add column levels_enabled boolean not null default false;

create table public.member_xp (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  last_award_at timestamptz,
  primary key (server_id, user_id)
);

create index member_xp_rank_idx on public.member_xp (server_id, xp desc);

alter table public.member_xp enable row level security;
revoke all on table public.member_xp from anon, authenticated;
grant select on table public.member_xp to authenticated;

create policy "members read their server's levels"
  on public.member_xp for select to authenticated
  using (public.is_server_member(server_id));

create or replace function public.award_message_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id is null or not exists (select 1 from public.servers s where s.id = new.server_id and s.levels_enabled) then
    return null;
  end if;
  insert into public.member_xp as x (server_id, user_id, xp, last_award_at)
  values (new.server_id, new.author_id, 15, now())
  on conflict (server_id, user_id) do update
    set xp = x.xp + 15, last_award_at = now()
    where x.last_award_at is null or x.last_award_at <= now() - interval '60 seconds';
  return null;
end;
$$;

create trigger messages_award_xp
  after insert on public.messages
  for each row execute function public.award_message_xp();

-- Admins can start a season over.
create or replace function public.reset_server_xp(p_server uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_server_role(p_server, 'admin') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  delete from public.member_xp where server_id = p_server;
end;
$$;

revoke all on function public.reset_server_xp(uuid) from public, anon;
grant execute on function public.reset_server_xp(uuid) to authenticated;
