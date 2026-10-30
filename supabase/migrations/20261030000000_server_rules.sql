-- Server rules: admins write them; members accept them before they can post. Changing the rules
-- asks everyone to accept again. Moderators and up are exempt.

alter table public.servers
  add column rules text check (rules is null or char_length(btrim(rules)) between 1 and 2000),
  add column rules_updated_at timestamptz;

create or replace function public.servers_rules_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rules is distinct from old.rules then
    new.rules_updated_at := case when new.rules is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger servers_rules_stamp
  before update of rules on public.servers
  for each row execute function public.servers_rules_stamp();

create table public.rules_acceptances (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

alter table public.rules_acceptances enable row level security;
revoke all on table public.rules_acceptances from anon, authenticated;
grant select on table public.rules_acceptances to authenticated;

create policy "people see their acceptances; moderators see their server's"
  on public.rules_acceptances for select to authenticated
  using (user_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

-- Must p_user still accept p_server's current rules before posting?
create or replace function public.rules_pending(p_server uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.rules is not null
    and coalesce((select m.role < 'moderator' from public.members m where m.server_id = p_server and m.user_id = p_user), true)
    and not exists (
      select 1 from public.rules_acceptances a
      where a.server_id = p_server and a.user_id = p_user and a.accepted_at >= s.rules_updated_at
    )
  from public.servers s where s.id = p_server;
$$;

revoke all on function public.rules_pending(uuid, uuid) from public, anon, authenticated;

create or replace function public.accept_server_rules(p_server uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_server_member(p_server) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;
  insert into public.rules_acceptances (server_id, user_id) values (p_server, (select auth.uid()))
  on conflict (server_id, user_id) do update set accepted_at = now();
end;
$$;

revoke all on function public.accept_server_rules(uuid) from public, anon;
grant execute on function public.accept_server_rules(uuid) to authenticated;

-- Posting gate. System posts (welcome messages, webhooks, the platform job) have no caller.
create or replace function public.messages_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is not null and public.rules_pending(new.server_id, caller) then
    raise exception 'RULES_NOT_ACCEPTED' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_rules_guard
  before insert on public.messages
  for each row execute function public.messages_rules_guard();
