-- Account export and deletion cover the 2026-10-29 additions: the existing functions are kept as
-- the base and wrapped, so their logic stays in one place.

alter function public.account_deletion_files() rename to account_deletion_files_base;
revoke all on function public.account_deletion_files_base() from public, anon, authenticated;

create or replace function public.account_deletion_files()
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.account_deletion_files_base()
  union all
  select o.bucket_id, o.name from storage.objects o
  where (select auth.uid()) is not null and o.bucket_id = 'moments' and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;

revoke all on function public.account_deletion_files() from public, anon;
grant execute on function public.account_deletion_files() to authenticated;

alter function public.export_my_data() rename to export_my_data_base;
revoke all on function public.export_my_data_base() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  -- The base raises for signed-out, banned or step-up-required callers.
  return public.export_my_data_base() || jsonb_build_object(
    'favourite_friends', coalesce((select jsonb_agg(p.username) from public.friend_favourites f join public.profiles p on p.id = f.target_id where f.owner_id = me), '[]'),
    'scheduled_messages', coalesce((select jsonb_agg(jsonb_build_object('channel_id', s.channel_id, 'content', s.content, 'send_at', s.send_at, 'failed_reason', s.failed_reason)) from public.scheduled_messages s where s.author_id = me), '[]'),
    'moments', coalesce((select jsonb_agg(jsonb_build_object('body', m.body, 'image_path', m.image_path, 'audience', m.audience, 'created_at', m.created_at, 'expires_at', m.expires_at)) from public.moments m where m.author_id = me), '[]'),
    'muted_moments_from', coalesce((select jsonb_agg(p.username) from public.moment_mutes mm join public.profiles p on p.id = mm.target_id where mm.owner_id = me), '[]'),
    'community_xp', coalesce((select jsonb_agg(jsonb_build_object('server', s.name, 'xp', x.xp)) from public.member_xp x join public.servers s on s.id = x.server_id where x.user_id = me), '[]')
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
