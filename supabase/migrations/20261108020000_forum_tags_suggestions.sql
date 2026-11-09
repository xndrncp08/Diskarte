-- =====================================================================================
-- Forum tags, solved posts and suggestion boards.
--
-- A forum channel is either a 'discussion' forum (posts can be marked Solved by their author or a
-- moderator) or a 'suggestions' board (members upvote ideas; moderators move them through Under
-- consideration → Planned → In progress → Completed, or Declined). Moderators define up to 12 tags
-- per forum; post authors and moderators pick from them.
--
-- Per-post state lives beside messages (forum_post_state, forum_votes) instead of on the hot
-- messages table; both follow the channel's visibility and disappear with the post.
-- =====================================================================================

alter table public.channels
  add column forum_mode text not null default 'discussion' check (forum_mode in ('discussion', 'suggestions')),
  add column forum_tags text[] not null default '{}'
    check (cardinality(forum_tags) <= 12 and array_position(forum_tags, null) is null);

create table public.forum_post_state (
  message_id uuid primary key references public.messages (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  tags text[] not null default '{}' check (cardinality(tags) <= 5),
  status text check (status in ('solved', 'under_consideration', 'planned', 'in_progress', 'completed', 'declined')),
  status_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index forum_post_state_channel_idx on public.forum_post_state (channel_id);

create table public.forum_votes (
  message_id uuid not null references public.messages (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index forum_votes_channel_idx on public.forum_votes (channel_id);
create index forum_votes_user_idx on public.forum_votes (user_id);

alter table public.forum_post_state enable row level security;
alter table public.forum_votes enable row level security;
revoke all on table public.forum_post_state, public.forum_votes from anon, authenticated;
grant select on table public.forum_post_state, public.forum_votes to authenticated;

create policy "channel viewers see post state" on public.forum_post_state for select to authenticated
  using (public.can_view_channel(channel_id));
create policy "channel viewers see votes" on public.forum_votes for select to authenticated
  using (public.can_view_channel(channel_id));

/** Top-level post in a forum channel the caller can see, or raises. */
create or replace function public.forum_post(p_message uuid, out channel_id uuid, out server_id uuid, out author_id uuid, out mode text, out tags text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select m.channel_id, m.server_id, m.author_id, c.forum_mode, c.forum_tags into channel_id, server_id, author_id, mode, tags
  from public.messages m join public.channels c on c.id = m.channel_id
  where m.id = p_message and m.thread_id is null and c.type::text = 'forum';
  if channel_id is null or not public.can_view_channel(channel_id) then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.forum_post(uuid) from public, anon, authenticated;

/** Moderators: discussion forum or suggestion board, and its tags (1–20 characters, unique). */
create or replace function public.set_forum_settings(p_channel uuid, p_mode text, p_tags text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  srv uuid := public.channel_server_id(p_channel);
  cleaned text[];
begin
  if srv is null or not public.has_server_role(srv, 'moderator')
     or not exists (select 1 from public.channels c where c.id = p_channel and c.type::text = 'forum') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_mode not in ('discussion', 'suggestions') then
    raise exception 'INVALID_FORUM_SETTINGS' using errcode = '23514';
  end if;
  select coalesce(array_agg(t order by n), '{}') into cleaned
  from (select distinct on (lower(btrim(t))) btrim(t) as t, n from unnest(coalesce(p_tags, '{}')) with ordinality as u(t, n) where btrim(coalesce(t, '')) <> '' order by lower(btrim(t)), n) d;
  if cardinality(cleaned) > 12 or exists (select 1 from unnest(cleaned) t where char_length(t) > 20) then
    raise exception 'INVALID_FORUM_SETTINGS' using errcode = '23514';
  end if;
  update public.channels set forum_mode = p_mode, forum_tags = cleaned where id = p_channel;
  -- Tags that no longer exist come off posts.
  update public.forum_post_state set tags = array(select t from unnest(tags) t where t = any(cleaned)) where channel_id = p_channel;
end;
$$;
revoke all on function public.set_forum_settings(uuid, text, text[]) from public, anon;
grant execute on function public.set_forum_settings(uuid, text, text[]) to authenticated;

/**
 * Tag a post (its author or a moderator; up to 5 of the forum's tags) and set its status:
 * 'solved'/null on discussion forums (author or moderator); the board statuses on suggestion
 * boards (moderators only). Pass p_set_status = false to leave the status alone.
 */
create or replace function public.set_forum_post(p_message uuid, p_tags text[] default null, p_status text default null, p_set_status boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  post record;
  caller uuid := (select auth.uid());
  is_mod boolean;
  current record;
begin
  select * into post from public.forum_post(p_message);
  is_mod := public.has_server_role(post.server_id, 'moderator');
  if not public.mfa_ok() or public.is_platform_banned() or not (is_mod or post.author_id = caller) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_tags is not null and (cardinality(p_tags) > 5 or exists (select 1 from unnest(p_tags) t where not (t = any(post.tags)))) then
    raise exception 'INVALID_TAGS' using errcode = '23514';
  end if;
  if p_set_status then
    if post.mode = 'discussion' and p_status is not null and p_status <> 'solved' then
      raise exception 'INVALID_STATUS' using errcode = '23514';
    end if;
    if post.mode = 'suggestions' and (not is_mod or p_status = 'solved') then
      raise exception using message = case when is_mod then 'INVALID_STATUS' else 'NOT_ALLOWED' end, errcode = '42501';
    end if;
  end if;
  select * into current from public.forum_post_state s where s.message_id = p_message;
  insert into public.forum_post_state (message_id, channel_id, tags, status, status_by, updated_at)
  values (
    p_message, post.channel_id,
    case when p_tags is null then coalesce(current.tags, '{}') else array(select distinct t from unnest(p_tags) t) end,
    case when p_set_status then p_status else current.status end,
    case when p_set_status then caller else current.status_by end,
    now()
  )
  on conflict (message_id) do update set tags = excluded.tags, status = excluded.status, status_by = excluded.status_by, updated_at = now();
end;
$$;
revoke all on function public.set_forum_post(uuid, text[], text, boolean) from public, anon;
grant execute on function public.set_forum_post(uuid, text[], text, boolean) to authenticated;

/** Upvote a suggestion, or take the vote back. One vote per person; returns whether you now vote for it. */
create or replace function public.toggle_forum_vote(p_message uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  post record;
  caller uuid := (select auth.uid());
begin
  select * into post from public.forum_post(p_message);
  if caller is null or not public.mfa_ok() or public.is_platform_banned() or post.mode <> 'suggestions' then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  delete from public.forum_votes v where v.message_id = p_message and v.user_id = caller;
  if found then
    return false;
  end if;
  -- Votes are cheap to spam across many posts; 30 a minute is plenty for a person.
  if (select count(*) from public.forum_votes v where v.user_id = caller and v.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;
  insert into public.forum_votes (message_id, channel_id, user_id) values (p_message, post.channel_id, caller);
  return true;
end;
$$;
revoke all on function public.toggle_forum_vote(uuid) from public, anon;
grant execute on function public.toggle_forum_vote(uuid) to authenticated;

/** Tags, status and vote totals for a forum's posts (only for a channel the caller can see). */
create or replace function public.forum_overview(p_channel uuid)
returns table (message_id uuid, tags text[], status text, votes integer, voted boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with ids as (
    select message_id from public.forum_post_state where channel_id = p_channel
    union
    select message_id from public.forum_votes where channel_id = p_channel
  )
  select i.message_id, coalesce(s.tags, '{}'), s.status,
    (select count(*)::int from public.forum_votes v where v.message_id = i.message_id),
    exists (select 1 from public.forum_votes v where v.message_id = i.message_id and v.user_id = (select auth.uid()))
  from ids i left join public.forum_post_state s on s.message_id = i.message_id;
$$;
revoke all on function public.forum_overview(uuid) from public, anon;
grant execute on function public.forum_overview(uuid) to authenticated;
