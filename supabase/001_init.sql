-- =============================================================
--  Kalaashaala Student Portal — schema + row level security
--  Run once, in the Supabase SQL editor, on a fresh project.
--
--  Design notes
--   * Students and guardians have READ-ONLY access, everywhere.
--     Only the instructor writes. This mirrors the rule from the
--     original design: "Mark each item only after teacher approval."
--   * Access control is enforced by the database, not by app code.
--     A buggy query returns nothing rather than another child's data.
--   * Progress percentages are never stored — they are derived in
--     the views at the bottom, so they cannot drift out of sync.
-- =============================================================

-- ----------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------
create type user_role       as enum ('student', 'instructor');
create type progress_status as enum ('not_started', 'practising', 'awaiting_assessment', 'complete');

-- ----------------------------------------------------------------
-- 2. People
-- ----------------------------------------------------------------

-- One row per login. Mirrors auth.users, which we never touch directly.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'student',
  created_at  timestamptz not null default now()
);

-- One row per dancer. Deliberately NOT tied to a login: a six year old
-- has a record here but no account, and a parent's single login can
-- reach several of these.
create table students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  batch_id    uuid,                        -- fk added after batches exists
  joined_on   date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- The join that makes the mixed student/parent audience work.
-- An older student is simply their own guardian.
create table guardianships (
  profile_id  uuid not null references profiles (id) on delete cascade,
  student_id  uuid not null references students (id) on delete cascade,
  relation    text,                        -- 'self', 'parent', 'guardian'
  primary key (profile_id, student_id)
);

-- ----------------------------------------------------------------
-- 3. Curriculum  (instructor-editable)
-- ----------------------------------------------------------------
create table batches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  level       text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table students
  add constraint students_batch_id_fkey
  foreign key (batch_id) references batches (id) on delete set null;

create table milestones (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references batches (id) on delete cascade,
  name         text not null,
  description  text,
  sort_order   int  not null default 0
);

-- The individual adavus, jathis, korvais.
create table steps (
  id            uuid primary key default gen_random_uuid(),
  milestone_id  uuid not null references milestones (id) on delete cascade,
  name          text not null,
  note          text,
  sort_order    int  not null default 0
);

-- ----------------------------------------------------------------
-- 4. Progress and assessment
-- ----------------------------------------------------------------
create table progress (
  student_id  uuid not null references students (id) on delete cascade,
  step_id     uuid not null references steps (id) on delete cascade,
  status      progress_status not null default 'not_started',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles (id),
  primary key (student_id, step_id)
);

-- 'precision' is a Postgres keyword (double precision), hence _score.
create table assessments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students (id) on delete cascade,
  milestone_id  uuid not null references milestones (id) on delete cascade,
  rhythm            smallint check (rhythm            between 0 and 100),
  precision_score   smallint check (precision_score   between 0 and 100),
  coordination      smallint check (coordination      between 0 and 100),
  note          text,
  assessed_on   date not null default current_date,
  assessed_by   uuid references profiles (id),
  created_at    timestamptz not null default now()
);

create table practice_sessions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students (id) on delete cascade,
  session_date  date not null default current_date,
  minutes       int check (minutes > 0),
  note          text
);

-- ----------------------------------------------------------------
-- 5. Achievements
-- ----------------------------------------------------------------
create table badges (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  icon         text,
  description  text,
  sort_order   int not null default 0
);

create table student_badges (
  student_id  uuid not null references students (id) on delete cascade,
  badge_id    uuid not null references badges (id) on delete cascade,
  awarded_on  date not null default current_date,
  primary key (student_id, badge_id)
);

-- ----------------------------------------------------------------
-- 6. Indexes
-- ----------------------------------------------------------------
create index on students          (batch_id);
create index on guardianships     (student_id);
create index on milestones        (batch_id, sort_order);
create index on steps             (milestone_id, sort_order);
create index on progress          (student_id);
create index on assessments       (student_id, milestone_id);
create index on practice_sessions (student_id, session_date);
create index on student_badges    (student_id);

-- ----------------------------------------------------------------
-- 7. New login -> profile row
-- ----------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Keep progress.updated_at honest.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger progress_touch
  before update on progress
  for each row execute function touch_updated_at();

-- ----------------------------------------------------------------
-- 8. Authorisation helpers
--
--    SECURITY DEFINER matters here: these read `profiles` and
--    `guardianships`, which are themselves behind RLS. Without it the
--    policies below would recurse infinitely.
-- ----------------------------------------------------------------
create or replace function is_instructor()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'instructor'
  );
$$;

create or replace function can_view_student(sid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select is_instructor() or exists (
    select 1 from guardianships
    where student_id = sid and profile_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------
-- 9. Row level security
--
--    Shape of it: everyone signed in may read the curriculum;
--    families may read only their own dancers' records;
--    only the instructor may write anything at all.
-- ----------------------------------------------------------------
alter table profiles          enable row level security;
alter table students          enable row level security;
alter table guardianships     enable row level security;
alter table batches           enable row level security;
alter table milestones        enable row level security;
alter table steps             enable row level security;
alter table progress          enable row level security;
alter table assessments       enable row level security;
alter table practice_sessions enable row level security;
alter table badges            enable row level security;
alter table student_badges    enable row level security;

-- profiles: see yourself; instructor sees everyone; rename yourself only
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_instructor());
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_write_instructor on profiles for all to authenticated
  using (is_instructor()) with check (is_instructor());

-- Stop anyone promoting themselves to instructor. This is a trigger
-- rather than a WITH CHECK clause on purpose: a policy on `profiles`
-- that sub-selects from `profiles` recurses and errors at runtime.
create or replace function guard_profile_role()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not is_instructor() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on profiles
  for each row execute function guard_profile_role();

-- curriculum: readable by all signed-in users, writable by instructor
create policy batches_select    on batches    for select to authenticated using (true);
create policy milestones_select on milestones for select to authenticated using (true);
create policy steps_select      on steps      for select to authenticated using (true);
create policy badges_select     on badges     for select to authenticated using (true);

create policy batches_write    on batches    for all to authenticated using (is_instructor()) with check (is_instructor());
create policy milestones_write on milestones for all to authenticated using (is_instructor()) with check (is_instructor());
create policy steps_write      on steps      for all to authenticated using (is_instructor()) with check (is_instructor());
create policy badges_write     on badges     for all to authenticated using (is_instructor()) with check (is_instructor());

-- dancers and their records: family reads own, instructor reads all,
-- instructor alone writes
create policy students_select on students for select to authenticated
  using (can_view_student(id));
create policy students_write  on students for all to authenticated
  using (is_instructor()) with check (is_instructor());

create policy guardianships_select on guardianships for select to authenticated
  using (profile_id = auth.uid() or is_instructor());
create policy guardianships_write  on guardianships for all to authenticated
  using (is_instructor()) with check (is_instructor());

create policy progress_select on progress for select to authenticated
  using (can_view_student(student_id));
create policy progress_write  on progress for all to authenticated
  using (is_instructor()) with check (is_instructor());

create policy assessments_select on assessments for select to authenticated
  using (can_view_student(student_id));
create policy assessments_write  on assessments for all to authenticated
  using (is_instructor()) with check (is_instructor());

create policy practice_select on practice_sessions for select to authenticated
  using (can_view_student(student_id));
create policy practice_write  on practice_sessions for all to authenticated
  using (is_instructor()) with check (is_instructor());

create policy student_badges_select on student_badges for select to authenticated
  using (can_view_student(student_id));
create policy student_badges_write  on student_badges for all to authenticated
  using (is_instructor()) with check (is_instructor());

-- ----------------------------------------------------------------
-- 10. Derived progress
--
--     security_invoker = true means these views respect the RLS of
--     whoever is querying, rather than the view owner's. Without it
--     the views would be a hole straight through section 9.
-- ----------------------------------------------------------------
create view milestone_progress
  with (security_invoker = true) as
select
  s.id                                             as student_id,
  m.id                                             as milestone_id,
  m.batch_id,
  m.name,
  m.sort_order,
  count(st.id)                                     as total_steps,
  count(*) filter (where p.status = 'complete')    as completed_steps,
  case when count(st.id) = 0 then 0
       else round(100.0 * count(*) filter (where p.status = 'complete') / count(st.id))
  end                                              as percent_complete
from students s
join milestones m on m.batch_id = s.batch_id
join steps st     on st.milestone_id = m.id
left join progress p on p.step_id = st.id and p.student_id = s.id
group by s.id, m.id;

create view student_summary
  with (security_invoker = true) as
select
  s.id                                                as student_id,
  s.full_name,
  s.batch_id,
  b.name                                              as batch_name,
  coalesce(sum(mp.completed_steps), 0)                as steps_complete,
  coalesce(sum(mp.total_steps), 0)                    as steps_total,
  count(*) filter (where mp.percent_complete = 100)   as milestones_complete,
  count(mp.milestone_id)                              as milestones_total,
  case when coalesce(sum(mp.total_steps), 0) = 0 then 0
       else round(100.0 * sum(mp.completed_steps) / sum(mp.total_steps))
  end                                                 as percent_complete
from students s
left join batches b            on b.id = s.batch_id
left join milestone_progress mp on mp.student_id = s.id
group by s.id, b.name;
