-- =====================================================================================
-- Invite links with an expiry and a use limit (Discord's "Edit invite link"). The server's
-- permanent invite_code keeps working; these are extra codes any member can create.
-- Moderators see and revoke every invite; members see and revoke their own.
-- =====================================================================================

create table public.server_invites (
  code text primary key default public.generate_invite_code(),
  server_id uuid not null references public.servers (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete cascade default auth.uid(),
  max_uses integer check (max_uses is null or max_uses between 1 and 100),
  uses integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index server_invites_server_idx on public.server_invites (server_id, created_at desc);
create index server_invites_creator_idx on public.server_invites (created_by);

alter table public.server_invites enable row level security;
revoke all on table public.server_invites from anon, authenticated;
grant select on table public.server_invites to authenticated;

create policy "creators and moderators see invites"
  on public.server_invites for select to authenticated
  using (created_by = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

/** Still usable? */
create or replace function public.invite_is_live(i public.server_invites)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (i.expires_at is null or i.expires_at > now()) and (i.max_uses is null or i.uses < i.max_uses);
$$;

/** New invite: expires after 30 min, 1 h, 6 h, 12 h, 1 day, 7 days or never (0); 1–100 uses or unlimited (0). */
create or replace function public.create_invite(p_server uuid, p_max_age_minutes integer, p_max_uses integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  if not public.is_server_member(p_server) or public.is_platform_banned()
     or exists (select 1 from public.servers s where s.id = p_server and s.is_system) then
    raise exception 'CANNOT_CREATE_INVITE' using errcode = '42501';
  end if;
  if p_max_age_minutes not in (0, 30, 60, 360, 720, 1440, 10080) or p_max_uses not in (0, 1, 5, 10, 25, 50, 100) then
    raise exception 'INVALID_INVITE_SETTINGS' using errcode = '22023';
  end if;
  if (select count(*) from public.server_invites i where i.server_id = p_server and public.invite_is_live(i)) >= 200 then
    raise exception 'TOO_MANY_INVITES' using errcode = '53400';
  end if;
  insert into public.server_invites (server_id, created_by, max_uses, expires_at)
  values (p_server, (select auth.uid()), nullif(p_max_uses, 0),
          case when p_max_age_minutes = 0 then null else now() + make_interval(mins => p_max_age_minutes) end)
  returning code into new_code;
  return new_code;
end;
$$;

create or replace function public.revoke_invite(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.server_invites i
  where i.code = p_code
    and (i.created_by = (select auth.uid()) or public.has_server_role(i.server_id, 'moderator'));
  if not found then
    raise exception 'CANNOT_REVOKE_INVITE' using errcode = '42501';
  end if;
end;
$$;

-- Preview: the permanent code, or a live invite.
create or replace function public.get_invite(p_code text)
returns table (server_id uuid, name text, description text, icon_url text, member_count bigint, already_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.description, s.icon_url,
         (select count(*) from public.members m where m.server_id = s.id),
         public.is_server_member(s.id)
  from public.servers s
  where s.invite_code = upper(btrim(p_code))
     or s.id = (select i.server_id from public.server_invites i where i.code = upper(btrim(p_code)) and public.invite_is_live(i))
  limit 1;
$$;

-- Joining with a limited invite uses it up (rejoining as a member doesn't).
create or replace function public.join_server(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  invite public.server_invites;
  joined int;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select s.id into target from public.servers s where s.invite_code = upper(btrim(p_code));
  if target is null then
    select * into invite from public.server_invites i where i.code = upper(btrim(p_code)) for update;
    if invite.code is null or not public.invite_is_live(invite) then
      raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
    end if;
    target := invite.server_id;
  end if;
  if exists (select 1 from public.server_bans b where b.server_id = target and b.user_id = caller) then
    raise exception 'BANNED' using errcode = '42501';
  end if;
  if public.is_server_member(target) then
    return target;
  end if;
  select count(*) into joined from public.members m where m.user_id = caller;
  if joined >= 100 then
    raise exception 'SERVER_JOIN_LIMIT' using errcode = '53400';
  end if;
  insert into public.members (server_id, user_id, role)
  values (target, caller, 'member')
  on conflict (server_id, user_id) do nothing;
  if invite.code is not null then
    update public.server_invites set uses = uses + 1 where code = invite.code;
  end if;
  return target;
end;
$$;

revoke execute on function public.create_invite(uuid, integer, integer), public.revoke_invite(text) from public, anon;
grant execute on function public.create_invite(uuid, integer, integer), public.revoke_invite(text) to authenticated;
revoke execute on function public.invite_is_live(public.server_invites) from public, anon;
grant execute on function public.invite_is_live(public.server_invites) to authenticated;
