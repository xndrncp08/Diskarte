-- =====================================================================================
-- Polls (Discord's): a message whose text is the question, with 2–10 answers, single or
-- multiple choice, open for a set time. One vote row per answer picked; results update live.
-- =====================================================================================

alter table public.messages add column has_poll boolean not null default false;

create table public.polls (
  message_id uuid primary key references public.messages (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  options text[] not null check (cardinality(options) between 2 and 10),
  multi boolean not null default false,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.poll_votes (
  message_id uuid not null references public.polls (message_id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  option smallint not null check (option between 0 and 9),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, option)
);
create index poll_votes_channel_idx on public.poll_votes (channel_id);

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
revoke all on table public.polls, public.poll_votes from anon, authenticated;
grant select on table public.polls, public.poll_votes to authenticated;

create policy "readers see polls"
  on public.polls for select to authenticated
  using (public.can_view_channel(channel_id));
create policy "readers see votes"
  on public.poll_votes for select to authenticated
  using (public.can_view_channel(channel_id));

-- Live results ride the channel's chat feed.
alter publication supabase_realtime add table public.polls, public.poll_votes;

/** Post a poll: the question is the message text (so slow mode, AutoMod and read-only channels apply). */
create or replace function public.create_poll(p_channel uuid, p_question text, p_options text[], p_multi boolean, p_hours integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch record;
  cleaned text[];
  new_id uuid;
begin
  select c.id, c.server_id, c.type into ch from public.channels c where c.id = p_channel;
  if ch.id is null or ch.type <> 'text' or not public.is_server_member(ch.server_id) or not public.can_view_channel(p_channel) or public.is_platform_banned() then
    raise exception 'CANNOT_POST' using errcode = '42501';
  end if;
  select array_agg(btrim(o)) into cleaned from unnest(p_options) as o where btrim(o) <> '';
  if cardinality(cleaned) is null or cardinality(cleaned) < 2 or cardinality(cleaned) > 10
     or exists (select 1 from unnest(cleaned) as o where char_length(o) > 55) then
    raise exception 'INVALID_POLL_OPTIONS' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_question, ''))) not between 1 and 300 then
    raise exception 'INVALID_POLL_QUESTION' using errcode = '22023';
  end if;
  if p_hours not in (1, 4, 8, 24, 72, 168) then
    raise exception 'INVALID_POLL_DURATION' using errcode = '22023';
  end if;
  insert into public.messages (channel_id, server_id, author_id, content, has_poll)
  values (p_channel, ch.server_id, (select auth.uid()), btrim(p_question), true)
  returning id into new_id;
  insert into public.polls (message_id, channel_id, options, multi, ends_at)
  values (new_id, p_channel, cleaned, coalesce(p_multi, false), now() + make_interval(hours => p_hours));
  return new_id;
end;
$$;

/** Set my answers (replaces any earlier ones); empty clears my vote. Only while the poll is open. */
create or replace function public.vote_poll(p_message uuid, p_options smallint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll record;
  me uuid := (select auth.uid());
begin
  select p.message_id, p.channel_id, p.options, p.multi, p.ends_at into poll from public.polls p where p.message_id = p_message;
  if poll.message_id is null or not public.can_view_channel(poll.channel_id) or public.is_platform_banned() then
    raise exception 'CANNOT_VOTE' using errcode = '42501';
  end if;
  if poll.ends_at <= now() then
    raise exception 'POLL_CLOSED' using errcode = '22023';
  end if;
  if (not poll.multi and cardinality(coalesce(p_options, '{}')) > 1)
     or exists (select 1 from unnest(coalesce(p_options, '{}')) as o where o < 0 or o >= cardinality(poll.options)) then
    raise exception 'INVALID_VOTE' using errcode = '22023';
  end if;
  delete from public.poll_votes where message_id = p_message and user_id = me;
  insert into public.poll_votes (message_id, channel_id, user_id, option)
  select p_message, poll.channel_id, me, o from (select distinct unnest(coalesce(p_options, '{}')) as o) v;
end;
$$;

revoke execute on function public.create_poll(uuid, text, text[], boolean, integer), public.vote_poll(uuid, smallint[]) from public, anon;
grant execute on function public.create_poll(uuid, text, text[], boolean, integer), public.vote_poll(uuid, smallint[]) to authenticated;
