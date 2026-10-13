-- =====================================================================================
-- Edit history: each edit keeps the text it replaced. The author and the server's
-- moderators can read it (clicking "(edited)"); nobody writes it directly.
-- =====================================================================================

create table public.message_edits (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.messages (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete cascade,
  content text not null,
  replaced_at timestamptz not null default now()
);
create index message_edits_message_idx on public.message_edits (message_id, replaced_at);
create index message_edits_server_idx on public.message_edits (server_id);
create index message_edits_author_idx on public.message_edits (author_id);

alter table public.message_edits enable row level security;
revoke all on table public.message_edits from anon, authenticated;
grant select on table public.message_edits to authenticated;

create policy "authors and moderators read edit history"
  on public.message_edits for select to authenticated
  using (author_id = (select auth.uid()) or public.has_server_role(server_id, 'moderator'));

create or replace function public.messages_keep_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_edits (message_id, server_id, author_id, content)
  values (old.id, old.server_id, old.author_id, old.content);
  return null;
end;
$$;

create trigger messages_keep_edit
  after update of content on public.messages
  for each row when (new.content is distinct from old.content)
  execute function public.messages_keep_edit();
