-- =====================================================================================
-- Problem reports: anyone signed in can tell the team something is broken. Reporters see
-- their own reports; super admins triage them in the Control Center and can hand one to the
-- fix agent (a GitHub issue labelled `autofix`, see .github/workflows/fix-agent.yml).
-- =====================================================================================

create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category text not null check (category in ('bug', 'slow', 'account', 'other')),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  page_url text check (char_length(page_url) <= 500),
  user_agent text check (char_length(user_agent) <= 500),
  status text not null default 'open' check (status in ('open', 'sent', 'resolved', 'dismissed')),
  issue_url text check (issue_url ~ '^https://github\.com/'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index problem_reports_created_idx on public.problem_reports (created_at desc);
create index problem_reports_reporter_idx on public.problem_reports (reporter_id, created_at desc);

alter table public.problem_reports enable row level security;
revoke all on table public.problem_reports from anon, authenticated;
grant select on table public.problem_reports to authenticated;
grant insert (category, description, page_url, user_agent) on table public.problem_reports to authenticated;

create policy "people file reports as themselves"
  on public.problem_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and not public.is_platform_banned());

create policy "people see their own reports; super admins see all"
  on public.problem_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_super_admin());

/** Five reports an hour per person: enough for real trouble, useless for flooding the queue. */
create or replace function public.problem_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.problem_reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'REPORT_RATE_LIMITED' using errcode = '54000';
  end if;
  new.status := 'open';
  new.issue_url := null;
  return new;
end;
$$;

create trigger problem_reports_before_insert
  before insert on public.problem_reports
  for each row execute function public.problem_reports_before_insert();

/** Triage: mark a report sent to the fix agent (with its issue), resolved, dismissed or open again. */
create or replace function public.admin_set_report_status(p_report uuid, p_status text, p_issue_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_super_admin();
  if p_status not in ('open', 'sent', 'resolved', 'dismissed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.problem_reports
     set status = p_status, issue_url = coalesce(p_issue_url, issue_url), updated_at = now()
   where id = p_report;
  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = '22023';
  end if;
  perform public.admin_log('report.' || p_status, null,
    jsonb_build_object('report_id', p_report) || case when p_issue_url is null then '{}'::jsonb else jsonb_build_object('issue_url', p_issue_url) end);
end;
$$;

revoke execute on function public.admin_set_report_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_report_status(uuid, text, text) to authenticated;
