-- =====================================================================================
-- Account deletion (Settings → Danger zone).
--
-- The app deletes the caller's files through the Storage API first (direct DELETEs on
-- storage.objects are refused by Supabase), using `account_deletion_files()` to find them, then
-- calls `delete_my_account()`:
--   * servers I own pass to their most senior remaining member (admin, then moderator, then the
--     longest-standing member); servers where I'm the only member are deleted;
--   * my messages that carry attachments are deleted (their files are gone); my text messages stay,
--     shown as from a deleted user (author_id → null);
--   * deleting the auth.users row cascades to my profile, memberships, reactions, friendships,
--     DM participation, LFG beacons, badges, blocks and early-access records.
-- =====================================================================================

-- Ownership transfer (used here, and by owners directly) was blocked: promoting the new owner to
-- admin ran the RBAC guard as the old owner, who by then no longer owned the server.
create or replace function public.members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.member_role;
  owner uuid;
begin
  -- Service role / migrations, and writes made by other triggers (servers_owner_promote makes the
  -- new owner an admin while the caller, the old owner, is no longer the owner).
  if caller is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.server_id <> old.server_id or new.user_id <> old.user_id or new.joined_at <> old.joined_at then
    raise exception 'MEMBER_IMMUTABLE_FIELD' using errcode = '42501';
  end if;

  select s.owner_id into owner from public.servers s where s.id = old.server_id;
  caller_role := public.server_role(old.server_id);

  if new.role is distinct from old.role then
    if caller_role is distinct from 'admin' then
      raise exception 'ONLY_ADMINS_CAN_CHANGE_ROLES' using errcode = '42501';
    end if;
    if old.user_id = owner then
      raise exception 'CANNOT_CHANGE_OWNER_ROLE' using errcode = '42501';
    end if;
    if old.user_id = caller then
      raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '42501';
    end if;
    if old.role = 'admin' and caller <> owner then
      raise exception 'ONLY_OWNER_CAN_DEMOTE_ADMINS' using errcode = '42501';
    end if;
  end if;

  if new.nickname is distinct from old.nickname and old.user_id <> caller then
    if caller_role is null or caller_role < 'moderator' or (old.role >= caller_role and caller <> owner) then
      raise exception 'CANNOT_RENAME_MEMBER' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

/** Storage objects to remove before `delete_my_account()`: everything I uploaded, plus the icon,
    attachments and soundboard clips of servers that will be deleted with me. */
create or replace function public.account_deletion_files()
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  doomed as (
    select s.id from public.servers s, me
    where s.owner_id = me.id
      and not exists (select 1 from public.members m where m.server_id = s.id and m.user_id <> me.id)
  )
  select o.bucket_id, o.name
  from storage.objects o, me
  where me.id is not null
    and (
      (o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = me.id::text)
      or (o.bucket_id = 'attachments' and (storage.foldername(o.name))[3] = me.id::text)
      or (o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = 'servers'
          and public.try_uuid((storage.foldername(o.name))[2]) in (select id from doomed))
      or (o.bucket_id in ('attachments', 'soundboard')
          and public.try_uuid((storage.foldername(o.name))[1]) in (select id from doomed))
    );
$$;

create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_username text;
  owned record;
  heir uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select p.username into my_username from public.profiles p where p.id = me;
  if my_username is null or lower(btrim(coalesce(p_confirm, ''))) <> lower(my_username) then
    raise exception 'CONFIRMATION_MISMATCH' using errcode = '22023';
  end if;

  for owned in select s.id from public.servers s where s.owner_id = me loop
    heir := null;
    select m.user_id into heir
    from public.members m
    where m.server_id = owned.id and m.user_id <> me
    order by m.role desc, m.joined_at asc
    limit 1;
    if heir is null then
      delete from public.servers where id = owned.id;
    else
      update public.servers set owner_id = heir where id = owned.id;
    end if;
  end loop;

  delete from public.messages where author_id = me and jsonb_array_length(attachments) > 0;

  -- The cascade nulls author_id on my remaining messages and removes my memberships; user-facing
  -- guards forbid both for signed-in callers. Identity and confirmation are checked above, so finish
  -- as the system (auth.uid() reads these claims) for the rest of this transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.account_deletion_files() from public, anon;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.account_deletion_files() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
