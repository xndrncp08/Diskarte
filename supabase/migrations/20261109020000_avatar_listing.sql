-- Avatar listing: stop anyone from enumerating the avatars bucket.
--
-- The old SELECT policy "avatar images are publicly readable" had no role and no path check, so the
-- anon key could call storage.from('avatars').list('servers/') (or list the root) and read every
-- server id (private servers included), every user id, file names, sizes and timestamps.
--
-- The bucket is public, so images are served from /storage/v1/object/public/avatars/... without
-- touching storage.objects RLS: avatars, banners and server icons keep loading for everyone. Storage
-- still needs SELECT on the rows it inserts or deletes (upload and remove() use RETURNING), so the
-- new policy keeps exactly the uploaders who may write: a user in their own `<uid>/` folder and a
-- server admin (or owner) in `servers/<server>/`. That matches the existing insert/update/delete
-- scope, so profile uploads, server icon uploads and account deletion's remove() still work.
-- The restrictive "two-factor sessions only (storage)" policy is untouched and still applies.

drop policy if exists "avatar images are publicly readable" on storage.objects;

create policy "uploaders see their own avatar folders"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or ((storage.foldername(name))[1] = 'servers'
          and public.has_server_role(public.try_uuid((storage.foldername(name))[2]), 'admin'))
    )
  );

-- Rollback (restores public listing; run by hand only if the new policy breaks uploads):
--   drop policy if exists "uploaders see their own avatar folders" on storage.objects;
--   create policy "avatar images are publicly readable"
--     on storage.objects for select
--     using (bucket_id = 'avatars');
