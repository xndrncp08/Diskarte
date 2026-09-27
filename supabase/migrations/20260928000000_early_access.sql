-- =====================================================================================
-- Diskarte — Early Access waitlist + platform admins
--   * platform_admins: who may run the early-access review dashboard (role `super_admin`).
--     Granted only by SQL / the service role — no client can write it.
--   * waitlist_applications: anyone (signed in or not) may submit; only super admins can read,
--     review or delete. Applicant-supplied columns are the only ones the public may write, and a
--     trigger enforces the review state machine (pending → approved | declined, declined → …).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Platform admins
-- -------------------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'super_admin' check (role in ('super_admin')),
  note text not null default '' check (char_length(note) <= 200),
  granted_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy "admins can see their own grant"
  on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.platform_admins from anon;
revoke insert, update, delete, truncate on table public.platform_admins from authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = (select auth.uid()) and a.role = 'super_admin'
  );
$$;

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- -------------------------------------------------------------------------------------
-- Waitlist applications
-- -------------------------------------------------------------------------------------
create type public.waitlist_status as enum ('pending', 'approved', 'declined');

create table public.waitlist_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  preferred_username text check (preferred_username is null or preferred_username ~ '^[a-z0-9_.]{3,32}$'),
  community_type text not null check (community_type in ('gaming', 'school', 'streaming', 'barkada', 'work', 'other')),
  community_name text not null default '' check (char_length(community_name) <= 80),
  community_size text not null default 'solo' check (community_size in ('solo', '2-10', '11-50', '51-200', '200+')),
  referral_source text not null default '' check (char_length(referral_source) <= 80),
  reason text not null check (char_length(btrim(reason)) between 20 and 600),
  status public.waitlist_status not null default 'pending',
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 300),
  admin_note text not null default '' check (char_length(admin_note) <= 500),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  approved_user_id uuid references auth.users (id) on delete set null,
  email_sent_at timestamptz,
  email_error text check (email_error is null or char_length(email_error) <= 500),
  email_attempts integer not null default 0 check (email_attempts >= 0),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index waitlist_applications_email_key on public.waitlist_applications (lower(email));
create index waitlist_applications_status_idx on public.waitlist_applications (status, created_at desc);
create index waitlist_applications_ip_idx on public.waitlist_applications (ip_hash, created_at) where ip_hash is not null;

-- New applications: normalised, always pending, and flood-limited. SECURITY DEFINER so the
-- per-IP / global counts see every row even though the public can't SELECT the table.
create or replace function public.waitlist_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  new.full_name := regexp_replace(btrim(new.full_name), '[[:space:]]+', ' ', 'g');
  new.preferred_username := nullif(lower(btrim(ltrim(btrim(coalesce(new.preferred_username, '')), '@'))), '');
  new.community_name := btrim(new.community_name);
  new.referral_source := btrim(new.referral_source);
  new.reason := btrim(new.reason);
  new.status := 'pending';
  new.decline_reason := null;
  new.admin_note := '';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.approved_user_id := null;
  new.email_sent_at := null;
  new.email_error := null;
  new.email_attempts := 0;
  new.created_at := now();
  new.updated_at := now();

  if new.ip_hash is not null and (
    select count(*) from public.waitlist_applications w
    where w.ip_hash = new.ip_hash and w.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'TOO_MANY_APPLICATIONS' using errcode = '53400';
  end if;
  -- Bounds scripted floods that skip the portal (and its CAPTCHA) and hit the REST API directly.
  if (select count(*) from public.waitlist_applications w where w.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'WAITLIST_BUSY' using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger waitlist_before_insert
  before insert on public.waitlist_applications
  for each row execute function public.waitlist_before_insert();

-- Reviews: applicant data is immutable and status follows the state machine.
create or replace function public.waitlist_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.full_name <> old.full_name
     or new.email <> old.email
     or new.preferred_username is distinct from old.preferred_username
     or new.community_type <> old.community_type
     or new.community_name <> old.community_name
     or new.community_size <> old.community_size
     or new.referral_source <> old.referral_source
     or new.reason <> old.reason
     or new.ip_hash is distinct from old.ip_hash
     or new.user_agent is distinct from old.user_agent
     or new.created_at <> old.created_at then
    raise exception 'APPLICATION_IMMUTABLE_FIELD' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('approved', 'declined'))
      or (old.status = 'declined' and new.status in ('pending', 'approved'))
    ) then
      raise exception 'INVALID_TRANSITION' using errcode = '23514',
        detail = old.status::text || ' -> ' || new.status::text;
    end if;
    new.reviewed_at := now();
    new.reviewed_by := coalesce((select auth.uid()), new.reviewed_by);
    if new.status = 'pending' then
      new.reviewed_at := null;
      new.reviewed_by := null;
      new.decline_reason := null;
    elsif new.status = 'approved' then
      new.decline_reason := null;
    end if;
  elsif new.status <> 'declined' and new.decline_reason is distinct from old.decline_reason then
    raise exception 'DECLINE_REASON_ONLY_WHEN_DECLINED' using errcode = '23514';
  end if;

  if new.approved_user_id is distinct from old.approved_user_id and new.status <> 'approved' then
    raise exception 'ACCOUNT_ONLY_WHEN_APPROVED' using errcode = '23514';
  end if;
  if new.email_attempts < old.email_attempts then
    raise exception 'APPLICATION_IMMUTABLE_FIELD' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger waitlist_before_update
  before update on public.waitlist_applications
  for each row execute function public.waitlist_before_update();

-- Dashboard numbers in one round trip.
create or replace function public.waitlist_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.waitlist_applications where status = 'pending'),
    'approved', (select count(*) from public.waitlist_applications where status = 'approved'),
    'declined', (select count(*) from public.waitlist_applications where status = 'declined'),
    'email_failed', (select count(*) from public.waitlist_applications where status = 'approved' and email_sent_at is null),
    'last7', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series((now() at time zone 'Asia/Manila')::date - 6, (now() at time zone 'Asia/Manila')::date, interval '1 day') as d(day)
      left join (
        select (created_at at time zone 'Asia/Manila')::date as day, count(*) as n
        from public.waitlist_applications
        where created_at > now() - interval '8 days'
        group by 1
      ) c on c.day = d.day::date
    )
  );
end;
$$;

-- -------------------------------------------------------------------------------------
-- Privileges + RLS
-- -------------------------------------------------------------------------------------
revoke all on table public.waitlist_applications from anon, authenticated;
grant insert (full_name, email, preferred_username, community_type, community_name, community_size, referral_source, reason, ip_hash, user_agent)
  on table public.waitlist_applications to anon, authenticated;
grant select, delete on table public.waitlist_applications to authenticated;
grant update (status, decline_reason, admin_note, approved_user_id, email_sent_at, email_error, email_attempts)
  on table public.waitlist_applications to authenticated;

alter table public.waitlist_applications enable row level security;

create policy "anyone can apply"
  on public.waitlist_applications for insert to anon, authenticated
  with check (status = 'pending');

create policy "super admins read applications"
  on public.waitlist_applications for select to authenticated
  using (public.is_super_admin());

create policy "super admins review applications"
  on public.waitlist_applications for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "super admins delete applications"
  on public.waitlist_applications for delete to authenticated
  using (public.is_super_admin());

revoke execute on function public.waitlist_before_insert(), public.waitlist_before_update() from public, anon, authenticated;
revoke execute on function public.waitlist_stats() from public, anon;
grant execute on function public.waitlist_stats() to authenticated;
