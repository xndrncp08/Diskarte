-- Scheduled messages for text channels. A scheduled row becomes a normal message at send_at,
-- published as its author so every insert rule (membership, private channels, read-only,
-- timeouts, slow mode, verification, auto-mod) applies exactly as for a live send.
--
-- Delivery: the author's open app publishes its own due messages; the minute platform job
-- (docs/sql/enable-platform-jobs.sql) publishes everyone's, including while the author is away.

create table public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  send_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Set when publishing failed (e.g. timed out, slow mode, lost access); the author can delete it.
  failed_reason text,
  check (send_at <= created_at + interval '30 days')
);

create index scheduled_messages_due_idx on public.scheduled_messages (send_at) where failed_reason is null;
create index scheduled_messages_author_idx on public.scheduled_messages (author_id, channel_id);

alter table public.scheduled_messages enable row level security;
revoke all on table public.scheduled_messages from anon, authenticated;
grant select, insert, delete on table public.scheduled_messages to authenticated;

create policy "authors see their scheduled messages"
  on public.scheduled_messages for select to authenticated
  using (author_id = (select auth.uid()));

create policy "authors schedule in text channels they can post in"
  on public.scheduled_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and failed_reason is null
    and send_at > now()
    and exists (
      select 1 from public.channels c
      where c.id = channel_id and c.type::text = 'text' and public.is_server_member(c.server_id) and public.can_view_channel(c.id)
    )
  );

create policy "authors cancel their scheduled messages"
  on public.scheduled_messages for delete to authenticated
  using (author_id = (select auth.uid()));

-- At most 25 pending per person.
create or replace function public.scheduled_messages_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.scheduled_messages where author_id = new.author_id) >= 25 then
    raise exception 'SCHEDULED_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger scheduled_messages_limit
  before insert on public.scheduled_messages
  for each row execute function public.scheduled_messages_limit();

-- Publishes due scheduled messages: the caller's own when signed in, everyone's when run by the
-- platform job. Returns how many were sent. Each row is attempted in its own subtransaction.
create or replace function public.publish_scheduled_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  original text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  r record;
  inserted integer;
  sent integer := 0;
begin
  for r in
    select s.id, s.author_id, s.channel_id, s.content, c.server_id
    from public.scheduled_messages s
    join public.channels c on c.id = s.channel_id
    where s.send_at <= now() and s.failed_reason is null and (caller is null or s.author_id = caller)
    order by s.send_at
    limit 200
    for update of s skip locked
  loop
    begin
      -- Act as the author so insert triggers and access checks see them.
      perform set_config('request.jwt.claim.sub', r.author_id::text, true);
      if not (public.is_server_member(r.server_id) and public.can_view_channel(r.channel_id)) then
        raise exception 'NO_ACCESS';
      end if;
      insert into public.messages (id, channel_id, server_id, author_id, content)
      values (r.id, r.channel_id, r.server_id, r.author_id, r.content);
      get diagnostics inserted = row_count;
      if inserted = 0 then
        raise exception 'AUTOMOD_BLOCKED';
      end if;
      delete from public.scheduled_messages where id = r.id;
      sent := sent + 1;
    exception when others then
      update public.scheduled_messages set failed_reason = left(sqlerrm, 120) where id = r.id;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', original, true);
  return sent;
end;
$$;

revoke all on function public.publish_scheduled_messages() from public, anon;
grant execute on function public.publish_scheduled_messages() to authenticated, service_role;

-- The minute job for deterministic platform housekeeping (scheduled messages, status expiry).
create or replace function public.tick_platform()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.publish_scheduled_messages();
  perform public.clear_expired_custom_statuses();
end;
$$;

revoke all on function public.tick_platform() from public, anon, authenticated;
grant execute on function public.tick_platform() to service_role;
