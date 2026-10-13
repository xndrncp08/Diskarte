-- =====================================================================================
-- Notes: a private note you keep about someone (Discord's "Add Note"), visible only to you.
-- =====================================================================================

create table public.user_notes (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 1 and 256),
  updated_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  check (owner_id <> target_id)
);

alter table public.user_notes enable row level security;
revoke all on table public.user_notes from anon, authenticated;
grant select, insert, update, delete on table public.user_notes to authenticated;

create policy "people keep their own notes"
  on public.user_notes for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
