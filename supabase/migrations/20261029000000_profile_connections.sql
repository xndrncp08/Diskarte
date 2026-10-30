-- Favourite friends, custom statuses that clear themselves, and the mutual friends / shared
-- Tambayans a profile shows.

create table public.friend_favourites (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  check (owner_id <> target_id)
);

alter table public.friend_favourites enable row level security;
revoke all on table public.friend_favourites from anon, authenticated;
grant select, insert, delete on table public.friend_favourites to authenticated;

create policy "people manage their own favourites"
  on public.friend_favourites for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Custom status expiry. Null = until cleared.
alter table public.profiles add column custom_status_expires_at timestamptz;
-- A new status without its own expiry doesn't inherit the old one; a cleared status has none.
create or replace function public.profiles_status_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.custom_status is null and new.custom_status_emoji is null then
    new.custom_status_expires_at := null;
  elsif (new.custom_status, new.custom_status_emoji) is distinct from (old.custom_status, old.custom_status_emoji)
    and new.custom_status_expires_at is not distinct from old.custom_status_expires_at then
    new.custom_status_expires_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_status_expiry
  before update of custom_status, custom_status_emoji, custom_status_expires_at on public.profiles
  for each row execute function public.profiles_status_expiry();

create index profiles_custom_status_expiry_idx on public.profiles (custom_status_expires_at) where custom_status_expires_at is not null;

-- Clears every expired custom status. Idempotent and cheap (partial index); run by the minute
-- platform job and by a signed-in client whose own status just ran out.
create or replace function public.clear_expired_custom_statuses()
returns integer
language sql
security definer
set search_path = ''
as $$
  with cleared as (
    update public.profiles
    set custom_status = null, custom_status_emoji = null, custom_status_expires_at = null
    where custom_status_expires_at is not null and custom_status_expires_at <= now()
    returning 1
  )
  select count(*)::integer from cleared;
$$;

revoke all on function public.clear_expired_custom_statuses() from public, anon;
grant execute on function public.clear_expired_custom_statuses() to authenticated, service_role;

-- What the caller shares with another person: accepted friends in common and Tambayans both
-- belong to. Only ever returns the caller's own friends and servers, and nothing across a block.
create or replace function public.profile_connections(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or p_user = (select auth.uid()) or public.is_blocked_between((select auth.uid()), p_user)
      then jsonb_build_object('mutual_friends', '[]'::jsonb, 'shared_servers', '[]'::jsonb)
    else jsonb_build_object(
      'mutual_friends', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                                            'avatar_url', p.avatar_url, 'avatar_preset', p.avatar_preset) order by p.display_name)
        from public.profiles p
        where p.id not in ((select auth.uid()), p_user)
          and public.are_friends((select auth.uid()), p.id)
          and public.are_friends(p_user, p.id)
      ), '[]'::jsonb),
      'shared_servers', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'icon_url', s.icon_url) order by s.name)
        from public.servers s
        join public.members mine on mine.server_id = s.id and mine.user_id = (select auth.uid())
        join public.members theirs on theirs.server_id = s.id and theirs.user_id = p_user
        where not s.is_system -- everyone shares Diskarte HQ
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.profile_connections(uuid) from public, anon;
grant execute on function public.profile_connections(uuid) to authenticated;
