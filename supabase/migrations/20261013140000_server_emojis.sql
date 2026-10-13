-- =====================================================================================
-- Custom server emoji (Discord's): admins upload small PNG/GIF/WebP images with a :name:
-- that members use in messages and reactions in that server. Up to 50 per server.
-- Images live in a public `emoji` bucket as `<server>/<uuid>.<ext>`.
-- =====================================================================================

create table public.server_emojis (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|gif|webp)$'),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (server_id, name),
  check (split_part(path, '/', 1) = server_id::text)
);
create index server_emojis_creator_idx on public.server_emojis (created_by);

alter table public.server_emojis enable row level security;
revoke all on table public.server_emojis from anon, authenticated;
grant select, insert, delete on table public.server_emojis to authenticated;

create policy "members see the server's emoji"
  on public.server_emojis for select to authenticated
  using (public.is_server_member(server_id));
create policy "admins add emoji"
  on public.server_emojis for insert to authenticated
  with check (public.has_server_role(server_id, 'admin') and created_by = (select auth.uid()));
create policy "admins remove emoji"
  on public.server_emojis for delete to authenticated
  using (public.has_server_role(server_id, 'admin'));

create or replace function public.server_emojis_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.servers s where s.id = new.server_id for update;
  if (select count(*) from public.server_emojis e where e.server_id = new.server_id) >= 50 then
    raise exception 'TOO_MANY_EMOJI' using errcode = '53400';
  end if;
  return new;
end;
$$;
create trigger server_emojis_limit
  before insert on public.server_emojis
  for each row execute function public.server_emojis_limit();

alter publication supabase_realtime add table public.server_emojis;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emoji', 'emoji', true, 262144, array['image/png', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "admins upload server emoji"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'emoji'
    and public.has_server_role(public.try_uuid((storage.foldername(name))[1]), 'admin')
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|gif|webp)$'
  );

create policy "admins delete server emoji"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'emoji'
    and public.has_server_role(public.try_uuid((storage.foldername(name))[1]), 'admin')
  );
