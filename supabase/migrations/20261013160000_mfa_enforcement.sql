-- =====================================================================================
-- Two-factor login (Supabase Auth TOTP). Once an account has a verified factor, a session that
-- hasn't passed the second step (aal1) can't read or write anything: PostgREST refuses every
-- request (tables and RPCs) via the pre-request hook, and restrictive policies close Realtime
-- and Storage. The Auth API itself (where the code is verified) is unaffected.
-- =====================================================================================

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status::text = 'verified'
    );
$$;
revoke execute on function public.mfa_ok() from public;
grant execute on function public.mfa_ok() to anon, authenticated, service_role;

create or replace function public.mfa_pre_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.mfa_ok() then
    raise exception 'MFA_REQUIRED' using errcode = '42501', hint = 'Finish two-factor sign-in first.';
  end if;
end;
$$;
revoke execute on function public.mfa_pre_request() from public;
grant execute on function public.mfa_pre_request() to anon, authenticated, service_role;

-- PostgREST runs this before every request (hosted Supabase: the `authenticator` role).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.mfa_pre_request''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end;
$$;

create policy "two-factor sessions only (realtime)"
  on realtime.messages as restrictive for all to authenticated
  using ((select public.mfa_ok()))
  with check ((select public.mfa_ok()));

create policy "two-factor sessions only (storage)"
  on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok()))
  with check ((select public.mfa_ok()));
