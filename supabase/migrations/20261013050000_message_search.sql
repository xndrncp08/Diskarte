-- =====================================================================================
-- Message search (Discord's search box): full-text over a server's messages you can read.
-- An expression index (no stored column, so message fetches and realtime payloads stay lean),
-- prefix matching on every word, and from:/in: filters passed as arguments. Runs as the caller,
-- so private channels and other servers stay out by RLS.
-- =====================================================================================

create index messages_search_idx on public.messages using gin (to_tsvector('simple', content));

/** "kain na" → 'kain':* & 'na':* (letters, digits and _ only; empty when nothing searchable). */
create or replace function public.search_tsquery(p_query text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select case when count(*) = 0 then null else to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & ')) end
  from (select lower(t[1]) as w from regexp_matches(coalesce(p_query, ''), '([[:alnum:]_]+)', 'g') as t limit 8) words;
$$;

create or replace function public.search_messages(
  p_server uuid,
  p_query text,
  p_channel uuid default null,
  p_author uuid default null,
  p_before timestamptz default null,
  p_limit integer default 25
)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  select m.* from public.messages m
  where m.server_id = p_server
    and (p_channel is null or m.channel_id = p_channel)
    and (p_author is null or m.author_id = p_author)
    and (p_before is null or m.created_at < p_before)
    and (
      public.search_tsquery(p_query) is null and (p_channel is not null or p_author is not null)
      or to_tsvector('simple', m.content) @@ public.search_tsquery(p_query)
    )
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

revoke execute on function public.search_messages(uuid, text, uuid, uuid, timestamptz, integer) from public, anon;
grant execute on function public.search_messages(uuid, text, uuid, uuid, timestamptz, integer) to authenticated;
