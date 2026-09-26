-- =====================================================================================
-- Diskarte — community features (applied after the security hardening migration)
--   * Bantay-Bayan moderation: audit log, bans, auto-mod, slow mode, verification gates
--   * Threads + stickers on channel messages
--   * Server support: GCash/Maya details and booster / supporter badges
--   * LFG beacons with 1-click parties, custom soundboard clips
--   * Friends, blocks, direct messages and group DMs
-- Every table has RLS; anything with invariants is written through SECURITY DEFINER RPCs.
-- =====================================================================================

-- =====================================================================================
-- 0) Fix: deleting a message that others replied to failed, because the `on delete set null`
--    cascade on reply_to_id tripped the immutable-field guard. Referential actions run as
--    nested triggers (pg_trigger_depth() > 1) and may null those references.
-- =====================================================================================
create or replace function public.messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  cascading boolean := pg_trigger_depth() > 1;
begin
  if caller is null then
    return new;
  end if;
  if new.id <> old.id
     or new.channel_id <> old.channel_id
     or new.server_id <> old.server_id
     or new.author_id is distinct from old.author_id
     or new.created_at <> old.created_at
     or (new.reply_to_id is distinct from old.reply_to_id and not (cascading and new.reply_to_id is null))
     or new.attachments <> old.attachments then
    raise exception 'MESSAGE_IMMUTABLE_FIELD' using errcode = '42501';
  end if;

  if new.content is distinct from old.content then
    if old.author_id is distinct from caller then
      raise exception 'ONLY_AUTHOR_CAN_EDIT' using errcode = '42501';
    end if;
    new.content := btrim(new.content);
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  if new.pinned is distinct from old.pinned then
    if not public.has_server_role(old.server_id, 'moderator') then
      raise exception 'ONLY_MODERATORS_CAN_PIN' using errcode = '42501';
    end if;
    if new.pinned then
      new.pinned_at := now();
      new.pinned_by := caller;
    else
      new.pinned_at := null;
      new.pinned_by := null;
    end if;
  elsif not (cascading and new.pinned_by is null) then
    new.pinned_at := old.pinned_at;
    new.pinned_by := old.pinned_by;
  end if;
  return new;
end;
$$;

-- =====================================================================================
-- 1) Schema changes on existing tables
-- =====================================================================================
alter table public.servers
  add column automod_enabled boolean not null default true,
  add column automod_categories text[] not null default array['spam', 'phishing', 'hate']
    check (automod_categories <@ array['spam', 'phishing', 'hate', 'explicit']),
  add column automod_custom_terms text[] not null default '{}'
    check (cardinality(automod_custom_terms) <= 100),
  add column gcash_number text check (gcash_number is null or gcash_number ~ '^09[0-9]{9}$'),
  add column maya_number text check (maya_number is null or maya_number ~ '^09[0-9]{9}$'),
  add column support_note text not null default '' check (char_length(support_note) <= 280);

alter table public.channels
  add column slowmode_seconds integer not null default 0 check (slowmode_seconds between 0 and 21600),
  add column requires_verification boolean not null default false;

alter table public.messages
  add column thread_id uuid references public.messages (id) on delete cascade,
  add column sticker text check (sticker is null or sticker ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  add column thread_reply_count integer not null default 0,
  add column thread_last_reply_at timestamptz,
  drop constraint messages_not_empty,
  add constraint messages_not_empty check (
    char_length(btrim(content)) > 0 or jsonb_array_length(attachments) > 0 or sticker is not null
  );

create index messages_thread_idx on public.messages (thread_id, created_at) where thread_id is not null;

-- Custom auto-mod terms are stored trimmed, lower-case, unique and 2–60 characters long.
create or replace function public.servers_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.automod_custom_terms := coalesce((
    select array_agg(distinct t order by t)
    from (select lower(btrim(x)) as t from unnest(new.automod_custom_terms) as x) terms
    where char_length(t) between 2 and 60
  ), '{}');
  new.automod_categories := coalesce((select array_agg(distinct c order by c) from unnest(new.automod_categories) as c), '{}');
  new.support_note := btrim(new.support_note);
  return new;
end;
$$;

create trigger servers_normalize
  before insert or update on public.servers
  for each row execute function public.servers_normalize();

-- =====================================================================================
-- 2) Verification + small helpers
-- =====================================================================================

-- True when the signed-in account has a confirmed email or phone number.
create or replace function public.is_verified_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.email_confirmed_at is not null or u.phone_confirmed_at is not null
    from auth.users u where u.id = (select auth.uid())
  ), false);
$$;

create or replace function public.pair_key(a uuid, b uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select least(a, b)::text || ':' || greatest(a, b)::text;
$$;

-- =====================================================================================
-- 3) Audit log ("Bantay-Bayan" admin panel)
-- =====================================================================================
create table public.audit_logs (
  id bigint generated always as identity primary key,
  server_id uuid not null references public.servers (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text check (target_type in ('member', 'channel', 'message', 'server', 'badge', 'soundboard', 'lfg')),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_server_idx on public.audit_logs (server_id, created_at desc, id desc);

-- Internal: only triggers and RPCs (running as the owner) can write audit entries.
create or replace function public.log_audit(
  p_server_id uuid,
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (server_id, actor_id, action, target_type, target_id, metadata)
  select p_server_id, (select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb)
  where exists (select 1 from public.servers s where s.id = p_server_id);
$$;

-- Members: joins, leaves, kicks and role changes. Cascades (server deletion, the owner joining
-- their brand-new server) are nested triggers and are not logged.
create or replace function public.members_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit(new.server_id, 'member.join', 'member', new.user_id);
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public.log_audit(new.server_id, 'member.role_update', 'member', new.user_id,
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(current_setting('diskarte.banning', true), '') = '1' then
      return old; -- ban_member logs its own entry
    end if;
    if caller is null or caller = old.user_id then
      perform public.log_audit(old.server_id, 'member.leave', 'member', old.user_id);
    else
      perform public.log_audit(old.server_id, 'member.kick', 'member', old.user_id);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger members_audit
  after insert or update or delete on public.members
  for each row execute function public.members_audit();

create or replace function public.channels_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit(new.server_id, 'channel.create', 'channel', new.id,
      jsonb_build_object('name', new.name, 'type', new.type));
  elsif tg_op = 'DELETE' then
    perform public.log_audit(old.server_id, 'channel.delete', 'channel', old.id,
      jsonb_build_object('name', old.name, 'type', old.type));
  else
    changed := array_remove(array[
      case when new.name is distinct from old.name then 'name' end,
      case when new.topic is distinct from old.topic then 'topic' end,
      case when new.category is distinct from old.category then 'category' end,
      case when new.slowmode_seconds is distinct from old.slowmode_seconds then 'slowmode_seconds' end,
      case when new.requires_verification is distinct from old.requires_verification then 'requires_verification' end
    ], null);
    if cardinality(changed) > 0 then
      perform public.log_audit(new.server_id, 'channel.update', 'channel', new.id,
        jsonb_build_object('name', new.name, 'changed', to_jsonb(changed),
          'slowmode_seconds', new.slowmode_seconds, 'requires_verification', new.requires_verification));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger channels_audit
  after insert or update or delete on public.channels
  for each row execute function public.channels_audit();

-- Messages: moderators deleting someone else's message, pins and unpins.
create or replace function public.messages_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 or caller is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.author_id is distinct from caller then
      perform public.log_audit(old.server_id, 'message.delete', 'message', old.id,
        jsonb_build_object('channel_id', old.channel_id, 'author_id', old.author_id, 'excerpt', left(old.content, 200)));
    end if;
  elsif new.pinned is distinct from old.pinned then
    perform public.log_audit(new.server_id, case when new.pinned then 'message.pin' else 'message.unpin' end,
      'message', new.id, jsonb_build_object('channel_id', new.channel_id, 'excerpt', left(new.content, 200)));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger messages_audit
  after update of pinned or delete on public.messages
  for each row execute function public.messages_audit();

create or replace function public.servers_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.invite_code is distinct from old.invite_code then
    perform public.log_audit(new.id, 'invite.regenerate', 'server', new.id);
  end if;
  if new.owner_id is distinct from old.owner_id then
    perform public.log_audit(new.id, 'server.transfer', 'member', new.owner_id,
      jsonb_build_object('from', old.owner_id));
  end if;
  changed := array_remove(array[
    case when new.name is distinct from old.name then 'name' end,
    case when new.description is distinct from old.description then 'description' end,
    case when new.icon_url is distinct from old.icon_url then 'icon' end,
    case when new.automod_enabled is distinct from old.automod_enabled
          or new.automod_categories is distinct from old.automod_categories
          or new.automod_custom_terms is distinct from old.automod_custom_terms then 'automod' end,
    case when new.gcash_number is distinct from old.gcash_number
          or new.maya_number is distinct from old.maya_number
          or new.support_note is distinct from old.support_note then 'support' end
  ], null);
  if cardinality(changed) > 0 then
    perform public.log_audit(new.id, 'server.update', 'server', new.id, jsonb_build_object('changed', to_jsonb(changed)));
  end if;
  return new;
end;
$$;

create trigger servers_audit
  after update on public.servers
  for each row execute function public.servers_audit();

-- =====================================================================================
-- 4) Bans
-- =====================================================================================
create table public.server_bans (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_by uuid references public.profiles (id) on delete set null,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create or replace function public.ban_member(p_server_id uuid, p_user_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.member_role := public.server_role(p_server_id);
  target_role public.member_role;
begin
  if caller_role is null or caller_role < 'moderator' then
    raise exception 'CANNOT_BAN_MEMBER' using errcode = '42501';
  end if;
  if p_user_id = caller or exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id) then
    raise exception 'CANNOT_BAN_MEMBER' using errcode = '42501';
  end if;
  select m.role into target_role from public.members m where m.server_id = p_server_id and m.user_id = p_user_id;
  if target_role is not null and target_role >= caller_role and not public.is_server_owner(p_server_id) then
    raise exception 'CANNOT_BAN_MEMBER' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform set_config('diskarte.banning', '1', true);
  delete from public.members where server_id = p_server_id and user_id = p_user_id;
  perform set_config('diskarte.banning', '', true);

  insert into public.server_bans (server_id, user_id, banned_by, reason)
  values (p_server_id, p_user_id, caller, left(btrim(coalesce(p_reason, '')), 200))
  on conflict (server_id, user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by;

  perform public.log_audit(p_server_id, 'member.ban', 'member', p_user_id,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 200)));
end;
$$;

create or replace function public.unban_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_server_role(p_server_id, 'moderator') then
    raise exception 'CANNOT_BAN_MEMBER' using errcode = '42501';
  end if;
  delete from public.server_bans where server_id = p_server_id and user_id = p_user_id;
  if found then
    perform public.log_audit(p_server_id, 'member.unban', 'member', p_user_id);
  end if;
end;
$$;

-- join_server now refuses banned accounts.
create or replace function public.join_server(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  joined int;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select s.id into target from public.servers s where s.invite_code = upper(btrim(p_code));
  if target is null then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.server_bans b where b.server_id = target and b.user_id = caller) then
    raise exception 'BANNED' using errcode = '42501';
  end if;
  select count(*) into joined from public.members m where m.user_id = caller;
  if joined >= 100 and not public.is_server_member(target) then
    raise exception 'SERVER_JOIN_LIMIT' using errcode = '53400';
  end if;
  insert into public.members (server_id, user_id, role)
  values (target, caller, 'member')
  on conflict (server_id, user_id) do nothing;
  return target;
end;
$$;

-- =====================================================================================
-- 5) Auto-mod, slow mode, verification gate and threads for channel messages
-- =====================================================================================

-- Returns the first matching category ('phishing', 'hate', 'explicit', 'spam', 'custom') or null.
-- Hate/explicit/custom terms are matched on a leetspeak-normalised copy ("n00b" → "noob").
create or replace function public.automod_match(p_content text, p_categories text[], p_custom text[] default '{}')
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text := lower(coalesce(p_content, ''));
  norm text := translate(lower(coalesce(p_content, '')), '013457@$!', 'oieastasi');
  host text;
  term text;
begin
  if raw = '' then
    return null;
  end if;

  if 'phishing' = any (p_categories) then
    for host in
      select m[1] from regexp_matches(raw, '(?:https?://|www\.)([^/\s?#:<>"'']+)', 'g') as m
    loop
      host := regexp_replace(host, '^www\.', '');
      if host ~ '^xn--|\.xn--'
         or host ~ '(dlscord|disc0rd|d1scord|discorcl|discrod|dicsord|discordd|discord-?nitro|nitro-?discord|steamcommunnity|steamcomunity|stearncommunity|steancommunity|grabify|iplogger|blasze|2no\.co|yip\.su)'
         or (host ~ '(^|[.-])(gcash|maya|paymaya|bdo|bpi|metrobank|landbank|unionbank|securitybank|discord|steam|shopee|lazada)([.-]|$)'
             and host !~ '(^|\.)(gcash\.com|maya\.ph|paymaya\.com|bdo\.com\.ph|bpi\.com\.ph|metrobank\.com\.ph|landbank\.com|unionbankph\.com|securitybank\.com|discord\.com|discord\.gg|discordapp\.com|discordapp\.net|discord\.gift|discord\.media|steampowered\.com|steamcommunity\.com|steamstatic\.com|shopee\.ph|lazada\.com\.ph)$') then
        return 'phishing';
      end if;
    end loop;
  end if;

  if 'hate' = any (p_categories)
     and norm ~ '\m(n+i+g+(g+|e)+(a+|e+r+|u+h+|a+h+)s?|f+a+g+(g+o+t+)?s?|chinks?|kikes?|tr+a+n+n+(y|ies)|retards?|spics?|wetbacks?)\M' then
    return 'hate';
  end if;

  if 'explicit' = any (p_categories)
     and norm ~ '\m(porn|pornhub|xvideos|xhamster|xnxx|onlyfans|nudes?|hentai|pekpek|titi|burat|iyot|kantot|jakol|chupa|hubad|scandal\s*video)\M' then
    return 'explicit';
  end if;

  if 'spam' = any (p_categories) and (
       raw ~ '(.)\1{29,}'
       or (select count(*) from regexp_matches(raw, '(^|[^a-z0-9_.])@[a-z0-9_.]{3,32}', 'g')) >= 6
       or (select count(*) from regexp_matches(raw, 'https?://', 'g')) >= 5
       or raw ~ '(free\s*nitro|nitro\s*(for\s*)?free|claim\s+your\s+(prize|reward|nitro|gift)|double\s+your\s+(money|gcash|pera)|(send|padala|mag-?send)\M.*\mgcash\M.*\m(double|doble|x2)\M|(earn|kumita|kita)\s+(ng\s+)?(php|p|₱)?\s?[0-9][0-9,]*k?\s*(daily|per\s*day|a\s*day|araw-araw|kada\s*araw))'
     ) then
    return 'spam';
  end if;

  foreach term in array coalesce(p_custom, '{}') loop
    if position(translate(term, '013457@$!', 'oieastasi') in norm) > 0 then
      return 'custom';
    end if;
  end loop;
  return null;
end;
$$;

-- Runs after messages_before_insert (triggers fire in name order).
create or replace function public.messages_before_insert_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  ch record;
  srv record;
  is_mod boolean;
  last_sent timestamptz;
  remaining int;
  root record;
  category text;
begin
  if new.thread_id is not null then
    select m.channel_id, m.thread_id into root from public.messages m where m.id = new.thread_id;
    if not found or root.channel_id <> new.channel_id or root.thread_id is not null then
      raise exception 'INVALID_THREAD' using errcode = '23514';
    end if;
  end if;
  new.thread_reply_count := 0;
  new.thread_last_reply_at := null;

  if caller is null then
    return new;
  end if;

  select c.slowmode_seconds, c.requires_verification into ch from public.channels c where c.id = new.channel_id;
  is_mod := public.has_server_role(new.server_id, 'moderator');

  if ch.requires_verification and not is_mod and not public.is_verified_user() then
    raise exception 'VERIFICATION_REQUIRED' using errcode = '42501',
      hint = 'I-verify muna ang email o phone number mo bago mag-chat dito.';
  end if;

  if ch.slowmode_seconds > 0 and not is_mod then
    select max(m.created_at) into last_sent
    from public.messages m
    where m.author_id = caller and m.channel_id = new.channel_id;
    if last_sent is not null and last_sent > now() - make_interval(secs => ch.slowmode_seconds) then
      remaining := ceil(extract(epoch from (last_sent + make_interval(secs => ch.slowmode_seconds) - now())))::int;
      raise exception 'SLOWMODE' using errcode = '53400', detail = greatest(remaining, 1)::text,
        hint = 'Slow mode is on — hinay-hinay lang.';
    end if;
  end if;

  select s.automod_enabled, s.automod_categories, s.automod_custom_terms into srv from public.servers s where s.id = new.server_id;
  if srv.automod_enabled and not is_mod then
    category := public.automod_match(new.content, srv.automod_categories, srv.automod_custom_terms);
    -- Flooding: the same text three times in a minute.
    if category is null and 'spam' = any (srv.automod_categories) and char_length(new.content) > 0 and (
      select count(*) from (
        select m.content from public.messages m
        where m.author_id = caller and m.channel_id = new.channel_id and m.created_at > now() - interval '60 seconds'
        order by m.created_at desc limit 2
      ) recent where recent.content = new.content
    ) >= 2 then
      category := 'spam';
    end if;
    if category is not null then
      -- The message is silently dropped (the insert returns no row) and the block is logged
      -- for moderators. Raising instead would roll back the audit entry.
      perform public.log_audit(new.server_id, 'automod.block', 'message', null,
        jsonb_build_object('channel_id', new.channel_id, 'author_id', caller, 'category', category,
          'excerpt', left(new.content, 200)));
      return null;
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_before_insert_community
  before insert on public.messages
  for each row execute function public.messages_before_insert_community();

-- Thread counters and stickers are server-maintained; edits are re-scanned by auto-mod.
create or replace function public.messages_before_update_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  srv record;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.thread_id is distinct from old.thread_id
     or new.sticker is distinct from old.sticker
     or new.thread_reply_count <> old.thread_reply_count
     or new.thread_last_reply_at is distinct from old.thread_last_reply_at then
    raise exception 'MESSAGE_IMMUTABLE_FIELD' using errcode = '42501';
  end if;
  if new.content is distinct from old.content and not public.has_server_role(old.server_id, 'moderator') then
    select s.automod_enabled, s.automod_categories, s.automod_custom_terms into srv from public.servers s where s.id = old.server_id;
    if srv.automod_enabled and public.automod_match(new.content, srv.automod_categories, srv.automod_custom_terms) is not null then
      raise exception 'AUTOMOD_BLOCKED' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_before_update_community
  before update on public.messages
  for each row execute function public.messages_before_update_community();

create or replace function public.messages_thread_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.thread_id is not null then
    update public.messages
    set thread_reply_count = thread_reply_count + 1, thread_last_reply_at = new.created_at
    where id = new.thread_id;
  elsif tg_op = 'DELETE' and old.thread_id is not null then
    update public.messages
    set thread_reply_count = greatest(thread_reply_count - 1, 0)
    where id = old.thread_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger messages_thread_counters
  after insert or delete on public.messages
  for each row execute function public.messages_thread_counters();

-- =====================================================================================
-- 6) Server support: badges (Server Booster, Lodi Supporter, GCash Contributor)
-- =====================================================================================
create table public.server_badges (
  server_id uuid not null,
  user_id uuid not null,
  badge text not null check (badge in ('booster', 'lodi_supporter', 'gcash_contributor')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id, badge),
  foreign key (server_id, user_id) references public.members (server_id, user_id) on delete cascade
);

create or replace function public.server_badges_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.granted_by := coalesce((select auth.uid()), new.granted_by);
  new.created_at := now();
  return new;
end;
$$;

create trigger server_badges_before_insert
  before insert on public.server_badges
  for each row execute function public.server_badges_before_insert();

create or replace function public.server_badges_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit(new.server_id, 'badge.grant', 'member', new.user_id, jsonb_build_object('badge', new.badge));
  else
    perform public.log_audit(old.server_id, 'badge.revoke', 'member', old.user_id, jsonb_build_object('badge', old.badge));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger server_badges_audit
  after insert or delete on public.server_badges
  for each row execute function public.server_badges_audit();

-- =====================================================================================
-- 7) LFG beacons
-- =====================================================================================
create table public.lfg_beacons (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (char_length(btrim(game)) between 1 and 48),
  description text not null default '' check (char_length(description) <= 200),
  party_size integer not null check (party_size between 2 and 10),
  voice_channel_id uuid references public.channels (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'full', 'closed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index lfg_beacons_server_idx on public.lfg_beacons (server_id, created_at desc);

create table public.lfg_party_members (
  beacon_id uuid not null references public.lfg_beacons (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (beacon_id, user_id)
);

create index lfg_party_members_server_idx on public.lfg_party_members (server_id);
create index lfg_party_members_user_idx on public.lfg_party_members (user_id);

create or replace function public.create_lfg(
  p_server_id uuid,
  p_game text,
  p_description text default '',
  p_party_size integer default 5,
  p_voice_channel_id uuid default null,
  p_duration_minutes integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_id uuid;
begin
  if not public.is_server_member(p_server_id) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;
  if p_voice_channel_id is not null and not exists (
    select 1 from public.channels c where c.id = p_voice_channel_id and c.server_id = p_server_id and c.type = 'voice'
  ) then
    raise exception 'INVALID_VOICE_CHANNEL' using errcode = '23514';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 15 and 240 then
    raise exception 'INVALID_DURATION' using errcode = '23514';
  end if;

  -- One live beacon per person per server: posting a new one closes the old.
  update public.lfg_beacons set status = 'closed'
  where server_id = p_server_id and author_id = caller and status <> 'closed';

  insert into public.lfg_beacons (server_id, author_id, game, description, party_size, voice_channel_id, expires_at)
  values (p_server_id, caller, btrim(p_game), btrim(coalesce(p_description, '')), p_party_size, p_voice_channel_id,
          now() + make_interval(mins => p_duration_minutes))
  returning id into new_id;

  insert into public.lfg_party_members (beacon_id, server_id, user_id) values (new_id, p_server_id, caller);
  return new_id;
end;
$$;

-- 1-click "Join Party": returns the beacon's voice channel (if any) so the client can hop in.
create or replace function public.join_lfg(p_beacon_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  b record;
  size int;
begin
  select * into b from public.lfg_beacons where id = p_beacon_id for update;
  if not found or not public.is_server_member(b.server_id) then
    raise exception 'LFG_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.lfg_party_members p where p.beacon_id = p_beacon_id and p.user_id = caller) then
    return b.voice_channel_id;
  end if;
  if b.status = 'closed' or b.expires_at <= now() then
    raise exception 'LFG_CLOSED' using errcode = '23514';
  end if;
  select count(*) into size from public.lfg_party_members p where p.beacon_id = p_beacon_id;
  if size >= b.party_size then
    raise exception 'LFG_FULL' using errcode = '23514';
  end if;
  insert into public.lfg_party_members (beacon_id, server_id, user_id) values (p_beacon_id, b.server_id, caller);
  if size + 1 >= b.party_size then
    update public.lfg_beacons set status = 'full' where id = p_beacon_id;
  end if;
  return b.voice_channel_id;
end;
$$;

create or replace function public.leave_lfg(p_beacon_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  b record;
begin
  select * into b from public.lfg_beacons where id = p_beacon_id for update;
  if not found then
    return;
  end if;
  if b.author_id = caller then
    update public.lfg_beacons set status = 'closed' where id = p_beacon_id;
    return;
  end if;
  delete from public.lfg_party_members where beacon_id = p_beacon_id and user_id = caller;
  if found and b.status = 'full' then
    update public.lfg_beacons set status = 'open' where id = p_beacon_id;
  end if;
end;
$$;

create or replace function public.close_lfg(p_beacon_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
begin
  select * into b from public.lfg_beacons where id = p_beacon_id;
  if not found or (b.author_id <> (select auth.uid()) and not public.has_server_role(b.server_id, 'moderator')) then
    raise exception 'CANNOT_CLOSE_LFG' using errcode = '42501';
  end if;
  update public.lfg_beacons set status = 'closed' where id = p_beacon_id;
  if b.author_id <> (select auth.uid()) then
    perform public.log_audit(b.server_id, 'lfg.close', 'lfg', b.id, jsonb_build_object('game', b.game));
  end if;
end;
$$;

-- Leaving (or being removed from) a server closes your beacons and drops you from parties.
create or replace function public.members_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lfg_beacons set status = 'closed'
  where server_id = old.server_id and author_id = old.user_id and status <> 'closed';
  delete from public.lfg_party_members where server_id = old.server_id and user_id = old.user_id;
  update public.lfg_beacons b set status = 'open'
  where b.server_id = old.server_id and b.status = 'full'
    and (select count(*) from public.lfg_party_members p where p.beacon_id = b.id) < b.party_size;
  return old;
end;
$$;

create trigger members_cleanup
  after delete on public.members
  for each row execute function public.members_cleanup();

-- =====================================================================================
-- 8) Soundboard (uploaded clips; the 8-bit meme sounds are built into the client)
-- =====================================================================================
create table public.soundboard_clips (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  emoji text not null default '🔊' check (char_length(emoji) between 1 and 16),
  storage_path text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index soundboard_clips_server_idx on public.soundboard_clips (server_id, created_at);

create or replace function public.soundboard_clips_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.created_at := now();
    new.name := btrim(new.name);
    if new.storage_path !~ ('^' || new.server_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$') then
      raise exception 'INVALID_CLIP_PATH' using errcode = '23514';
    end if;
    if (select count(*) from public.soundboard_clips c where c.server_id = new.server_id) >= 24 then
      raise exception 'SOUNDBOARD_FULL' using errcode = '53400';
    end if;
  else
    if new.server_id <> old.server_id or new.storage_path <> old.storage_path
       or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise exception 'CLIP_IMMUTABLE_FIELD' using errcode = '42501';
    end if;
    new.name := btrim(new.name);
  end if;
  return new;
end;
$$;

create trigger soundboard_clips_guard
  before insert or update on public.soundboard_clips
  for each row execute function public.soundboard_clips_guard();

create or replace function public.soundboard_clips_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit(new.server_id, 'soundboard.add', 'soundboard', new.id, jsonb_build_object('name', new.name));
  else
    perform public.log_audit(old.server_id, 'soundboard.remove', 'soundboard', old.id, jsonb_build_object('name', old.name));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger soundboard_clips_audit
  after insert or delete on public.soundboard_clips
  for each row execute function public.soundboard_clips_audit();

-- =====================================================================================
-- 9) Friends and blocks
-- =====================================================================================
create table public.friendships (
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);

create index friendships_high_idx on public.friendships (user_high);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b) or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_low = least(a, b) and f.user_high = greatest(a, b) and f.status = 'accepted'
  );
$$;

-- Send (or accept, if they already asked you) a friend request by @username.
-- Returns 'pending' or 'accepted'. Blocks look like "user not found" to avoid leaking them.
create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid;
  existing record;
  outgoing int;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select p.id into target from public.profiles p where p.username = lower(btrim(ltrim(btrim(p_username), '@')));
  if target is null or public.is_blocked_between(caller, target) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target = caller then
    raise exception 'CANNOT_FRIEND_SELF' using errcode = '23514';
  end if;

  select * into existing from public.friendships f
  where f.user_low = least(caller, target) and f.user_high = greatest(caller, target) for update;
  if found then
    if existing.status = 'accepted' then
      return 'accepted';
    end if;
    if existing.requested_by = target then
      update public.friendships set status = 'accepted', accepted_at = now()
      where user_low = existing.user_low and user_high = existing.user_high;
      return 'accepted';
    end if;
    return 'pending';
  end if;

  select count(*) into outgoing from public.friendships f where f.requested_by = caller and f.status = 'pending';
  if outgoing >= 50 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = '53400';
  end if;
  insert into public.friendships (user_low, user_high, requested_by)
  values (least(caller, target), greatest(caller, target), caller);
  return 'pending';
end;
$$;

create or replace function public.respond_friend_request(p_user_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
    where user_low = least(caller, p_user_id) and user_high = greatest(caller, p_user_id)
      and status = 'pending' and requested_by = p_user_id;
    if not found then
      raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
    end if;
  else
    delete from public.friendships
    where user_low = least(caller, p_user_id) and user_high = greatest(caller, p_user_id) and status = 'pending';
  end if;
end;
$$;

-- Unfriend, or cancel a request you sent.
create or replace function public.remove_friend(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships
  where user_low = least((select auth.uid()), p_user_id) and user_high = greatest((select auth.uid()), p_user_id);
$$;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or p_user_id = caller or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.friendships where user_low = least(caller, p_user_id) and user_high = greatest(caller, p_user_id);
  insert into public.user_blocks (blocker_id, blocked_id) values (caller, p_user_id) on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = p_user_id;
$$;

-- =====================================================================================
-- 10) Direct messages and group DMs
-- =====================================================================================
create table public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  name text check (name is null or char_length(btrim(name)) between 1 and 64),
  owner_id uuid references public.profiles (id) on delete set null,
  direct_key text unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind = 'direct') = (direct_key is not null))
);

create table public.dm_participants (
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index dm_participants_user_idx on public.dm_participants (user_id);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  content text not null default '' check (char_length(content) <= 4000),
  sticker text check (sticker is null or sticker ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  reply_to_id uuid references public.direct_messages (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint direct_messages_not_empty check (char_length(btrim(content)) > 0 or sticker is not null)
);

create index direct_messages_conversation_idx on public.direct_messages (conversation_id, created_at desc, id desc);
create index direct_messages_author_idx on public.direct_messages (author_id, created_at desc);

create or replace function public.is_dm_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dm_participants p
    where p.conversation_id = p_conversation_id and p.user_id = (select auth.uid())
  );
$$;

-- Returns (creating if needed) the 1:1 conversation with a friend.
create or replace function public.open_dm(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  key text;
  conv uuid;
begin
  if caller is null or p_user_id is null or p_user_id = caller then
    raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
  end if;
  key := public.pair_key(caller, p_user_id);
  select c.id into conv from public.dm_conversations c where c.direct_key = key;
  if conv is not null then
    return conv;
  end if;
  if not public.are_friends(caller, p_user_id) or public.is_blocked_between(caller, p_user_id) then
    raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
  end if;
  insert into public.dm_conversations (kind, direct_key) values ('direct', key)
  on conflict (direct_key) do update set direct_key = excluded.direct_key
  returning id into conv;
  insert into public.dm_participants (conversation_id, user_id)
  values (conv, caller), (conv, p_user_id)
  on conflict do nothing;
  return conv;
end;
$$;

-- Group DMs: up to 10 people, and you can only add your friends.
create or replace function public.create_group_dm(p_user_ids uuid[], p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  others uuid[];
  other uuid;
  conv uuid;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select coalesce(array_agg(distinct u), '{}') into others from unnest(p_user_ids) as u where u is not null and u <> caller;
  if cardinality(others) < 2 or cardinality(others) > 9 then
    raise exception 'INVALID_GROUP_SIZE' using errcode = '23514';
  end if;
  foreach other in array others loop
    if not public.are_friends(caller, other) or public.is_blocked_between(caller, other) then
      raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
    end if;
  end loop;
  insert into public.dm_conversations (kind, name, owner_id)
  values ('group', nullif(btrim(coalesce(p_name, '')), ''), caller)
  returning id into conv;
  insert into public.dm_participants (conversation_id, user_id)
  select conv, u from unnest(array_append(others, caller)) as u;
  return conv;
end;
$$;

create or replace function public.add_to_group_dm(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if not exists (select 1 from public.dm_conversations c where c.id = p_conversation_id and c.kind = 'group')
     or not public.is_dm_participant(p_conversation_id)
     or not public.are_friends(caller, p_user_id)
     or public.is_blocked_between(caller, p_user_id) then
    raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
  end if;
  if (select count(*) from public.dm_participants p where p.conversation_id = p_conversation_id) >= 10 then
    raise exception 'INVALID_GROUP_SIZE' using errcode = '23514';
  end if;
  insert into public.dm_participants (conversation_id, user_id) values (p_conversation_id, p_user_id) on conflict do nothing;
end;
$$;

create or replace function public.rename_group_dm(p_conversation_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_dm_participant(p_conversation_id) then
    raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.dm_conversations set name = nullif(btrim(coalesce(p_name, '')), '')
  where id = p_conversation_id and kind = 'group';
end;
$$;

create or replace function public.leave_dm(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  conv record;
begin
  select * into conv from public.dm_conversations c where c.id = p_conversation_id;
  if not found or conv.kind <> 'group' or not public.is_dm_participant(p_conversation_id) then
    raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
  end if;
  delete from public.dm_participants where conversation_id = p_conversation_id and user_id = caller;
  if not exists (select 1 from public.dm_participants p where p.conversation_id = p_conversation_id) then
    delete from public.dm_conversations where id = p_conversation_id;
  elsif conv.owner_id = caller then
    update public.dm_conversations set owner_id = (
      select p.user_id from public.dm_participants p where p.conversation_id = p_conversation_id order by p.joined_at limit 1
    ) where id = p_conversation_id;
  end if;
end;
$$;

create or replace function public.mark_dm_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.dm_participants set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = (select auth.uid());
$$;

-- DMs: author + timestamps are server-set; 1:1 DMs need an unblocked friendship; phishing links
-- are always refused; 8 messages per 10 seconds across all DMs.
create or replace function public.direct_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  conv record;
  other uuid;
  recent int;
begin
  select c.kind into conv from public.dm_conversations c where c.id = new.conversation_id;
  if not found then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = '23503';
  end if;
  new.content := btrim(new.content);
  new.created_at := now();
  new.edited_at := null;

  if caller is not null then
    new.author_id := caller;
    if not public.is_dm_participant(new.conversation_id) then
      raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
    end if;
    if conv.kind = 'direct' then
      select p.user_id into other from public.dm_participants p
      where p.conversation_id = new.conversation_id and p.user_id <> caller limit 1;
      if other is null or not public.are_friends(caller, other) or public.is_blocked_between(caller, other) then
        raise exception 'DM_NOT_ALLOWED' using errcode = '42501';
      end if;
    end if;
    select count(*) into recent from public.direct_messages d
    where d.author_id = caller and d.created_at > now() - interval '10 seconds';
    if recent >= 8 then
      raise exception 'RATE_LIMITED' using errcode = '53400', hint = 'Dahan-dahan lang, kabayan. Try again in a few seconds.';
    end if;
    if public.automod_match(new.content, array['phishing']) is not null then
      raise exception 'AUTOMOD_BLOCKED' using errcode = '23514';
    end if;
  end if;

  if new.reply_to_id is not null and not exists (
    select 1 from public.direct_messages r where r.id = new.reply_to_id and r.conversation_id = new.conversation_id
  ) then
    new.reply_to_id := null;
  end if;
  return new;
end;
$$;

create trigger direct_messages_before_insert
  before insert on public.direct_messages
  for each row execute function public.direct_messages_before_insert();

create or replace function public.direct_messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.id <> old.id or new.conversation_id <> old.conversation_id
     or new.author_id is distinct from old.author_id or new.created_at <> old.created_at
     or new.sticker is distinct from old.sticker or new.reply_to_id is distinct from old.reply_to_id then
    raise exception 'MESSAGE_IMMUTABLE_FIELD' using errcode = '42501';
  end if;
  if new.content is distinct from old.content then
    new.content := btrim(new.content);
    new.edited_at := now();
    if public.automod_match(new.content, array['phishing']) is not null then
      raise exception 'AUTOMOD_BLOCKED' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger direct_messages_before_update
  before update on public.direct_messages
  for each row execute function public.direct_messages_before_update();

create or replace function public.direct_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dm_conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.dm_participants set last_read_at = new.created_at
  where conversation_id = new.conversation_id and user_id = new.author_id;
  return new;
end;
$$;

create trigger direct_messages_after_insert
  after insert on public.direct_messages
  for each row execute function public.direct_messages_after_insert();

-- =====================================================================================
-- 11) Privileges
-- =====================================================================================
revoke all on table
  public.audit_logs, public.server_bans, public.server_badges, public.lfg_beacons, public.lfg_party_members,
  public.soundboard_clips, public.friendships, public.user_blocks, public.dm_conversations,
  public.dm_participants, public.direct_messages
from anon;

-- Tables written only through RPCs/triggers are read-only for signed-in clients.
revoke insert, update, delete, truncate on table
  public.audit_logs, public.server_bans, public.lfg_beacons, public.lfg_party_members,
  public.friendships, public.user_blocks, public.dm_conversations, public.dm_participants
from authenticated;

-- Internal functions are not callable over the API at all.
revoke execute on function
  public.log_audit(uuid, text, text, uuid, jsonb),
  public.automod_match(text, text[], text[]),
  public.servers_normalize(),
  public.members_audit(),
  public.channels_audit(),
  public.messages_audit(),
  public.servers_audit(),
  public.messages_before_insert_community(),
  public.messages_before_update_community(),
  public.messages_thread_counters(),
  public.server_badges_before_insert(),
  public.server_badges_audit(),
  public.members_cleanup(),
  public.soundboard_clips_guard(),
  public.soundboard_clips_audit(),
  public.direct_messages_before_insert(),
  public.direct_messages_before_update(),
  public.direct_messages_after_insert()
from public, anon, authenticated;

revoke execute on function
  public.is_verified_user(),
  public.pair_key(uuid, uuid),
  public.ban_member(uuid, uuid, text),
  public.unban_member(uuid, uuid),
  public.create_lfg(uuid, text, text, integer, uuid, integer),
  public.join_lfg(uuid),
  public.leave_lfg(uuid),
  public.close_lfg(uuid),
  public.is_blocked_between(uuid, uuid),
  public.are_friends(uuid, uuid),
  public.send_friend_request(text),
  public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.is_dm_participant(uuid),
  public.open_dm(uuid),
  public.create_group_dm(uuid[], text),
  public.add_to_group_dm(uuid, uuid),
  public.rename_group_dm(uuid, text),
  public.leave_dm(uuid),
  public.mark_dm_read(uuid)
from public, anon;

grant execute on function
  public.is_verified_user(),
  public.pair_key(uuid, uuid),
  public.ban_member(uuid, uuid, text),
  public.unban_member(uuid, uuid),
  public.create_lfg(uuid, text, text, integer, uuid, integer),
  public.join_lfg(uuid),
  public.leave_lfg(uuid),
  public.close_lfg(uuid),
  public.is_blocked_between(uuid, uuid),
  public.are_friends(uuid, uuid),
  public.send_friend_request(text),
  public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.is_dm_participant(uuid),
  public.open_dm(uuid),
  public.create_group_dm(uuid[], text),
  public.add_to_group_dm(uuid, uuid),
  public.rename_group_dm(uuid, text),
  public.leave_dm(uuid),
  public.mark_dm_read(uuid)
to authenticated;

-- =====================================================================================
-- 12) Row-Level Security
-- =====================================================================================
alter table public.audit_logs enable row level security;
alter table public.server_bans enable row level security;
alter table public.server_badges enable row level security;
alter table public.lfg_beacons enable row level security;
alter table public.lfg_party_members enable row level security;
alter table public.soundboard_clips enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.dm_conversations enable row level security;
alter table public.dm_participants enable row level security;
alter table public.direct_messages enable row level security;

create policy "moderators read the audit log"
  on public.audit_logs for select to authenticated
  using (public.has_server_role(server_id, 'moderator'));

create policy "moderators read bans"
  on public.server_bans for select to authenticated
  using (public.has_server_role(server_id, 'moderator'));

create policy "members see badges"
  on public.server_badges for select to authenticated
  using (public.is_server_member(server_id));

create policy "admins grant badges"
  on public.server_badges for insert to authenticated
  with check (public.has_server_role(server_id, 'admin'));

create policy "admins revoke badges"
  on public.server_badges for delete to authenticated
  using (public.has_server_role(server_id, 'admin'));

create policy "members see beacons"
  on public.lfg_beacons for select to authenticated
  using (public.is_server_member(server_id));

create policy "members see parties"
  on public.lfg_party_members for select to authenticated
  using (public.is_server_member(server_id));

create policy "members see soundboard clips"
  on public.soundboard_clips for select to authenticated
  using (public.is_server_member(server_id));

create policy "admins add soundboard clips"
  on public.soundboard_clips for insert to authenticated
  with check (public.has_server_role(server_id, 'admin'));

create policy "admins rename soundboard clips"
  on public.soundboard_clips for update to authenticated
  using (public.has_server_role(server_id, 'admin'))
  with check (public.has_server_role(server_id, 'admin'));

create policy "admins remove soundboard clips"
  on public.soundboard_clips for delete to authenticated
  using (public.has_server_role(server_id, 'admin'));

create policy "users see their friendships"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create policy "users see who they blocked"
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "participants see conversations"
  on public.dm_conversations for select to authenticated
  using (public.is_dm_participant(id));

create policy "participants see each other"
  on public.dm_participants for select to authenticated
  using (public.is_dm_participant(conversation_id));

create policy "participants read messages"
  on public.direct_messages for select to authenticated
  using (public.is_dm_participant(conversation_id));

create policy "participants send messages as themselves"
  on public.direct_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_dm_participant(conversation_id));

create policy "authors edit their messages"
  on public.direct_messages for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "authors delete their messages"
  on public.direct_messages for delete to authenticated
  using (author_id = (select auth.uid()));

-- =====================================================================================
-- 13) Realtime: new tables + `dm:<conversation>` private topics
-- =====================================================================================
alter publication supabase_realtime add table
  public.lfg_beacons, public.lfg_party_members, public.soundboard_clips, public.server_badges,
  public.friendships, public.dm_conversations, public.dm_participants, public.direct_messages;

create or replace function public.can_access_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := split_part(p_topic, ':', 1);
  target uuid := public.try_uuid(split_part(p_topic, ':', 2));
begin
  if target is null then
    return false;
  end if;
  if kind = 'server' then
    return public.is_server_member(target);
  elsif kind = 'channel' then
    return public.is_server_member(public.channel_server_id(target));
  elsif kind = 'dm' then
    return public.is_dm_participant(target);
  end if;
  return false;
end;
$$;

-- =====================================================================================
-- 14) Storage: private soundboard bucket (MP3 only, 1 MB, `<server>/<uuid>.mp3`)
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soundboard', 'soundboard', false, 1048576, array['audio/mpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "members play soundboard clips"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'soundboard'
    and public.is_server_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "admins upload soundboard clips"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'soundboard'
    and public.has_server_role(public.try_uuid((storage.foldername(name))[1]), 'admin')
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$'
  );

create policy "admins delete soundboard clips"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'soundboard'
    and public.has_server_role(public.try_uuid((storage.foldername(name))[1]), 'admin')
  );
