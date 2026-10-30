-- Recurring announcements: an admin automation that posts a message in a text channel every day,
-- or every week on one weekday, at a local time in the admin's time zone. The minute platform job
-- posts due ones (as "Announcement", like a webhook post) and records the last run or error.

create table public.server_announcements (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  -- 0 = Sunday … 6 = Saturday; null = every day.
  weekday smallint check (weekday between 0 and 6),
  at_time time not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_error text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index server_announcements_due_idx on public.server_announcements (next_run_at) where enabled;
create index server_announcements_server_idx on public.server_announcements (server_id);

-- The next local `p_time` (on `p_weekday`, if set) strictly after `p_after`, in `p_tz`.
create or replace function public.announcement_next_run(p_weekday smallint, p_time time, p_tz text, p_after timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  day date := (p_after at time zone p_tz)::date;
  candidate timestamp;
begin
  for i in 0..8 loop
    candidate := (day + i) + p_time;
    if (p_weekday is null or extract(dow from candidate) = p_weekday) and (candidate at time zone p_tz) > p_after then
      return candidate at time zone p_tz;
    end if;
  end loop;
  return null;
end;
$$;

-- Validates the channel and time zone and (re)computes next_run_at when the schedule changes.
create or replace function public.server_announcements_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.channels c where c.id = new.channel_id and c.server_id = new.server_id and c.type::text = 'text') then
    raise exception 'NOT_A_TEXT_CHANNEL' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' or (new.weekday, new.at_time, new.time_zone, new.enabled) is distinct from (old.weekday, old.at_time, old.time_zone, old.enabled) then
    new.next_run_at := public.announcement_next_run(new.weekday, new.at_time, new.time_zone, now());
    new.last_error := null;
  end if;
  return new;
end;
$$;

create trigger server_announcements_schedule
  before insert or update on public.server_announcements
  for each row execute function public.server_announcements_schedule();

-- At most 10 per server.
create or replace function public.server_announcements_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.server_announcements where server_id = new.server_id) >= 10 then
    raise exception 'ANNOUNCEMENT_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger server_announcements_limit
  before insert on public.server_announcements
  for each row execute function public.server_announcements_limit();

alter table public.server_announcements enable row level security;
revoke all on table public.server_announcements from anon, authenticated;
grant select, delete on table public.server_announcements to authenticated;
grant insert (server_id, channel_id, content, weekday, at_time, time_zone, enabled) on table public.server_announcements to authenticated;
grant update (channel_id, content, weekday, at_time, time_zone, enabled) on table public.server_announcements to authenticated;

create policy "admins manage their server's announcements"
  on public.server_announcements for all to authenticated
  using (public.has_server_role(server_id, 'admin'))
  with check (public.has_server_role(server_id, 'admin'));

-- Posts every due announcement once and moves it to its next run. Platform job only.
create or replace function public.run_due_announcements()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  posted integer := 0;
  original text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('diskarte.system_post', 'on', true);
  for r in
    select a.* from public.server_announcements a
    where a.enabled and a.next_run_at <= now()
    order by a.next_run_at
    limit 200
    for update skip locked
  loop
    begin
      insert into public.messages (channel_id, server_id, author_id, content, webhook_name)
      values (r.channel_id, r.server_id, null, r.content, 'Announcement');
      update public.server_announcements
      set last_run_at = now(), last_error = null,
          next_run_at = public.announcement_next_run(r.weekday, r.at_time, r.time_zone, greatest(now(), r.next_run_at))
      where id = r.id;
      posted := posted + 1;
    exception when others then
      -- Skip this occurrence but keep the schedule, and say why.
      update public.server_announcements
      set last_error = left(sqlerrm, 120),
          next_run_at = public.announcement_next_run(r.weekday, r.at_time, r.time_zone, greatest(now(), r.next_run_at))
      where id = r.id;
    end;
  end loop;
  perform set_config('diskarte.system_post', '', true);
  perform set_config('request.jwt.claim.sub', original, true);
  return posted;
end;
$$;

revoke all on function public.run_due_announcements() from public, anon, authenticated;
grant execute on function public.run_due_announcements() to service_role;

create or replace function public.tick_platform()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.publish_scheduled_messages();
  perform public.clear_expired_custom_statuses();
  perform public.run_due_announcements();
  delete from public.moments where expires_at < now() - interval '1 day';
end;
$$;
