-- =====================================================================================
-- Friend nicknames: a private name you give someone, shown only to you in your friends list
-- and DMs. (Server nicknames are members.nickname, visible to the whole server.)
-- =====================================================================================

create table public.friend_nicknames (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 32),
  primary key (owner_id, target_id),
  check (owner_id <> target_id)
);

alter table public.friend_nicknames enable row level security;
revoke all on table public.friend_nicknames from anon, authenticated;
grant select, insert, update, delete on table public.friend_nicknames to authenticated;

create policy "people manage their own nicknames for others"
  on public.friend_nicknames for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
