-- =====================================================================================
-- Notifications that came back after being read.
--   1. Push jobs are queued and retried (up to 8 attempts, back-off up to an hour), and the
--      worker never checked read state: a DM or mention already read in the app (on any device)
--      was still pushed later. prepare_push_job now skips anything the recipient has read.
--   2. Read receipts are saved "up to when I looked" (capped at server time), so a receipt that
--      is retried later (offline, app suspended) can't mark messages read that arrived after.
--      New names; the old one-argument functions stay for older clients.
-- =====================================================================================

create or replace function public.prepare_push_job(p_id uuid,p_lease uuid) returns jsonb
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
   -- Already read (on any device) by the time this attempt runs: nothing to announce.
   if exists(select 1 from public.dm_participants where conversation_id=m.conversation_id and user_id=o.user_id and last_read_at>=m.created_at) then return null; end if;
   if o.kind='invitation' then srv:=m.invite_server_id; end if;
   context:=m.display_name||coalesce(' · '||m.group_name,''); body:=coalesce(nullif(m.content,''),'Sent an attachment'); href:='/tambayan/dm/'||m.conversation_id||'?message='||m.id; tag:='dm:'||m.conversation_id;
 elsif o.kind in ('mention','reply') then
   select msg.*,p.display_name,c.name as channel_name,sr.name as server_name,c.requires_verification into m from public.messages msg join public.profiles p on p.id=msg.author_id join public.channels c on c.id=msg.channel_id join public.servers sr on sr.id=msg.server_id where msg.id=o.source_id and msg.author_id=o.actor_id;
   if not found or not private_push.can_view(o.user_id,m.channel_id) or m.requires_verification and not exists(select 1 from auth.users where id=o.user_id and (email_confirmed_at is not null or phone_confirmed_at is not null)) then return null; end if;
   -- A channel message already read (channel read cursor past it) isn't news; thread replies have no cursor.
   if m.thread_id is null and exists(select 1 from public.channel_reads where channel_id=m.channel_id and user_id=o.user_id and last_read_at>=m.created_at) then return null; end if;
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

create or replace function public.mark_channel_read_until(p_channel uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  at timestamptz := least(coalesce(p_at, now()), now());
begin
  if me is null or not public.can_view_channel(p_channel) then
    return;
  end if;
  insert into public.channel_reads (user_id, channel_id, last_read_at)
  values (me, p_channel, at)
  on conflict (user_id, channel_id) do update set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at);
end;
$$;

create or replace function public.mark_dm_read_until(p_conversation_id uuid, p_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.dm_participants
  set last_read_at = greatest(last_read_at, least(coalesce(p_at, now()), now()))
  where conversation_id = p_conversation_id and user_id = (select auth.uid());
$$;

revoke execute on function public.mark_channel_read_until(uuid, timestamptz), public.mark_dm_read_until(uuid, timestamptz) from public, anon;
grant execute on function public.mark_channel_read_until(uuid, timestamptz), public.mark_dm_read_until(uuid, timestamptz) to authenticated;
