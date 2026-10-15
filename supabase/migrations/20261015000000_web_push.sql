-- Additive Web Push foundation. No network extensions or production secrets are required to migrate.
create schema if not exists private_push;
revoke all on schema private_push from public, anon, authenticated;
create table private_push.configuration (singleton boolean primary key default true check(singleton), enabled boolean not null default false);
insert into private_push.configuration values(true,false);
create table private_push.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  device_id uuid not null,
  endpoint text not null unique check(length(endpoint) between 30 and 2048),
  p256dh text not null, auth_key text not null,
  label text not null check(length(label) between 1 and 80),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_delivered_at timestamptz,
  unique(user_id,device_id)
);
create index push_subscriptions_user on private_push.subscriptions(user_id);
create index push_subscriptions_session on private_push.subscriptions(session_id);
create table private_push.outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('dm','mention','reply','friend','invitation','call','event','moderation','security','test')),
  source_id uuid not null,
  dedupe_key text not null check(length(dedupe_key)<=200),
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  unique(user_id,dedupe_key)
);
create index push_outbox_user_time on private_push.outbox(user_id,created_at desc);
create table private_push.deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references private_push.outbox(id) on delete cascade,
  subscription_id uuid references private_push.subscriptions(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','sending','sent','skipped','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease uuid, lease_until timestamptz,
  last_status integer, last_code text check(length(last_code)<=40),
  unique(event_id,subscription_id)
);
create index push_deliveries_due on private_push.deliveries(next_attempt_at) where status in ('pending','sending');
create table private_push.attempts (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references private_push.deliveries(id) on delete cascade,
  attempted_at timestamptz not null default now(), status integer, code text not null check(length(code)<=40)
);
-- Defense in depth: neither endpoints nor encrypted subscription keys are exposed through PostgREST.
alter table private_push.subscriptions enable row level security;
alter table private_push.outbox enable row level security;
alter table private_push.deliveries enable row level security;
alter table private_push.attempts enable row level security;
revoke all on all tables in schema private_push from public,anon,authenticated;

create function public.push_ready() returns boolean language sql stable security definer set search_path='' as $$
 select enabled from private_push.configuration where singleton;
$$;
create function public.register_push(p_device uuid,p_endpoint text,p_p256dh text,p_auth text,p_label text)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); sid uuid:=public.try_uuid(auth.jwt()->>'session_id'); result uuid;
begin
 if me is null or not public.mfa_ok() or public.is_platform_banned() or not exists(select 1 from auth.sessions where id=sid and user_id=me) then raise exception 'PUSH_FORBIDDEN' using errcode='42501'; end if;
 if not public.push_ready() then raise exception 'PUSH_UNCONFIGURED'; end if;
 if p_device is null or p_endpoint is null or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9-]+\.push\.apple\.com|web\.push\.apple\.com)/[^[:space:]#]+$'
   or length(p_endpoint)>2048 or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' or p_label is null or length(p_label) not between 1 and 80 then raise exception 'PUSH_INVALID'; end if;
 perform 1 from public.profiles where id=me for update;
 if exists(select 1 from private_push.subscriptions where endpoint=p_endpoint and user_id<>me) then raise exception 'PUSH_DEVICE_IN_USE'; end if;
 if (select count(*) from private_push.subscriptions where user_id=me and device_id<>p_device)>=10 then raise exception 'PUSH_DEVICE_LIMIT'; end if;
 if exists(select 1 from private_push.subscriptions where user_id=me and device_id=p_device and updated_at>now()-interval '5 seconds') then raise exception 'PUSH_RATE_LIMIT'; end if;
 insert into private_push.subscriptions(user_id,session_id,device_id,endpoint,p256dh,auth_key,label)
 values(me,sid,p_device,p_endpoint,p_p256dh,p_auth,p_label)
 on conflict(user_id,device_id) do update set session_id=excluded.session_id,endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth_key=excluded.auth_key,label=excluded.label,updated_at=now()
 returning id into result;
 return result;
end;
$$;
create function public.list_push_devices() returns table(id uuid,device_id uuid,label text,created_at timestamptz,last_delivered_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.id,s.device_id,s.label,s.created_at,s.last_delivered_at from private_push.subscriptions s where s.user_id=auth.uid() and public.mfa_ok() and not public.is_platform_banned() order by s.created_at desc;
$$;
create function public.remove_push_device(p_device uuid default null,p_all boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'PUSH_FORBIDDEN' using errcode='42501'; end if;
 -- Revocation stays available during MFA challenges and bans, including sign-out.
 delete from private_push.subscriptions where user_id=auth.uid() and (p_all or device_id=p_device or p_device is null and session_id=public.try_uuid(auth.jwt()->>'session_id'));
end;
$$;
-- Only trusted table triggers and privileged workers can enqueue another account's events.
create function private_push.enqueue(p_user uuid,p_actor uuid,p_kind text,p_source uuid,p_key text,p_expiry timestamptz default now()+interval '1 hour') returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.push_ready() or p_user is null or p_user=p_actor or not exists(select 1 from private_push.subscriptions where user_id=p_user) then return; end if;
 perform 1 from public.profiles where id=p_user for update;
 if (select count(*) from private_push.outbox where user_id=p_user and created_at>now()-interval '1 minute')>=60 then return; end if;
 insert into private_push.outbox(user_id,actor_id,kind,source_id,dedupe_key,expires_at) values(p_user,p_actor,p_kind,p_source,p_key,p_expiry) on conflict do nothing;
end;
$$;
create function private_push.fanout() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private_push.deliveries(event_id,subscription_id) select new.id,s.id from private_push.subscriptions s where s.user_id=new.user_id;
 return null;
end;
$$;
create trigger push_outbox_fanout after insert on private_push.outbox for each row execute function private_push.fanout();

-- Invitation messages retain the existing DM-based invitation flow, with validated metadata.
alter table public.direct_messages add column invite_server_id uuid references public.servers(id) on delete set null;
create function private_push.guard_invite() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.invite_server_id is distinct from old.invite_server_id and new.invite_server_id is not null then raise exception 'INVITE_IMMUTABLE'; end if;
 elsif new.invite_server_id is not null and not exists(select 1 from public.members where server_id=new.invite_server_id and user_id=new.author_id) then raise exception 'INVITE_FORBIDDEN' using errcode='42501'; end if;
 return new;
end;
$$;
create trigger push_invite_guard before insert or update on public.direct_messages for each row execute function private_push.guard_invite();
create function private_push.capture() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; parent uuid; k text;
begin
 if tg_table_name='direct_messages' then
   k:=case when new.invite_server_id is null then 'dm' else 'invitation' end;
   for recipient in select user_id from public.dm_participants where conversation_id=new.conversation_id and user_id is distinct from new.author_id loop
     if not public.is_blocked_between(recipient,new.author_id) then perform private_push.enqueue(recipient,new.author_id,k,new.id,'dm:'||new.id); end if;
   end loop;
 elsif tg_table_name='message_mentions' then
   select author_id into parent from public.messages where id=new.message_id;
   perform private_push.enqueue(new.user_id,parent,'mention',new.message_id,'message:'||new.message_id);
 elsif tg_table_name='messages' then
   -- Explicit role mentions use @{Role name}; only moderators may notify a whole role.
   if exists(select 1 from public.members where server_id=new.server_id and user_id=new.author_id and role in ('admin','moderator')) then
     insert into public.message_mentions(message_id,user_id,channel_id,server_id,created_at)
     select distinct new.id,mr.user_id,new.channel_id,new.server_id,new.created_at
     from regexp_matches(new.content,'@\{([^{}]{1,32})\}','g') hit
     join public.server_roles role on role.server_id=new.server_id and lower(role.name)=lower(hit[1])
     join public.member_roles mr on mr.role_id=role.id
     where mr.user_id<>new.author_id and public.user_can_view_channel(mr.user_id,new.channel_id)
     on conflict do nothing;
   end if;
   select author_id into parent from public.messages where id=coalesce(new.reply_to_id,new.thread_id) and channel_id=new.channel_id;
   if parent is not null and public.user_can_view_channel(parent,new.channel_id) then perform private_push.enqueue(parent,new.author_id,'reply',new.id,'message:'||new.id); end if;
   if new.mentions_everyone then
     for recipient in select user_id from public.members where server_id=new.server_id and public.user_can_view_channel(user_id,new.channel_id) loop
       perform private_push.enqueue(recipient,new.author_id,'mention',new.id,'message:'||new.id);
     end loop;
   end if;
 elsif tg_table_name='friendships' then
   if new.status='pending' then perform private_push.enqueue(case when new.requested_by=new.user_low then new.user_high else new.user_low end,new.requested_by,'friend',new.requested_by,'friend:'||new.requested_by||':'||new.created_at,now()+interval '1 day'); end if;
 elsif tg_table_name='call_rings' then
   perform private_push.enqueue(new.callee_id,new.caller_id,'call',new.id,'call:'||new.id,new.expires_at);
 elsif tg_table_name='member_warnings' then
   perform private_push.enqueue(new.user_id,new.moderator_id,'moderation',new.id,'warning:'||new.id,now()+interval '1 day');
 elsif tg_table_name='account_controls' then
   if new.banned_until is not null and (tg_op='INSERT' or new.banned_until is distinct from old.banned_until) then perform private_push.enqueue(new.user_id,null,'security',new.user_id,'account:'||new.user_id||':'||new.updated_at,now()+interval '1 day'); end if;
 end if;
 return null;
end;
$$;
create trigger push_dm after insert on public.direct_messages for each row execute function private_push.capture();
create trigger push_mention after insert on public.message_mentions for each row execute function private_push.capture();
create trigger push_message after insert on public.messages for each row execute function private_push.capture();
create trigger push_friend after insert on public.friendships for each row execute function private_push.capture();
create trigger push_call after insert on public.call_rings for each row execute function private_push.capture();
create trigger push_warning after insert on public.member_warnings for each row execute function private_push.capture();
create trigger push_account after insert or update on public.account_controls for each row execute function private_push.capture();

-- Lease claims survive worker restarts; SKIP LOCKED allows multiple safe dispatchers.
create function public.claim_push_jobs(p_limit integer default 20) returns table(id uuid,lease uuid)
language plpgsql security definer set search_path='' as $$
begin
 if not public.push_ready() then return; end if;
 return query with due as (
   select d.id from private_push.deliveries d join private_push.outbox o on o.id=d.event_id
   where (d.status='pending' and d.next_attempt_at<=now() or d.status='sending' and d.lease_until<now()) and d.attempts<8 and o.expires_at>now()
   order by d.next_attempt_at for update of d skip locked limit least(greatest(coalesce(p_limit,20),1),50)
 ) update private_push.deliveries d set status='sending',attempts=d.attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 from due where d.id=due.id returning d.id,d.lease;
end;
$$;
-- Discovery includes verification and explicit community bans as well as role/channel grants.
create function private_push.can_view(p_user uuid,p_channel uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.user_can_view_channel(p_user,p_channel) and exists(
   select 1 from public.channels c where c.id=p_channel
     and not exists(select 1 from public.server_bans b where b.server_id=c.server_id and b.user_id=p_user)
     and (not c.requires_verification or exists(select 1 from auth.users u where u.id=p_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)))
 );
$$;
-- Every attempt resolves current data and rechecks access. The outbox never stores private bodies.
create function public.prepare_push_job(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private_push.deliveries; o private_push.outbox; s private_push.subscriptions; m record; context text; body text; href text; srv uuid; ch uuid; prefs jsonb; tag text;
begin
 if not public.push_ready() then return null; end if;
 select * into d from private_push.deliveries where id=p_id and lease=p_lease and status='sending' and lease_until>now();
 if not found then return null; end if;
 select * into o from private_push.outbox where id=d.event_id and expires_at>now();
 if not found then return null; end if;
 select * into s from private_push.subscriptions where id=d.subscription_id and user_id=o.user_id;
 if not found or not exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and not exists(select 1 from public.account_controls c where c.user_id=s.user_id and a.created_at<c.sessions_revoked_at)) then return null; end if;
 if o.kind<>'security' and public.is_platform_banned(o.user_id) or o.actor_id is not null and (public.is_blocked_between(o.user_id,o.actor_id) or public.is_platform_banned(o.actor_id)) then return null; end if;
 select value into prefs from public.account_state where user_id=o.user_id and key='prefs:notifications';
 if o.kind in ('dm','invitation') then
   select dm.*,p.display_name,c.name as group_name into m from public.direct_messages dm join public.profiles p on p.id=dm.author_id join public.dm_conversations c on c.id=dm.conversation_id
   where dm.id=o.source_id and dm.author_id=o.actor_id and exists(select 1 from public.dm_participants where conversation_id=dm.conversation_id and user_id=o.user_id)
     and exists(select 1 from public.dm_participants where conversation_id=dm.conversation_id and user_id=dm.author_id);
   if not found then return null; end if;
   if o.kind='invitation' then srv:=m.invite_server_id; end if;
   context:=m.display_name||coalesce(' · '||m.group_name,''); body:=coalesce(nullif(m.content,''),'Sent an attachment'); href:='/tambayan/dm/'||m.conversation_id||'?message='||m.id; tag:='dm:'||m.conversation_id;
 elsif o.kind in ('mention','reply') then
   select msg.*,p.display_name,c.name as channel_name,sr.name as server_name,c.requires_verification into m from public.messages msg join public.profiles p on p.id=msg.author_id join public.channels c on c.id=msg.channel_id join public.servers sr on sr.id=msg.server_id where msg.id=o.source_id and msg.author_id=o.actor_id;
   if not found or not private_push.can_view(o.user_id,m.channel_id) or m.requires_verification and not exists(select 1 from auth.users where id=o.user_id and (email_confirmed_at is not null or phone_confirmed_at is not null)) then return null; end if;
   srv:=m.server_id; ch:=m.channel_id; context:=m.display_name||' · '||m.server_name||' / #'||m.channel_name; body:=m.content;
   href:='/tambayan/'||srv||'/'||ch||'?message='||m.id||case when m.thread_id is not null then '&thread='||m.thread_id else '' end; tag:='channel:'||ch;
 elsif o.kind='friend' then
   if not exists(select 1 from public.friendships where user_low=least(o.user_id,o.actor_id) and user_high=greatest(o.user_id,o.actor_id) and requested_by=o.actor_id and status='pending') then return null; end if;
   select display_name into context from public.profiles where id=o.actor_id; body:='Sent you a friend request'; href:='/tambayan/friends'; tag:='friends';
 elsif o.kind='call' then
   select * into m from public.call_rings where id=o.source_id and callee_id=o.user_id and status='ringing' and expires_at>now();
   if not found then return null; end if;
   if m.kind='dm' then
     if not exists(select 1 from public.dm_participants where conversation_id=m.conversation_id and user_id=o.user_id) then return null; end if;
     href:='/tambayan/dm/'||m.conversation_id;
   else
     if not private_push.can_view(o.user_id,m.channel_id) then return null; end if;
     srv:=m.server_id; ch:=m.channel_id; href:='/tambayan/'||srv||'/'||ch;
   end if;
   select display_name into context from public.profiles where id=o.actor_id; body:='Incoming call invitation'; tag:='call:'||m.id;
 elsif o.kind='event' then
   select e.* into m from public.server_events e where e.id=o.source_id and exists(select 1 from public.event_rsvps r where r.event_id=e.id and r.user_id=o.user_id) and exists(select 1 from public.members where server_id=e.server_id and user_id=o.user_id);
   if not found or m.starts_at<now()-interval '5 minutes' or m.starts_at>now()+interval '15 minutes' or m.channel_id is not null and not private_push.can_view(o.user_id,m.channel_id) then return null; end if;
   srv:=m.server_id; ch:=m.channel_id; context:=m.name; body:='Your event starts soon';
   href:='/tambayan/'||srv||case when ch is not null then '/'||ch else '' end||'?event='||m.id; tag:='event:'||m.id;
 elsif o.kind='moderation' then
   select * into m from public.member_warnings where id=o.source_id and user_id=o.user_id;
   if not found then return null; end if;
   context:='Diskarte moderation'; body:='You have an important moderation notice'; href:='/tambayan'; tag:='moderation';
 elsif o.kind='security' then
   if not exists(select 1 from public.account_controls where user_id=o.user_id and banned_until>now()) then return null; end if;
   context:='Diskarte account'; body:='Your account status has changed'; href:='/tambayan'; tag:='account';
 elsif o.kind='test' then context:='Diskarte'; body:='Server-delivered push is connected on this device.'; href:='/settings'; tag:='push-test';
 else return null;
 end if;
 return jsonb_build_object('id',o.id,'userId',o.user_id,'kind',o.kind,'serverId',srv,'channelId',ch,'prefs',coalesce(prefs,'{}'::jsonb),'title',context,'body',left(body,180),'href',href,'tag',tag,'timestamp',extract(epoch from o.created_at)*1000,'expiresAt',o.expires_at,'attempt',d.attempts,
 'badge',(select count(*) from public.dm_participants dp join public.dm_conversations dc on dc.id=dp.conversation_id where dp.user_id=o.user_id and dc.last_message_at>dp.last_read_at)
   +(select count(*) from public.channels c join public.members mb on mb.server_id=c.server_id and mb.user_id=o.user_id left join public.channel_reads cr on cr.channel_id=c.id and cr.user_id=o.user_id where c.last_message_at>coalesce(cr.last_read_at,mb.joined_at) and private_push.can_view(o.user_id,c.id)),
 'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key)));
end;
$$;
create function public.finish_push_job(p_id uuid,p_lease uuid,p_result text,p_status integer default null,p_code text default 'ok',p_delay integer default 60) returns void
language plpgsql security definer set search_path='' as $$
declare changed private_push.deliveries;
begin
 if p_result not in ('sent','skipped','failed','retry','expired') or p_code is null or length(p_code)>40 then raise exception 'PUSH_INVALID_RESULT'; end if;
 update private_push.deliveries set status=case when p_result='retry' and attempts<8 then 'pending' when p_result='retry' or p_result='expired' then 'failed' else p_result end,
 next_attempt_at=now()+make_interval(secs=>least(greatest(coalesce(p_delay,60),1),3600)),lease=null,lease_until=null,last_status=p_status,last_code=p_code
 where id=p_id and lease=p_lease and status='sending' and lease_until>now() returning * into changed;
 if not found then return; end if;
 insert into private_push.attempts(delivery_id,status,code) values(p_id,p_status,p_code);
 if p_result='sent' then update private_push.subscriptions set last_delivered_at=now() where id=changed.subscription_id; end if;
 if p_result='expired' then delete from private_push.subscriptions where id=changed.subscription_id; end if;
end;
$$;
create function public.request_push_test(p_device uuid) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); event uuid:=gen_random_uuid();
begin
 if me is null or not public.push_ready() or not public.mfa_ok() or public.is_platform_banned() or not exists(select 1 from private_push.subscriptions where user_id=me and device_id=p_device) then raise exception 'PUSH_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.profiles where id=me for update;
 if exists(select 1 from private_push.outbox where user_id=me and kind='test' and created_at>now()-interval '1 minute') then raise exception 'PUSH_RATE_LIMIT'; end if;
 insert into private_push.outbox(id,user_id,kind,source_id,dedupe_key,expires_at) values(event,me,'test',event,'test:'||event,now()+interval '5 minutes');
 delete from private_push.deliveries where event_id=event and subscription_id not in(select id from private_push.subscriptions where user_id=me and device_id=p_device);
end;
$$;
create function public.tick_push() returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if not public.push_ready() then return; end if;
 for r in select e.id,e.starts_at,rsvp.user_id from public.server_events e join public.event_rsvps rsvp on rsvp.event_id=e.id
   where e.starts_at between now() and now()+interval '15 minutes'
   and exists(select 1 from private_push.subscriptions where user_id=rsvp.user_id)
   and not exists(select 1 from private_push.outbox where user_id=rsvp.user_id and dedupe_key='event:'||e.id||':'||e.starts_at)
   order by e.starts_at,e.id,rsvp.user_id limit 1000
 loop
   perform private_push.enqueue(r.user_id,null,'event',r.id,'event:'||r.id||':'||r.starts_at,r.starts_at+interval '5 minutes');
 end loop;
 update private_push.deliveries d set status='failed',lease=null,lease_until=null,last_code='expired'
 where d.status in ('pending','sending') and (d.lease_until is null or d.lease_until<now())
   and (d.attempts>=8 or exists(select 1 from private_push.outbox o where o.id=d.event_id and o.expires_at<=now()));
 delete from private_push.outbox where created_at<now()-interval '7 days';
 delete from private_push.subscriptions s where exists(select 1 from public.account_controls c join auth.sessions a on a.user_id=c.user_id where s.session_id=a.id and a.created_at<c.sessions_revoked_at);
end;
$$;
-- Security boundaries are explicit, including functions in a schema with Supabase default grants.
revoke all on all functions in schema private_push from public,anon,authenticated,service_role;
revoke all on function public.push_ready(),public.register_push(uuid,text,text,text,text),public.list_push_devices(),public.remove_push_device(uuid,boolean),public.request_push_test(uuid) from public,anon;
grant execute on function public.push_ready(),public.register_push(uuid,text,text,text,text),public.list_push_devices(),public.remove_push_device(uuid,boolean),public.request_push_test(uuid) to authenticated;
revoke all on function public.claim_push_jobs(integer),public.prepare_push_job(uuid,uuid),public.finish_push_job(uuid,uuid,text,integer,text,integer),public.tick_push() from public,anon,authenticated;
grant execute on function public.claim_push_jobs(integer),public.prepare_push_job(uuid,uuid),public.finish_push_job(uuid,uuid,text,integer,text,integer),public.tick_push() to service_role;
-- A full batch schedules another immediate drain without an in-process background job.
create function public.wake_push() returns void language plpgsql security definer set search_path='' as $$
begin
 if to_regprocedure('private_push.wake()') is not null then execute 'select private_push.wake()'; end if;
end;
$$;
revoke all on function public.wake_push() from public,anon,authenticated;
grant execute on function public.wake_push() to service_role;
