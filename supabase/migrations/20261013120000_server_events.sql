-- =====================================================================================
-- Scheduled events (Discord's Events): moderators schedule something in a voice channel or
-- somewhere else; members mark themselves Interested. Everyone in the server can see them.
-- =====================================================================================

create table public.server_events (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete set null,
  location text check (location is null or char_length(btrim(location)) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index server_events_server_idx on public.server_events (server_id, starts_at);
create index server_events_channel_idx on public.server_events (channel_id);
create index server_events_creator_idx on public.server_events (created_by);

create table public.event_rsvps (
  event_id uuid not null references public.server_events (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_rsvps_user_idx on public.event_rsvps (user_id);
create index event_rsvps_server_idx on public.event_rsvps (server_id);

alter table public.server_events enable row level security;
alter table public.event_rsvps enable row level security;
revoke all on table public.server_events, public.event_rsvps from anon, authenticated;
grant select, insert, update, delete on table public.server_events to authenticated;
grant select, insert, delete on table public.event_rsvps to authenticated;

create policy "members see events"
  on public.server_events for select to authenticated
  using (public.is_server_member(server_id));
create policy "moderators schedule events"
  on public.server_events for insert to authenticated
  with check (
    public.has_server_role(server_id, 'moderator')
    and created_by = (select auth.uid())
    and starts_at > now() - interval '5 minutes'
    and (channel_id is null or exists (
      select 1 from public.channels c where c.id = channel_id and c.server_id = server_events.server_id and c.type = 'voice'
    ))
  );
create policy "moderators edit events"
  on public.server_events for update to authenticated
  using (public.has_server_role(server_id, 'moderator'))
  with check (
    public.has_server_role(server_id, 'moderator')
    and (channel_id is null or exists (
      select 1 from public.channels c where c.id = channel_id and c.server_id = server_events.server_id and c.type = 'voice'
    ))
  );
create policy "moderators cancel events"
  on public.server_events for delete to authenticated
  using (public.has_server_role(server_id, 'moderator'));

create policy "members see who's interested"
  on public.event_rsvps for select to authenticated
  using (public.is_server_member(server_id));
create policy "members mark themselves interested"
  on public.event_rsvps for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.server_events e where e.id = event_id and e.server_id = event_rsvps.server_id)
    and public.is_server_member(server_id)
  );
create policy "members take back interest"
  on public.event_rsvps for delete to authenticated
  using (user_id = (select auth.uid()));

-- server_id and created_by can't be moved after the fact.
create or replace function public.server_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.server_id <> old.server_id or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'EVENT_IMMUTABLE_FIELD' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger server_events_guard
  before update on public.server_events
  for each row execute function public.server_events_guard();

alter publication supabase_realtime add table public.server_events, public.event_rsvps;
