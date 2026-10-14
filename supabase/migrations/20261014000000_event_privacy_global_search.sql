-- Event metadata and attendee lists follow the event channel's visibility, including grants.
alter policy "members see events" on public.server_events
  using (public.is_server_member(server_id) and (channel_id is null or public.can_view_channel(channel_id)));
alter policy "members see who's interested" on public.event_rsvps
  using (exists (select 1 from public.server_events e where e.id = event_id and e.server_id = event_rsvps.server_id));

create index direct_messages_search_idx on public.direct_messages using gin (to_tsvector('simple', content));
create index messages_server_activity_idx on public.messages (server_id, created_at desc) include (author_id);

-- SECURITY INVOKER is intentional: both branches retain their table RLS. No elevated indexing or
-- profile joins can accidentally disclose a private channel, DM, or a deleted membership.
create or replace function public.search_all_messages(
  p_query text,
  p_server uuid default null,
  p_channel uuid default null,
  p_author uuid default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_kind text default null,
  p_cursor_date timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns table (source text, id uuid, server_id uuid, channel_id uuid, conversation_id uuid, thread_id uuid, author_id uuid, content text, created_at timestamptz, attachments jsonb)
language sql stable security invoker set search_path = ''
as $$
  with candidates as (
    select 'channel'::text as source, m.id, m.server_id, m.channel_id, null::uuid as conversation_id,
      m.thread_id, m.author_id, m.content, m.created_at, m.attachments
    from public.messages m
    where (p_server is null or m.server_id = p_server)
      and (p_channel is null or m.channel_id = p_channel)
      and (p_kind is null or p_kind = 'attachment' and jsonb_array_length(m.attachments) > 0
        or p_kind in ('image','audio','video') and exists (
          select 1 from jsonb_array_elements(m.attachments) a where a->>'type' like p_kind || '/%'))
      and (public.search_tsquery(p_query) is null or to_tsvector('simple', m.content) @@ public.search_tsquery(p_query))
    union all
    select 'dm'::text, d.id, null::uuid, null::uuid, d.conversation_id, null::uuid,
      d.author_id, d.content, d.created_at, '[]'::jsonb
    from public.direct_messages d
    where p_server is null and p_channel is null and p_kind is null
      and (public.search_tsquery(p_query) is null or to_tsvector('simple', d.content) @@ public.search_tsquery(p_query))
  )
  select c.* from candidates c
  where (p_author is null or c.author_id = p_author)
    and (p_after is null or c.created_at >= p_after)
    and (p_before is null or c.created_at < p_before)
    and (p_cursor_date is null or c.created_at < p_cursor_date or c.created_at = p_cursor_date and p_cursor_id is not null and c.id < p_cursor_id)
    and (public.search_tsquery(p_query) is not null or p_server is not null or p_channel is not null or p_author is not null or p_after is not null or p_before is not null or p_kind is not null)
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;
revoke execute on function public.search_all_messages(text, uuid, uuid, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.search_all_messages(text, uuid, uuid, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer) to authenticated;
