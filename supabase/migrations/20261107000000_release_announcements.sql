-- =====================================================================================
-- Official release announcements: when a production deployment of Diskarte starts serving, the
-- server posts that release's developer-written notes (diskarte/src/content/releases.json) to
-- Diskarte HQ #announcements as "Diskarte Updates" — once per release, never for an older release
-- after a newer one (rollbacks), and only through the service role. Super admins can withdraw a post
-- or reset it so corrected notes are published again.
-- =====================================================================================

-- One row per announced release. Readable by everyone signed in (the What's New status); written only
-- by the definer functions below.
create table public.release_announcements (
  release_id text primary key check (release_id ~ '^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,60}$'),
  released_on date not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  message_id uuid references public.messages (id) on delete set null,
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
alter table public.release_announcements enable row level security;
create policy "signed-in users read release announcements" on public.release_announcements
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.release_announcements from anon, authenticated;

-- Posts a release's notes to Diskarte HQ #announcements, at most once. Service role only (the
-- deployment's own server). Returns 'published', 'already-published' or 'superseded'.
create or replace function public.publish_release_announcement(p_release_id text, p_released_on date, p_title text, p_content text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  original text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  posted uuid;
begin
  if p_content is null or char_length(btrim(p_content)) not between 1 and 4000 then
    raise exception 'INVALID_CONTENT' using errcode = '22023';
  end if;
  -- Serialize publishers (several instances of a new deployment can start at once).
  perform pg_advisory_xact_lock(hashtext('diskarte:release-announcements'));
  if exists (select 1 from public.release_announcements r where r.release_id = p_release_id) then
    return 'already-published';
  end if;
  -- An instance of an older deployment (a rollback) never announces after a newer release.
  if exists (select 1 from public.release_announcements r where r.released_on > p_released_on) then
    return 'superseded';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('diskarte.system_post', 'on', true);
  insert into public.messages (channel_id, server_id, author_id, content, webhook_name)
  values ('d15ca47e-0000-4000-8000-0000000000a1', public.system_server_id(), null, btrim(p_content), 'Diskarte Updates')
  returning id into posted;
  perform set_config('diskarte.system_post', '', true);
  perform set_config('request.jwt.claim.sub', original, true);
  insert into public.release_announcements (release_id, released_on, title, message_id)
  values (p_release_id, p_released_on, btrim(p_title), posted);
  return 'published';
end;
$$;
revoke all on function public.publish_release_announcement(text, date, text, text) from public, anon, authenticated;
grant execute on function public.publish_release_announcement(text, date, text, text) to service_role;

-- Removes a release's post and keeps the record, so it isn't published again automatically.
create or replace function public.admin_withdraw_release_announcement(p_release_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform public.assert_super_admin();
  select * into r from public.release_announcements where release_id = p_release_id for update;
  if not found then
    raise exception 'RELEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if r.message_id is not null then
    delete from public.messages where id = r.message_id;
  end if;
  update public.release_announcements set message_id = null, withdrawn_at = coalesce(withdrawn_at, now()) where release_id = p_release_id;
  perform public.admin_log('release.withdraw', null, jsonb_build_object('release', p_release_id));
end;
$$;
revoke all on function public.admin_withdraw_release_announcement(text) from public, anon;
grant execute on function public.admin_withdraw_release_announcement(text) to authenticated;

-- Removes a release's post and its record, so corrected notes can be published again.
create or replace function public.admin_reset_release_announcement(p_release_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform public.assert_super_admin();
  delete from public.release_announcements where release_id = p_release_id returning * into r;
  if r.message_id is not null then
    delete from public.messages where id = r.message_id;
  end if;
  perform public.admin_log('release.reset', null, jsonb_build_object('release', p_release_id));
end;
$$;
revoke all on function public.admin_reset_release_announcement(text) from public, anon;
grant execute on function public.admin_reset_release_announcement(text) to authenticated;
