-- Private, versioned preferences and text drafts. No device identifiers or attachment URLs.
create table public.account_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null check (length(key) <= 120),
  value jsonb not null check (octet_length(value::text) <= 24000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, key)
);
alter table public.account_state enable row level security;
revoke all on public.account_state from anon, authenticated;
grant select on public.account_state to authenticated;
create policy "account state is private" on public.account_state for select to authenticated
  using (user_id = (select auth.uid()) and public.mfa_ok() and not public.is_platform_banned());

create function public.save_account_state(p_key text, p_value jsonb, p_revision integer)
returns setof public.account_state language plpgsql security definer set search_path = '' as $$
declare saved public.account_state; me uuid := (select auth.uid());
begin
  if me is null or not public.mfa_ok() or public.is_platform_banned() then raise exception 'STATE_FORBIDDEN' using errcode = '42501'; end if;
  if p_key is null or length(p_key) > 120 or p_value is null or p_revision is null or p_revision < 0 or octet_length(p_value::text) > 24000 then raise exception 'STATE_INVALID'; end if;
  if p_key like 'draft:%' then
    if p_key !~ '^draft:[0-9a-f-]{36}:(main|[0-9a-f-]{36})$' or public.try_uuid(split_part(p_key, ':', 2)) is null
      or (split_part(p_key, ':', 3) <> 'main' and public.try_uuid(split_part(p_key, ':', 3)) is null)
      or jsonb_typeof(p_value) <> 'string' or length(p_value #>> '{}') > 5000 then raise exception 'STATE_INVALID'; end if;
  elsif p_key in ('prefs:display', 'prefs:notifications', 'prefs:regional') then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'STATE_INVALID'; end if;
  else raise exception 'STATE_INVALID';
  end if;
  -- Serialise the per-account bound and revision check, including concurrent first writes.
  perform 1 from public.profiles where id = me for update;
  select * into saved from public.account_state where user_id = me and key = p_key;
  if coalesce(saved.revision, 0) <> p_revision then raise exception 'STATE_CONFLICT' using errcode = '40001'; end if;
  if saved.user_id is null then
    if (select count(*) from public.account_state where user_id = me) >= 500 then raise exception 'STATE_LIMIT'; end if;
    insert into public.account_state(user_id, key, value) values(me, p_key, p_value) returning * into saved;
  else
    update public.account_state set value = p_value, revision = revision + 1, updated_at = now()
      where user_id = me and key = p_key returning * into saved;
  end if;
  return next saved;
end;
$$;
revoke all on function public.save_account_state(text,jsonb,integer) from public, anon;
grant execute on function public.save_account_state(text,jsonb,integer) to authenticated;
alter publication supabase_realtime add table public.account_state;
