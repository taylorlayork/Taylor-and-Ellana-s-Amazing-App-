-- Taylor & Ellana Poster Board setup for Supabase
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- v54 adds reply deletion, media replies, more reactions, and updated unread behavior.

create table if not exists public.poster_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  kind text not null check (kind in ('message', 'photo', 'drawing')),
  body text,
  image_path text
);

alter table public.poster_posts add column if not exists last_activity_at timestamptz;
update public.poster_posts set last_activity_at = coalesce(last_activity_at, created_at, now());
alter table public.poster_posts alter column last_activity_at set default now();
alter table public.poster_posts alter column last_activity_at set not null;

create table if not exists public.poster_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.poster_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  kind text not null default 'message',
  body text,
  image_path text
);

create table if not exists public.poster_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.poster_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  emoji text not null check (emoji in ('❤️', '😂', '🥺', '🔥', '👍', '💀', '😡')),
  unique (post_id, author, emoji)
);

alter table public.poster_replies add column if not exists kind text;
alter table public.poster_replies add column if not exists image_path text;
alter table public.poster_replies alter column body drop not null;
update public.poster_replies set kind = coalesce(kind, 'message');
alter table public.poster_replies alter column kind set default 'message';
alter table public.poster_replies alter column kind set not null;
do $$
begin
  alter table public.poster_replies add constraint poster_replies_kind_check check (kind in ('message', 'photo', 'drawing', 'gif'));
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter table public.poster_replies add constraint poster_replies_has_content_check check ((body is not null and length(trim(body)) > 0) or image_path is not null);
exception
  when duplicate_object then null;
end $$;

alter table public.poster_reactions drop constraint if exists poster_reactions_emoji_check;
alter table public.poster_reactions add constraint poster_reactions_emoji_check check (emoji in ('❤️', '😂', '🥺', '🔥', '👍', '💀', '😡'));

alter table public.poster_posts enable row level security;
alter table public.poster_replies enable row level security;
alter table public.poster_reactions enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, delete on table public.poster_posts to anon, authenticated;
grant select, insert, delete on table public.poster_replies to anon, authenticated;
grant select, insert, delete on table public.poster_reactions to anon, authenticated;

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

drop policy if exists "Poster replies are readable" on public.poster_replies;
create policy "Poster replies are readable"
on public.poster_replies
for select
using (true);

drop policy if exists "Poster replies can be added" on public.poster_replies;
create policy "Poster replies can be added"
on public.poster_replies
for insert
with check (
  author in ('Taylor', 'Ellana')
  and kind in ('message', 'photo', 'drawing', 'gif')
  and ((body is not null and length(trim(body)) > 0) or image_path is not null)
);

drop policy if exists "Poster replies can be deleted" on public.poster_replies;
create policy "Poster replies can be deleted"
on public.poster_replies
for delete
using (true);

drop policy if exists "Poster reactions are readable" on public.poster_reactions;
create policy "Poster reactions are readable"
on public.poster_reactions
for select
using (true);

drop policy if exists "Poster reactions can be added" on public.poster_reactions;
create policy "Poster reactions can be added"
on public.poster_reactions
for insert
with check (author in ('Taylor', 'Ellana'));

drop policy if exists "Poster reactions can be deleted" on public.poster_reactions;
create policy "Poster reactions can be deleted"
on public.poster_reactions
for delete
using (true);

create or replace function public.touch_poster_post_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.poster_posts set last_activity_at = now() where id = old.post_id;
    return old;
  end if;

  update public.poster_posts set last_activity_at = now() where id = new.post_id;
  return new;
end;
$$;

drop trigger if exists poster_replies_touch_parent on public.poster_replies;
create trigger poster_replies_touch_parent
after insert or delete on public.poster_replies
for each row execute function public.touch_poster_post_activity();

drop trigger if exists poster_reactions_touch_parent on public.poster_reactions;
create trigger poster_reactions_touch_parent
after insert or delete on public.poster_reactions
for each row execute function public.touch_poster_post_activity();

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
alter table public.poster_replies replica identity full;
alter table public.poster_reactions replica identity full;

-- Let Supabase Realtime broadcast Poster Board activity.
do $$
begin
  alter publication supabase_realtime add table public.poster_posts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.poster_replies;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.poster_reactions;
exception
  when duplicate_object then null;
end $$;

-- v57 clean: reactions on replies
create table if not exists public.poster_reply_reactions (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid not null references public.poster_replies(id) on delete cascade,
  created_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  emoji text not null check (emoji in ('❤️', '😂', '🥺', '🔥', '👍', '💀', '😡')),
  unique (reply_id, author, emoji)
);

alter table public.poster_reply_reactions enable row level security;
grant select, insert, delete on table public.poster_reply_reactions to anon, authenticated;

drop policy if exists "Poster reply reactions are readable" on public.poster_reply_reactions;
create policy "Poster reply reactions are readable"
on public.poster_reply_reactions
for select
using (true);

drop policy if exists "Poster reply reactions can be added" on public.poster_reply_reactions;
create policy "Poster reply reactions can be added"
on public.poster_reply_reactions
for insert
with check (author in ('Taylor', 'Ellana'));

drop policy if exists "Poster reply reactions can be deleted" on public.poster_reply_reactions;
create policy "Poster reply reactions can be deleted"
on public.poster_reply_reactions
for delete
using (true);

alter table public.poster_reply_reactions replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.poster_reply_reactions;
exception
  when duplicate_object then null;
end $$;
