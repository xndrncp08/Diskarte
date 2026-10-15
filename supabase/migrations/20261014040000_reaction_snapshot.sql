-- One statement snapshot avoids offset-pagination races and PostgREST's row-count truncation.
create function public.get_reactions_snapshot(p_channel uuid, p_messages uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reactions r
  where public.mfa_ok() and not public.is_platform_banned() and r.channel_id = p_channel
    and cardinality(p_messages) between 1 and 100 and r.message_id = any(p_messages);
$$;
revoke all on function public.get_reactions_snapshot(uuid,uuid[]) from public, anon;
grant execute on function public.get_reactions_snapshot(uuid,uuid[]) to authenticated;
