-- Run AFTER the core migration, against staging first, as database owner.
-- Create these two Vault secrets separately in the Supabase Vault dashboard:
-- diskarte_push_url = https://YOUR_SITE/api/push/dispatch
-- diskarte_push_secret = the exact PUSH_DISPATCH_SECRET configured on your host (>=32 random chars)
-- This file contains no production values. Do not commit secret-filled copies.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create or replace function private_push.wake() returns void language plpgsql security definer set search_path='' as $$
declare target text; token text;
begin
 if not (select enabled from private_push.configuration where singleton) then return; end if;
 select decrypted_secret into target from vault.decrypted_secrets where name='diskarte_push_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='diskarte_push_secret';
 if target is null or target !~ '^https://[^/]+/api/push/dispatch$' then
   raise exception 'PUSH_WAKE_NOT_CONFIGURED'
     using detail='Vault secret diskarte_push_url is missing or is not an HTTPS dispatcher URL.',
       hint='Create or update diskarte_push_url in Supabase Vault to https://YOUR_SITE/api/push/dispatch (no trailing slash). Hosting environment variables do not populate Vault.';
 end if;
 if token is null or length(token)<32 then
   raise exception 'PUSH_WAKE_NOT_CONFIGURED'
     using detail='Vault secret diskarte_push_secret is missing or shorter than 32 characters.',
       hint='Create or update diskarte_push_secret in Supabase Vault with the exact PUSH_DISPATCH_SECRET from your hosting environment.';
 end if;
 if not exists(select 1 from private_push.deliveries d join private_push.outbox o on o.id=d.event_id
   where (d.status='pending' and d.next_attempt_at<=now() or d.status='sending' and d.lease_until<now()) and d.attempts<8 and o.expires_at>now()) then return; end if;
 perform net.http_post(url:=target,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=60000);
end;
$$;
create or replace function private_push.wake_statement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- One immediate wake per transaction, even for group DMs or many role mentions.
 if coalesce(current_setting('diskarte.push_woken',true),'')<>'1' then
   perform set_config('diskarte.push_woken','1',true);
   perform private_push.wake();
 end if;
 return null;
exception when others then
 -- A failed wake must never roll back a user's message. The durable minute tick recovers it.
 return null;
end;
$$;
drop trigger if exists push_deliveries_wake on private_push.deliveries;
create trigger push_deliveries_wake after insert on private_push.deliveries for each statement execute function private_push.wake_statement();
revoke all on function private_push.wake(),private_push.wake_statement() from public,anon,authenticated,service_role;
-- cron runs as the installer. It handles short retries, missed wakes and due event reminders.
select cron.schedule('diskarte-push-recovery','* * * * *',$$select public.tick_push(); select private_push.wake();$$);
update private_push.configuration set enabled=true where singleton;
-- Fail setup if the Vault values are missing/invalid. HTTP delivery itself must be checked separately.
select private_push.wake();
commit;
