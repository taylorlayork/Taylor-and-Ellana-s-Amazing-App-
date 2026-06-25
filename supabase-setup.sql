-- Taylor & Ellana Poster Board setup for Supabase
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- v43 includes explicit DELETE grants/policies for the Poster Board delete button.

create table if not exists public.poster_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  kind text not null check (kind in ('message', 'photo', 'drawing')),
  body text,
  image_path text
);

alter table public.poster_posts enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, delete on table public.poster_posts to anon, authenticated;

drop policy if exists "Poster board posts are readable" on public.poster_posts;
create policy "Poster board posts are readable"
on public.poster_posts
for select
using (true);

drop policy if exists "Poster board posts can be added" on public.poster_posts;
create policy "Poster board posts can be added"
on public.poster_posts
for insert
with check (
  author in ('Taylor', 'Ellana')
  and kind in ('message', 'photo', 'drawing')
);

drop policy if exists "Poster board posts can be deleted" on public.poster_posts;
create policy "Poster board posts can be deleted"
on public.poster_posts
for delete
using (true);

insert into storage.buckets (id, name, public)
values ('poster-media', 'poster-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Poster media is readable" on storage.objects;
create policy "Poster media is readable"
on storage.objects
for select
using (bucket_id = 'poster-media');

drop policy if exists "Poster media can be uploaded" on storage.objects;
create policy "Poster media can be uploaded"
on storage.objects
for insert
with check (bucket_id = 'poster-media');

drop policy if exists "Poster media can be deleted" on storage.objects;
create policy "Poster media can be deleted"
on storage.objects
for delete
using (bucket_id = 'poster-media');

alter table public.poster_posts replica identity full;

-- Let Supabase Realtime broadcast new poster_posts rows.
do $$
begin
  alter publication supabase_realtime add table public.poster_posts;
exception
  when duplicate_object then null;
end $$;
