-- Taylor & Ellana Poster Board setup for Supabase
-- v58 adds Taylor fixed login and first-time Ellana account claiming.
-- Paste this whole file into Supabase > SQL Editor > New query > Run.

create table if not exists public.poster_allowed_users (
  email text primary key,
  display_name text not null check (display_name in ('Taylor', 'Ellana'))
);

insert into public.poster_allowed_users (email, display_name)
values ('taylorlayork@yahoo.com', 'Taylor')
on conflict (email) do update set display_name = excluded.display_name;

delete from public.poster_allowed_users
where email in ('taylor@example.com', 'ellana@example.com');

create table if not exists public.poster_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  author_email text,
  kind text not null check (kind in ('message', 'photo', 'drawing')),
  body text,
  image_path text,
  is_public boolean not null default false
);
alter table public.poster_posts add column if not exists last_activity_at timestamptz;
update public.poster_posts set last_activity_at = coalesce(last_activity_at, created_at, now());
alter table public.poster_posts alter column last_activity_at set default now();
alter table public.poster_posts alter column last_activity_at set not null;
alter table public.poster_posts add column if not exists author_email text;
alter table public.poster_posts add column if not exists is_public boolean not null default false;

create table if not exists public.poster_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.poster_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  kind text not null default 'message',
  body text,
  image_path text,
  is_public boolean not null default false
);
alter table public.poster_replies add column if not exists kind text;
alter table public.poster_replies add column if not exists image_path text;
alter table public.poster_replies add column if not exists is_public boolean not null default false;
update public.poster_replies set kind = coalesce(kind, 'message');
alter table public.poster_replies alter column kind set default 'message';
alter table public.poster_replies alter column kind set not null;
alter table public.poster_replies drop constraint if exists poster_replies_kind_check;
alter table public.poster_replies add constraint poster_replies_kind_check check (kind in ('message', 'photo', 'drawing', 'gif'));
alter table public.poster_replies drop constraint if exists poster_replies_has_content_check;
alter table public.poster_replies add constraint poster_replies_has_content_check check ((body is not null and length(trim(body)) > 0) or image_path is not null);

create table if not exists public.poster_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.poster_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  emoji text not null check (emoji in ('❤️', '😂', '🥺', '🔥', '👍', '💀', '😡')),
  unique (post_id, author, emoji)
);
alter table public.poster_reactions drop constraint if exists poster_reactions_emoji_check;
alter table public.poster_reactions add constraint poster_reactions_emoji_check check (emoji in ('❤️', '😂', '🥺', '🔥', '👍', '💀', '😡'));

alter table public.poster_allowed_users enable row level security;
alter table public.poster_posts enable row level security;
alter table public.poster_replies enable row level security;
alter table public.poster_reactions enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.poster_allowed_users to anon, authenticated;
grant select, insert, delete on public.poster_posts to anon, authenticated;
grant select, insert, delete on public.poster_replies to anon, authenticated;
grant select, insert, delete on public.poster_reactions to anon, authenticated;

drop policy if exists "Allowed users can see allowlist" on public.poster_allowed_users;
create policy "Allowed users can see allowlist" on public.poster_allowed_users for select using (true);

drop policy if exists "Poster posts select" on public.poster_posts;
create policy "Poster posts select" on public.poster_posts for select using (is_public = true or exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))));
drop policy if exists "Poster posts insert" on public.poster_posts;
create policy "Poster posts insert" on public.poster_posts for insert with check (exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')) and u.display_name = author) and kind in ('message', 'photo', 'drawing'));
drop policy if exists "Poster posts delete" on public.poster_posts;
create policy "Poster posts delete" on public.poster_posts for delete using (exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))));

drop policy if exists "Poster replies select" on public.poster_replies;
create policy "Poster replies select" on public.poster_replies for select using (is_public = true or exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))));
drop policy if exists "Poster replies insert" on public.poster_replies;
create policy "Poster replies insert" on public.poster_replies for insert with check (exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')) and u.display_name = author) and kind in ('message', 'photo', 'drawing', 'gif') and ((body is not null and length(trim(body)) > 0) or image_path is not null));
drop policy if exists "Poster replies delete" on public.poster_replies;
create policy "Poster replies delete" on public.poster_replies for delete using (exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))));

drop policy if exists "Poster reactions select" on public.poster_reactions;
create policy "Poster reactions select" on public.poster_reactions for select using (exists (select 1 from public.poster_posts p where p.id = post_id and (p.is_public = true or exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))))));
drop policy if exists "Poster reactions insert" on public.poster_reactions;
create policy "Poster reactions insert" on public.poster_reactions for insert with check (exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')) and u.display_name = author));
drop policy if exists "Poster reactions delete" on public.poster_reactions;
create policy "Poster reactions delete" on public.poster_reactions for delete using (exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))));

create or replace function public.claim_ellana_account()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requester text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if requester is null or requester = '' then
    raise exception 'Sign in with email first';
  end if;
  if requester = 'taylorlayork@yahoo.com' then
    return 'Taylor';
  end if;
  if exists (select 1 from public.poster_allowed_users where display_name = 'Ellana') then
    if exists (select 1 from public.poster_allowed_users where lower(email) = requester and display_name = 'Ellana') then
      return 'Ellana';
    end if;
    raise exception 'Ellana account has already been claimed';
  end if;
  insert into public.poster_allowed_users(email, display_name)
  values (requester, 'Ellana');
  return 'Ellana';
end;
$$;
grant execute on function public.claim_ellana_account() to authenticated;

create or replace function public.touch_poster_post_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.poster_posts set last_activity_at = now() where id = old.post_id;
    return old;
  end if;
  update public.poster_posts set last_activity_at = now() where id = new.post_id;
  return new;
end; $$;

drop trigger if exists poster_replies_touch_parent on public.poster_replies;
create trigger poster_replies_touch_parent after insert or delete on public.poster_replies for each row execute function public.touch_poster_post_activity();
drop trigger if exists poster_reactions_touch_parent on public.poster_reactions;
create trigger poster_reactions_touch_parent after insert or delete on public.poster_reactions for each row execute function public.touch_poster_post_activity();


-- v61 Feelings + heart-envelope messages
create table if not exists public.feelings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author text not null check (author in ('Taylor', 'Ellana')),
  author_email text,
  feeling text not null,
  note text
);

create table if not exists public.heart_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  sender text not null check (sender in ('Taylor', 'Ellana')),
  sender_email text,
  recipient text not null check (recipient in ('Taylor', 'Ellana')),
  body text not null check (length(trim(body)) > 0)
);

alter table public.feelings enable row level security;
alter table public.heart_messages enable row level security;

grant select, insert, delete on public.feelings to anon, authenticated;
grant select, insert, update, delete on public.heart_messages to anon, authenticated;

drop policy if exists "Feelings select allowed users" on public.feelings;
create policy "Feelings select allowed users" on public.feelings for select using (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')))
);
drop policy if exists "Feelings insert matching user" on public.feelings;
create policy "Feelings insert matching user" on public.feelings for insert with check (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')) and u.display_name = author)
);
drop policy if exists "Feelings delete allowed users" on public.feelings;
create policy "Feelings delete allowed users" on public.feelings for delete using (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')))
);

drop policy if exists "Heart messages select allowed users" on public.heart_messages;
create policy "Heart messages select allowed users" on public.heart_messages for select using (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')))
);
drop policy if exists "Heart messages insert matching sender" on public.heart_messages;
create policy "Heart messages insert matching sender" on public.heart_messages for insert with check (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')) and u.display_name = sender)
);
drop policy if exists "Heart messages update recipient" on public.heart_messages;
create policy "Heart messages update recipient" on public.heart_messages for update using (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')) and u.display_name = recipient)
) with check (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')) and u.display_name = recipient)
);
drop policy if exists "Heart messages delete allowed users" on public.heart_messages;
create policy "Heart messages delete allowed users" on public.heart_messages for delete using (
  exists (select 1 from public.poster_allowed_users u where lower(u.email) = lower(coalesce(auth.jwt()->>'email','')))
);

alter table public.feelings replica identity full;
alter table public.heart_messages replica identity full;

do $$ begin alter publication supabase_realtime add table public.feelings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.heart_messages; exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public) values ('poster-media', 'poster-media', true) on conflict (id) do update set public = true;
drop policy if exists "Poster media is readable" on storage.objects;
create policy "Poster media is readable" on storage.objects for select using (bucket_id = 'poster-media');
drop policy if exists "Poster media can be uploaded" on storage.objects;
create policy "Poster media can be uploaded" on storage.objects for insert with check (bucket_id = 'poster-media');
drop policy if exists "Poster media can be deleted" on storage.objects;
create policy "Poster media can be deleted" on storage.objects for delete using (bucket_id = 'poster-media');

alter table public.poster_posts replica identity full;
alter table public.poster_replies replica identity full;
alter table public.poster_reactions replica identity full;

do $$ begin alter publication supabase_realtime add table public.poster_posts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.poster_replies; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.poster_reactions; exception when duplicate_object then null; end $$;
