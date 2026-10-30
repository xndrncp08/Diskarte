-- Diskarte platform jobs: publishes scheduled messages and clears expired custom statuses every
-- minute. Run once as the database owner (Supabase SQL Editor) after the 20261029 migrations.
-- Safe to re-run: cron.schedule replaces a job with the same name.
-- Without it, scheduled messages still send while their author has Diskarte open.
create extension if not exists pg_cron;
select cron.schedule('diskarte-platform-tick', '* * * * *', $$select public.tick_platform();$$);
-- Check: select jobname, active from cron.job where jobname = 'diskarte-platform-tick';
-- Undo:  select cron.unschedule('diskarte-platform-tick');
