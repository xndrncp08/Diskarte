-- Incoming webhooks: an admin creates a secret URL for a text channel; anything that can make an
-- HTTP POST (a CI job, a form, a home-made bot) can then post plain messages there. Not a user:
-- webhook messages have no author, show the webhook's name, can't ping @everyone/@here (that needs
-- a moderator author) and are throttled per webhook.

create table public.channel_webhooks (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  -- sha256 of the secret token, hex. The token itself is shown once, when created or rotated.
  token_hash text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index channel_webhooks_server_idx on public.channel_webhooks (server_id);

alter table public.channel_webhooks enable row level security;
revoke all on table public.channel_webhooks from anon, authenticated;
-- No token_hash: nobody reads it back.
grant select (id, server_id, channel_id, name, created_by, created_at, last_used_at) on table public.channel_webhooks to authenticated;
grant delete on table public.channel_webhooks to authenticated;

create policy "admins see their server's webhooks"
  on public.channel_webhooks for select to authenticated
  using (public.has_server_role(server_id, 'admin'));

create policy "admins delete their server's webhooks"
  on public.channel_webhooks for delete to authenticated
  using (public.has_server_role(server_id, 'admin'));

alter table public.messages
  add column webhook_id uuid references public.channel_webhooks (id) on delete set null,
  -- The name it posted under, kept after the webhook is renamed or deleted.
  add column webhook_name text check (webhook_name is null or char_length(webhook_name) <= 32);

-- Creates (p_id null) or rotates a webhook; returns its id and the new secret token.
create or replace function public.save_channel_webhook(p_channel uuid, p_name text, p_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  server uuid;
  token text := encode(extensions.gen_random_bytes(24), 'hex');
  hook uuid;
begin
  select c.server_id into server from public.channels c where c.id = p_channel and c.type::text = 'text';
  if server is null or not public.has_server_role(server, 'admin') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_id is null then
    if (select count(*) from public.channel_webhooks where server_id = server) >= 15 then
      raise exception 'WEBHOOK_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.channel_webhooks (server_id, channel_id, name, token_hash, created_by)
    values (server, p_channel, btrim(p_name), encode(extensions.digest(token, 'sha256'), 'hex'), (select auth.uid()))
    returning id into hook;
    perform public.log_audit(server, 'webhook.create', 'channel', p_channel, jsonb_build_object('name', btrim(p_name)));
  else
    update public.channel_webhooks
    set name = btrim(p_name), channel_id = p_channel, token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
    where id = p_id and server_id = server
    returning id into hook;
    if hook is null then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
    perform public.log_audit(server, 'webhook.rotate', 'channel', p_channel, jsonb_build_object('name', btrim(p_name)));
  end if;
  return jsonb_build_object('id', hook, 'token', token);
end;
$$;

revoke all on function public.save_channel_webhook(uuid, text, uuid) from public, anon;
grant execute on function public.save_channel_webhook(uuid, text, uuid) to authenticated;

-- Posts as a webhook. Callable without a session (the token is the credential); the HTTP route in
-- front of it validates input and rate-limits by address. Returns the message id.
create or replace function public.post_webhook_message(p_id uuid, p_token text, p_content text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook public.channel_webhooks;
  message uuid;
begin
  select * into hook from public.channel_webhooks
  where id = p_id and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if hook.id is null then
    raise exception 'WEBHOOK_NOT_FOUND' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_content, ''))) not between 1 and 2000 then
    raise exception 'INVALID_CONTENT' using errcode = '22023';
  end if;
  if (select count(*) from public.messages m where m.webhook_id = hook.id and m.created_at > now() - interval '60 seconds') >= 30 then
    raise exception 'WEBHOOK_RATE_LIMITED' using errcode = '53400';
  end if;
  insert into public.messages (channel_id, server_id, author_id, content, webhook_id, webhook_name)
  values (hook.channel_id, hook.server_id, null, p_content, hook.id,
          coalesce(nullif(left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 32), ''), hook.name))
  returning id into message;
  update public.channel_webhooks set last_used_at = now() where id = hook.id;
  return message;
end;
$$;

revoke all on function public.post_webhook_message(uuid, text, text, text) from public, authenticated;
-- Only without a session, so no signed-in person's rules or identity mix into a webhook post.
grant execute on function public.post_webhook_message(uuid, text, text, text) to anon, service_role;

-- Only post_webhook_message sets the webhook fields: a person can't post or edit as a webhook.
create or replace function public.messages_webhook_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null or new.author_id is not null then
      new.webhook_id := null;
      new.webhook_name := null;
    end if;
  -- Deleting a webhook nulls webhook_id (kept name); nothing else may change them.
  elsif new.webhook_name is distinct from old.webhook_name or (new.webhook_id is distinct from old.webhook_id and new.webhook_id is not null) then
    raise exception 'WEBHOOK_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_webhook_guard
  before insert or update of webhook_id, webhook_name on public.messages
  for each row execute function public.messages_webhook_guard();
