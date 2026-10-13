-- =====================================================================================
-- Site visits: one row per browser per day (Manila time), so the Control Center can show how
-- many people opened Diskarte. The visitor id is a random UUID the browser keeps; no IPs or
-- user ids are stored. Full analytics (pages, referrers, countries) live in Vercel Analytics.
-- =====================================================================================

create table public.site_visits (
  day date not null,
  visitor uuid not null,
  signed_in boolean not null default false,
  primary key (day, visitor)
);

-- No policies and no grants: only the definer functions below touch it.
alter table public.site_visits enable row level security;
revoke all on table public.site_visits from anon, authenticated;

/** Counts this browser once for today; a later signed-in visit the same day marks it signed in. */
create or replace function public.record_site_visit(p_visitor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.site_visits (day, visitor, signed_in)
  values ((now() at time zone 'Asia/Manila')::date, p_visitor, auth.uid() is not null)
  on conflict (day, visitor) do update set signed_in = public.site_visits.signed_in or excluded.signed_in;
$$;

/** Unique visitors today, over 7 and 30 days, and per day for the last 30 days. */
create or replace function public.admin_site_traffic()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform public.assert_super_admin();
  return jsonb_build_object(
    'today', (select count(*) from public.site_visits v where v.day = today),
    'signed_in_today', (select count(*) from public.site_visits v where v.day = today and v.signed_in),
    'week', (select count(distinct v.visitor) from public.site_visits v where v.day > today - 7),
    'month', (select count(distinct v.visitor) from public.site_visits v where v.day > today - 30),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day::date, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series(today - 29, today, interval '1 day') as d(day)
      left join (select v.day, count(*) as n from public.site_visits v where v.day > today - 30 group by 1) c on c.day = d.day::date
    )
  );
end;
$$;

revoke execute on function public.record_site_visit(uuid) from public;
grant execute on function public.record_site_visit(uuid) to anon, authenticated;
revoke execute on function public.admin_site_traffic() from public, anon;
grant execute on function public.admin_site_traffic() to authenticated;
