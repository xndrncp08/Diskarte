-- =====================================================================================
-- Saved messages (Discord's "Save Message" / bookmarks) and "Mark Unread".
-- =====================================================================================

create table public.saved_messages (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index saved_messages_user_idx on public.saved_messages (user_id, saved_at desc);

alter table public.saved_messages enable row level security;
revoke all on table public.saved_messages from anon, authenticated;
grant select, insert, delete on table public.saved_messages to authenticated;
-- You can only save what you can read (and the message stays hidden from you if you lose access).
create policy "people keep their own saved messages"
  on public.saved_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.messages m where m.id = message_id));

/** Mark a channel unread from a message on: my read point goes back to just before it. */
create or replace function public.mark_channel_unread(p_channel uuid, p_from timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_view_channel(p_channel) then
    return;
  end if;
  insert into public.channel_reads (user_id, channel_id, last_read_at)
  values ((select auth.uid()), p_channel, p_from - interval '1 millisecond')
  on conflict (user_id, channel_id) do update set last_read_at = excluded.last_read_at;
end;
$$;
revoke execute on function public.mark_channel_unread(uuid, timestamptz) from public, anon;
grant execute on function public.mark_channel_unread(uuid, timestamptz) to authenticated;
