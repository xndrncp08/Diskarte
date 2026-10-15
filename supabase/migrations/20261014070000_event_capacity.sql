-- Additive RSVP accounting; updates serialize on the event row to prevent overbooking.
alter table public.server_events add column capacity integer check(capacity between 1 and 10000);
alter table public.server_events add column rsvp_count integer not null default 0 check(rsvp_count>=0);
update public.server_events e set rsvp_count=(select count(*) from public.event_rsvps r where r.event_id=e.id);
alter table public.server_events add constraint event_capacity_bound check(capacity is null or rsvp_count<=capacity);
create function public.guard_event_count() returns trigger language plpgsql set search_path='' as $$
begin
  if (select auth.uid()) is not null and pg_trigger_depth()=1 then
    if (tg_op='INSERT' and new.rsvp_count<>0) or (tg_op='UPDATE' and new.rsvp_count<>old.rsvp_count) then
      raise exception 'EVENT_COUNT_IMMUTABLE' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger event_count_guard before insert or update on public.server_events for each row execute function public.guard_event_count();
create function public.update_event_count() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    update public.server_events set rsvp_count=rsvp_count+1 where id=new.event_id and (capacity is null or rsvp_count<capacity);
    if not found then raise exception 'EVENT_FULL' using errcode='23514'; end if;
  else
    update public.server_events set rsvp_count=greatest(0,rsvp_count-1) where id=old.event_id;
  end if;
  return null;
end;
$$;
-- AFTER excludes ignored duplicate RSVPs from the count (INSERT ON CONFLICT DO NOTHING).
create trigger event_rsvp_count after insert or delete on public.event_rsvps for each row execute function public.update_event_count();
revoke all on function public.guard_event_count(), public.update_event_count() from public,anon,authenticated;

-- Only the caller's own RSVP is returned. Counts are independent of PostgREST's row limit.
create function public.list_server_events(p_server uuid)
returns table(id uuid,server_id uuid,channel_id uuid,location text,name text,description text,starts_at timestamptz,ends_at timestamptz,created_by uuid,created_at timestamptz,capacity integer,rsvp_count integer,interested boolean)
language sql stable security invoker set search_path='' as $$
  select e.id,e.server_id,e.channel_id,e.location,e.name,e.description,e.starts_at,e.ends_at,e.created_by,e.created_at,e.capacity,e.rsvp_count,
    exists(select 1 from public.event_rsvps r where r.event_id=e.id and r.user_id=(select auth.uid()))
  from public.server_events e where e.server_id=p_server and public.mfa_ok() and not public.is_platform_banned()
    and coalesce(e.ends_at,e.starts_at+interval '4 hours')>now()
  order by e.starts_at,e.id limit 200;
$$;
revoke all on function public.list_server_events(uuid) from public,anon;
grant execute on function public.list_server_events(uuid) to authenticated;
