-- Auth-user deletion nulls event attribution; signed-in clients still cannot change creators.
create or replace function public.server_events_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.server_id<>old.server_id or new.created_at<>old.created_at
    or (new.created_by is distinct from old.created_by and ((select auth.uid()) is not null or new.created_by is not null)) then
    raise exception 'EVENT_IMMUTABLE_FIELD' using errcode='42501';
  end if;
  return new;
end;
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
  if not public.mfa_ok() then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
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
  delete from public.direct_messages where author_id = me and jsonb_array_length(attachments) > 0;

  -- The cascade nulls author_id on my remaining messages and removes my memberships; user-facing
  -- guards forbid both for signed-in callers. Identity and confirmation are checked above, so finish
  -- as the system (auth.uid() reads these claims) for the rest of this transaction.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  delete from auth.users where id = me;
end;
$$;

