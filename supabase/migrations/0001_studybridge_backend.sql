create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.create_entity_table(table_name text)
returns void as $$
begin
  execute format(
    'create table if not exists public.%I (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete set null,
      data jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )',
    table_name
  );

  execute format('alter table public.%I enable row level security', table_name);

  execute format('drop policy if exists "%I_read_all" on public.%I', table_name, table_name);
  execute format('drop policy if exists "%I_insert_all" on public.%I', table_name, table_name);
  execute format('drop policy if exists "%I_update_own_or_demo" on public.%I', table_name, table_name);
  execute format('drop policy if exists "%I_delete_own_or_demo" on public.%I', table_name, table_name);

  execute format(
    'create policy "%I_read_all" on public.%I for select using (true)',
    table_name,
    table_name
  );
  execute format(
    'create policy "%I_insert_all" on public.%I for insert with check (true)',
    table_name,
    table_name
  );
  execute format(
    'create policy "%I_update_own_or_demo" on public.%I for update using (auth.uid() = user_id or user_id is null)',
    table_name,
    table_name
  );
  execute format(
    'create policy "%I_delete_own_or_demo" on public.%I for delete using (auth.uid() = user_id or user_id is null)',
    table_name,
    table_name
  );
end;
$$ language plpgsql;

select public.create_entity_table('courses');
select public.create_entity_table('flashcards');
select public.create_entity_table('flashcard_decks');
select public.create_entity_table('notes');
select public.create_entity_table('quizzes');
select public.create_entity_table('quiz_questions');
select public.create_entity_table('saved_ai_answers');
select public.create_entity_table('study_guides');
select public.create_entity_table('study_materials');
select public.create_entity_table('study_sessions');
select public.create_entity_table('tasks');
select public.create_entity_table('topics');
select public.create_entity_table('topic_masteries');

alter table public.profiles enable row level security;
drop policy if exists "profiles_read_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_read_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('study-materials', 'study-materials', true)
on conflict (id) do nothing;

drop policy if exists "study_materials_storage_read" on storage.objects;
drop policy if exists "study_materials_storage_insert" on storage.objects;

create policy "study_materials_storage_read"
on storage.objects for select
using (bucket_id = 'study-materials');

create policy "study_materials_storage_insert"
on storage.objects for insert
with check (bucket_id = 'study-materials');
