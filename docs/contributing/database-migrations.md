# Database migrations and RLS review

The schema is the security boundary, so migrations get the most careful review in this repository.

## Rules

1. **One file per change** in `supabase/migrations/`, named `YYYYMMDDHHMMSS_short_name.sql` with a
   timestamp later than every existing file. Never edit a migration that has been applied anywhere
   shared; write a new one.
2. **Additive and forward-only.** Add tables, columns, indexes and functions; replace functions with
   `create or replace`. Don't drop user data. Older app versions must keep working against the new
   schema, and new app code must tolerate the migration not being applied yet (hide the feature or
   show an "unavailable" state).
3. **Start with a comment block** explaining what the migration adds and why. Put a `--` comment
   directly above every `create table` and `create function`; the generated
   [database reference](../reference/database.md) uses it as the description.
4. **Portable SQL only.** Migrations must run unmodified in PGlite (tests) and the CI Supabase stack.
   Anything needing `pg_cron`, `pg_net` or Vault goes in `diskarte/docs/sql/*.sql` as a reviewed,
   re-runnable installer.
5. **Applied by hand.** Deploys never run migrations. Document every new file in the changelog /
   release notes with its order and what breaks without it.

## Writing secure SQL

```sql
-- Who may see a channel's pinned notes. Members only, private channels need a grant.
create table public.channel_notes (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.channel_notes enable row level security;

create policy "members read notes" on public.channel_notes
  for select to authenticated using (public.can_view_channel(channel_id));
create policy "members write their own notes" on public.channel_notes
  for insert to authenticated with check (author_id = (select auth.uid()) and public.can_view_channel(channel_id));

-- Clears a note. Moderators of the channel's server only.
create or replace function public.clear_channel_note(p_note uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_server_role(public.channel_server_id((select channel_id from public.channel_notes where id = p_note)), 'moderator') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  delete from public.channel_notes where id = p_note;
end;
$$;
revoke all on function public.clear_channel_note(uuid) from public, anon;
grant execute on function public.clear_channel_note(uuid) to authenticated;
```

(An illustrative pattern — `channel_notes` is not a real table.)

Checklist:

- **RLS enabled** on every new table, with policies `to authenticated` (anon gets nothing).
- Use `(select auth.uid())` (wrapped, so Postgres evaluates it once per statement).
- Reuse the helpers: `is_server_member`, `has_server_role`, `can_view_channel`, `is_dm_participant`,
  `is_platform_banned`, `is_verified_user`, `mfa_ok`, `is_super_admin`.
- **Definer functions**: `security definer`, `set search_path = ''`, fully qualified names, re-check
  the caller inside, raise `UPPER_SNAKE` codes with a SQLSTATE (`42501` permission, `23514` invalid,
  `53400` rate limit, `22023` bad argument).
- **Revoke explicitly.** Supabase's default privileges grant `EXECUTE` on new functions to `anon` and
  `authenticated`. Revoke from `public, anon` (and from `authenticated` for internal helpers and
  trigger functions), then grant only what the app calls.
- **Server-assigned fields** (author, timestamps, counters) are set by triggers, not trusted from the
  client. Guard immutable columns in `BEFORE UPDATE` triggers.
- **Rate limits** for anything a user can spam (count recent rows in the trigger or RPC).
- **Realtime**: add the table to `supabase_realtime` only if clients subscribe to it, and add the
  topic prefix to `can_access_realtime_topic()`.
- **Storage**: bucket `file_size_limit` and `allowed_mime_types`, object paths that encode ownership,
  and policies that check them.
- **Account lifecycle**: decide what `delete_my_account()` should do with the new data (cascade or
  `set null`) and extend `export_my_data()` — wrap the existing functions as
  `20261029060000_account_data_coverage.sql` does.
- **Embeds**: adding a second foreign key between two already-related tables makes PostgREST embeds
  ambiguous (`PGRST201`); update app queries to use `table!fk_name(...)` hints.
- **Enums**: a value added with `alter type … add value` can't be used in the same transaction;
  compare as text (see `20261013150000_forum_channels.sql`).
- **Indexes** for every foreign key you filter on and for policy predicates; note potential locks on
  large tables in the release notes.

## RLS review procedure

For each new or changed table, policy, trigger or definer function, the reviewer answers:

1. Can a signed-out visitor (`anon`) read or call it? It should be "no" unless it's a deliberate
   public endpoint (like `get_invite`, `username_available`, `post_webhook_message`).
2. Can a signed-in **non-member** see or change it?
3. Can a **member** act on someone else's rows, or impersonate them?
4. Can a **moderator** act on an equal or higher rank? Can anyone change their own rank?
5. Does a **private channel** stay private through every path: table, search, Realtime topic,
   push, events, workspace?
6. Does a **banned**, **timed-out** or **MFA-pending** session get refused where it should?
7. Does a definer function leak existence (different errors for "not found" vs "forbidden") where
   that matters?
8. What happens on **account deletion** and in the **data export**?

Each "no" needs a PGlite test that proves it (see [testing.md → Database / RLS tests](../testing.md#database--rls-tests)).

## Workflow

```bash
# 1. write supabase/migrations/<timestamp>_<name>.sql
# 2. test it
cd diskarte
npx vitest run tests/db/<feature>.test.ts
# 3. update app types
#    src/lib/supabase/database.types.ts (or regenerate from a local stack:
#    npx supabase gen types typescript --local > src/lib/supabase/database.types.ts)
# 4. regenerate the reference (the docs test fails until you do)
npm run docs:db
# 5. optionally add a probe for the feature to scripts/check-database.mjs
# 6. record it in CHANGELOG.md / RELEASE-<date>.md
```

To see the current definition of a function after many migrations, query the catalog in a PGlite
test (`select pg_get_functiondef('public.fn'::regproc)`) rather than reading old migration files.

Applying to a hosted project: [deployment.md → Release procedure](../operations/deployment.md#release-procedure).
