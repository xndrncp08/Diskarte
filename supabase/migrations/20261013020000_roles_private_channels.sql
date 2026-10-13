-- =====================================================================================
-- Server roles and private channels.
--
-- Roles: admins create named, coloured roles and hand them to members (on top of the built-in
-- admin / moderator / member ranks, which still decide moderation powers).
-- Private channels: only admins, and people or roles an admin lets in, can see one, read or post
-- in it, react, follow it live or join its voice. Grants are rows, so they persist (a person's
-- grant even survives leaving and rejoining; they still need to be a member to use it).
-- =====================================================================================

create table public.server_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  color text not null default '#94a3b8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, server_id)
);
create unique index server_roles_name_idx on public.server_roles (server_id, lower(btrim(name)));

create table public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (role_id, user_id),
  -- Same server as the role; gone when they leave or the role is deleted.
  foreign key (role_id, server_id) references public.server_roles (id, server_id) on delete cascade,
  foreign key (server_id, user_id) references public.members (server_id, user_id) on delete cascade
);
create index member_roles_server_user_idx on public.member_roles (server_id, user_id);

alter table public.channels add column is_private boolean not null default false;
alter table public.channels add constraint channels_id_server_key unique (id, server_id);

create table public.channel_access (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null,
  server_id uuid not null,
  user_id uuid references public.profiles (id) on delete cascade,
  role_id uuid,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (role_id is null)),
  foreign key (channel_id, server_id) references public.channels (id, server_id) on delete cascade,
  foreign key (role_id, server_id) references public.server_roles (id, server_id) on delete cascade
);
create unique index channel_access_user_idx on public.channel_access (channel_id, user_id) where user_id is not null;
create unique index channel_access_role_idx on public.channel_access (channel_id, role_id) where role_id is not null;

/** Am I let into this private channel: an admin, or granted directly or through a role? */
create or replace function public.has_channel_grant(p_channel_id uuid, p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_server_role(p_server_id, 'admin')
    or exists (select 1 from public.channel_access a where a.channel_id = p_channel_id and a.user_id = (select auth.uid()))
    or exists (
      select 1 from public.channel_access a
      join public.member_roles r on r.role_id = a.role_id and r.user_id = (select auth.uid())
      where a.channel_id = p_channel_id
    );
$$;

/** Can I see this channel? Members see public channels; private ones need has_channel_grant. */
create or replace function public.can_view_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id
      and public.is_server_member(c.server_id)
      and (not c.is_private or public.has_channel_grant(c.id, c.server_id))
  );
$$;
revoke execute on function public.has_channel_grant(uuid, uuid) from public, anon;
grant execute on function public.has_channel_grant(uuid, uuid) to authenticated;
revoke execute on function public.can_view_channel(uuid) from public, anon;
grant execute on function public.can_view_channel(uuid) to authenticated;

/** Only admins make a channel private or public again (moderators can still edit everything else). */
create or replace function public.channels_private_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_private is distinct from old.is_private and not public.has_server_role(new.server_id, 'admin') then
    raise exception 'ONLY_ADMINS_CHANGE_PRIVACY' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger channels_private_guard
  before update on public.channels
  for each row execute function public.channels_private_guard();

-- Moderators can create channels, but only admins create private ones.
create or replace function public.channels_private_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_private and not public.has_server_role(new.server_id, 'admin') then
    raise exception 'ONLY_ADMINS_CHANGE_PRIVACY' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger channels_private_insert_guard
  before insert on public.channels
  for each row execute function public.channels_private_insert_guard();

-- ---- policies -----------------------------------------------------------------------------

alter table public.server_roles enable row level security;
alter table public.member_roles enable row level security;
alter table public.channel_access enable row level security;
revoke all on table public.server_roles, public.member_roles, public.channel_access from anon, authenticated;
grant select, delete on table public.server_roles to authenticated;
grant insert (server_id, name, color, position), update (name, color, position) on table public.server_roles to authenticated;
grant select, insert, delete on table public.member_roles to authenticated;
grant select, insert, delete on table public.channel_access to authenticated;

create policy "members see the server's roles"
  on public.server_roles for select to authenticated
  using (public.is_server_member(server_id));
create policy "admins manage roles"
  on public.server_roles for all to authenticated
  using (public.has_server_role(server_id, 'admin'))
  with check (public.has_server_role(server_id, 'admin'));

create policy "members see who has which role"
  on public.member_roles for select to authenticated
  using (public.is_server_member(server_id));
create policy "admins hand out roles"
  on public.member_roles for all to authenticated
  using (public.has_server_role(server_id, 'admin'))
  with check (public.has_server_role(server_id, 'admin'));

create policy "admins see and manage private channel access"
  on public.channel_access for all to authenticated
  using (public.has_server_role(server_id, 'admin'))
  with check (public.has_server_role(server_id, 'admin'));

drop policy "members can view channels" on public.channels;
-- Reads the row's own columns (not a lookup by id), so a just-inserted channel passes `returning`.
create policy "members can view channels they may see"
  on public.channels for select to authenticated
  using (public.is_server_member(server_id) and (not is_private or public.has_channel_grant(id, server_id)));

drop policy "members read messages" on public.messages;
create policy "members read messages"
  on public.messages for select to authenticated
  using (public.is_server_member(server_id) and public.can_view_channel(channel_id));

drop policy "members send messages as themselves" on public.messages;
create policy "members send messages as themselves"
  on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_server_member(server_id) and public.can_view_channel(channel_id));

drop policy "authors edit, moderators pin" on public.messages;
create policy "authors edit, moderators pin"
  on public.messages for update to authenticated
  using ((author_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator')) and public.can_view_channel(channel_id))
  with check (public.is_server_member(server_id));

drop policy "members read reactions" on public.reactions;
create policy "members read reactions"
  on public.reactions for select to authenticated
  using (public.is_server_member(server_id) and public.can_view_channel(channel_id));

drop policy "members react as themselves" on public.reactions;
create policy "members react as themselves"
  on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_server_member(server_id) and public.can_view_channel(channel_id));

alter publication supabase_realtime add table public.server_roles, public.member_roles;

-- Live updates follow the same rule as reading.
create or replace function public.can_access_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := split_part(p_topic, ':', 1);
  target uuid;
begin
  if kind = 'db' then
    kind := split_part(p_topic, ':', 2);
    target := public.try_uuid(split_part(p_topic, ':', 3));
    if target is null then
      return false;
    end if;
    return case kind
      when 'chat' then public.can_view_channel(target)
      when 'server' then public.is_server_member(target)
      when 'lfg' then public.is_server_member(target)
      when 'dm' then public.is_dm_participant(target)
      when 'memberships' then target = (select auth.uid())
      when 'friends' then target = (select auth.uid())
      when 'dms' then target = (select auth.uid())
      when 'rings' then target = (select auth.uid())
      when 'account' then target = (select auth.uid())
      when 'broadcasts' then target = public.system_server_id() and public.is_server_member(target)
      when 'admin' then target = (select auth.uid()) and public.is_super_admin()
      else false
    end;
  end if;

  target := public.try_uuid(split_part(p_topic, ':', 2));
  if target is null then
    return false;
  end if;
  if kind = 'server' then
    return public.is_server_member(target);
  elsif kind = 'channel' then
    return public.can_view_channel(target);
  elsif kind = 'dm' then
    return public.is_dm_participant(target);
  end if;
  return false;
end;
$$;
