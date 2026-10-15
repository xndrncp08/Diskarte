-- Extends the existing private export without changing its earlier fields.
-- =====================================================================================
-- "Request all of my data": one JSON document of everything this account wrote or set —
-- profile, servers, messages, DMs, reactions, friends, blocks, notes, nicknames, saved
-- messages, poll votes, event RSVPs, warnings received, LFG posts, problem reports and
-- settings. Other people's content (beyond who you're connected to) isn't included.
-- =====================================================================================

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.mfa_ok() or public.is_platform_banned() then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'account_state', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'updated_at', s.updated_at)) from public.account_state s where s.user_id=me), '[]'),
    'privacy', (select to_jsonb(ps) - 'user_id' from public.privacy_settings ps where ps.user_id = me),
    'servers', coalesce((
      select jsonb_agg(jsonb_build_object('server_id', s.id, 'name', s.name, 'role', m.role, 'nickname', m.nickname, 'joined_at', m.joined_at, 'owner', coalesce(s.owner_id = me, false)) order by m.joined_at)
      from public.members m join public.servers s on s.id = m.server_id where m.user_id = me), '[]'),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'server', s.name, 'channel', c.name, 'content', x.content, 'title', x.title, 'attachments', x.attachments, 'sticker', x.sticker, 'reply_to_id', x.reply_to_id, 'thread_id', x.thread_id, 'created_at', x.created_at, 'edited_at', x.edited_at) order by x.created_at)
      from (select * from public.messages where author_id = me order by created_at desc limit 50000) x
      join public.channels c on c.id = x.channel_id join public.servers s on s.id = x.server_id), '[]'),
    'direct_messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'conversation_id', d.conversation_id, 'content', d.content, 'sticker', d.sticker, 'attachments', d.attachments, 'created_at', d.created_at, 'edited_at', d.edited_at) order by d.created_at)
      from (select * from public.direct_messages where author_id = me order by created_at desc limit 50000) d), '[]'),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('message_id', r.message_id, 'emoji', r.emoji, 'created_at', r.created_at)) from public.reactions r where r.user_id = me), '[]'),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('username', p.username, 'status', f.status, 'requested_by_me', f.requested_by = me, 'since', coalesce(f.accepted_at, f.created_at)))
      from public.friendships f join public.profiles p on p.id = case when f.user_low = me then f.user_high else f.user_low end
      where me in (f.user_low, f.user_high)), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'since', b.created_at)) from public.user_blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = me), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('about', p.username, 'note', n.note, 'updated_at', n.updated_at)) from public.user_notes n join public.profiles p on p.id = n.target_id where n.owner_id = me), '[]'),
    'friend_nicknames', coalesce((select jsonb_agg(jsonb_build_object('for', p.username, 'nickname', n.nickname)) from public.friend_nicknames n join public.profiles p on p.id = n.target_id where n.owner_id = me), '[]'),
    'saved_messages', coalesce((select jsonb_agg(jsonb_build_object('message_id', sm.message_id, 'saved_at', sm.saved_at)) from public.saved_messages sm where sm.user_id = me), '[]'),
    'poll_votes', coalesce((select jsonb_agg(jsonb_build_object('message_id', v.message_id, 'option', v.option, 'created_at', v.created_at)) from public.poll_votes v where v.user_id = me), '[]'),
    'event_rsvps', coalesce((select jsonb_agg(jsonb_build_object('event', e.name, 'starts_at', e.starts_at)) from public.event_rsvps r join public.server_events e on e.id = r.event_id where r.user_id = me), '[]'),
    'warnings_received', coalesce((select jsonb_agg(jsonb_build_object('server', s.name, 'reason', w.reason, 'created_at', w.created_at)) from public.member_warnings w join public.servers s on s.id = w.server_id where w.user_id = me), '[]'),
    'lfg_posts', coalesce((select jsonb_agg(jsonb_build_object('game', l.game, 'description', l.description, 'created_at', l.created_at)) from public.lfg_beacons l where l.author_id = me), '[]'),
    'problem_reports', coalesce((select jsonb_agg(jsonb_build_object('category', pr.category, 'description', pr.description, 'status', pr.status, 'created_at', pr.created_at)) from public.problem_reports pr where pr.reporter_id = me), '[]')
  );
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
