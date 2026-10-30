-- Moments: optional 24-hour text/photo updates for friends, kept apart from messaging. Audience is
-- all friends or only the friends you favourited. Expired moments vanish for viewers (the author
-- still sees and can delete them; the platform job purges them after a day).

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text check (body is null or char_length(btrim(body)) between 1 and 280),
  -- <author>/<file> in the private "moments" bucket.
  image_path text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp|gif)$'),
  audience text not null default 'friends' check (audience in ('friends', 'favourites')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (body is not null or image_path is not null),
  check (expires_at <= created_at + interval '24 hours')
);

create index moments_author_idx on public.moments (author_id, created_at desc);
create index moments_expiry_idx on public.moments (expires_at);

-- Is `target` one of `owner`'s favourites? (friend_favourites itself is private to its owner.)
create or replace function public.is_favourite_of(owner uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.friend_favourites f where f.owner_id = owner and f.target_id = target);
$$;

revoke all on function public.is_favourite_of(uuid, uuid) from public, anon;
grant execute on function public.is_favourite_of(uuid, uuid) to authenticated;

create or replace function public.can_see_moment(p_author uuid, p_audience text, p_expires timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_author = (select auth.uid())
    or (
      p_expires > now()
      and public.are_friends((select auth.uid()), p_author)
      and not public.is_blocked_between((select auth.uid()), p_author)
      and (p_audience = 'friends' or public.is_favourite_of(p_author, (select auth.uid())))
    );
$$;

revoke all on function public.can_see_moment(uuid, text, timestamptz) from public, anon;
grant execute on function public.can_see_moment(uuid, text, timestamptz) to authenticated;

alter table public.moments enable row level security;
revoke all on table public.moments from anon, authenticated;
grant select, delete on table public.moments to authenticated;
grant insert (body, image_path, audience) on table public.moments to authenticated;

create policy "friends see live moments meant for them"
  on public.moments for select to authenticated
  using (public.can_see_moment(author_id, audience, expires_at));

create policy "people share their own moments"
  on public.moments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (image_path is null or split_part(image_path, '/', 1) = (select auth.uid())::text)
  );

create policy "authors delete their moments"
  on public.moments for delete to authenticated
  using (author_id = (select auth.uid()));

-- At most 10 live moments per person.
create or replace function public.moments_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.moments where author_id = new.author_id and expires_at > now()) >= 10 then
    raise exception 'MOMENT_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger moments_limit before insert on public.moments for each row execute function public.moments_limit();

-- Muting hides someone's moments from you without unfriending them.
create table public.moment_mutes (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  primary key (owner_id, target_id),
  check (owner_id <> target_id)
);

alter table public.moment_mutes enable row level security;
revoke all on table public.moment_mutes from anon, authenticated;
grant select, insert, delete on table public.moment_mutes to authenticated;

create policy "people manage their own moment mutes"
  on public.moment_mutes for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Photos: private bucket; the author uploads to their folder; viewers can read a file only while
-- a moment they can see points at it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "people upload moment photos to their folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "viewers read photos of moments they can see"
  on storage.objects for select to authenticated
  using (bucket_id = 'moments' and exists (select 1 from public.moments m where m.image_path = name));

create policy "authors delete their moment photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Purge moments a day after they expire (rows only; the client removes its own photos on delete).
create or replace function public.tick_platform()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.publish_scheduled_messages();
  perform public.clear_expired_custom_statuses();
  delete from public.moments where expires_at < now() - interval '1 day';
end;
$$;
