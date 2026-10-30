-- Welcome messages: a deterministic automation. An admin picks a text channel and a template;
-- whenever someone joins, Diskarte posts it there (as "Welcome", like a webhook post), with
-- {user} → @username and {server} → the server name. A failed post never blocks the join.

alter table public.servers
  add column welcome_channel_id uuid references public.channels (id) on delete set null,
  add column welcome_message text check (welcome_message is null or char_length(btrim(welcome_message)) between 1 and 500);

-- Post-as-system marker for the webhook guard: set only inside this definer function, and
-- set_config isn't reachable through the API.
create or replace function public.messages_webhook_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.author_id is not null or ((select auth.uid()) is not null and coalesce(current_setting('diskarte.system_post', true), '') <> 'on') then
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

create or replace function public.post_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  srv record;
  who text;
  original text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  select s.name, s.welcome_channel_id, s.welcome_message into srv from public.servers s where s.id = new.server_id;
  if srv.welcome_channel_id is null or srv.welcome_message is null then
    return null;
  end if;
  select p.username into who from public.profiles p where p.id = new.user_id;
  begin
    -- Post as nobody (skips the joiner's own slow mode / verification) and mark it as a system post.
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('diskarte.system_post', 'on', true);
    insert into public.messages (channel_id, server_id, author_id, content, webhook_name)
    select c.id, c.server_id, null, replace(replace(srv.welcome_message, '{user}', '@' || coalesce(who, 'someone')), '{server}', srv.name), 'Welcome'
    from public.channels c where c.id = srv.welcome_channel_id and c.server_id = new.server_id and c.type::text = 'text';
  exception when others then
    null; -- never block joining over a greeting
  end;
  perform set_config('diskarte.system_post', '', true);
  perform set_config('request.jwt.claim.sub', original, true);
  return null;
end;
$$;

create trigger members_welcome
  after insert on public.members
  for each row execute function public.post_welcome_message();
