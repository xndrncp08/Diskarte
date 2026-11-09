-- =====================================================================================
-- Message reminders: "Remind me" on a message saves it with a time (saved_messages.remind_at).
-- The open app checks for due reminders, shows them, and clears remind_at; the message stays in
-- Saved. Same row-level rules as saved messages: only your own rows, only messages you can read.
-- =====================================================================================

alter table public.saved_messages add column remind_at timestamptz;
grant update (remind_at) on table public.saved_messages to authenticated;
create index saved_messages_remind_idx on public.saved_messages (user_id, remind_at) where remind_at is not null;
