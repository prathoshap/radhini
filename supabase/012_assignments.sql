-- =============================================================
--  Weekly assignments, done or not done.
--
--  The practice log asked for a date, a duration and a note, per
--  student, every week. For fifteen students that is fifteen visits
--  and forty-five fields. She will not do it, and she is right not to.
--
--  An assignment belongs to a batch and a week. She writes it once.
--  Each student is then one tick.
--
--  practice_sessions stays untouched but unused; nothing reads it now.
-- =============================================================

create table if not exists assignments (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references batches (id) on delete cascade,
  year        int  not null,
  week        int  not null check (week between 1 and 53),
  task        text not null check (length(btrim(task)) > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles (id),
  unique (batch_id, year, week)
);

create index if not exists assignments_batch_week on assignments (batch_id, year desc, week desc);

create table if not exists assignment_done (
  assignment_id uuid not null references assignments (id) on delete cascade,
  student_id    uuid not null references students (id)    on delete cascade,
  done          boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles (id),
  primary key (assignment_id, student_id)
);

create index if not exists assignment_done_student on assignment_done (student_id);

alter table assignments     enable row level security;
alter table assignment_done enable row level security;

drop policy if exists assignments_select on assignments;
drop policy if exists assignments_write  on assignments;
drop policy if exists assignment_done_select on assignment_done;
drop policy if exists assignment_done_write  on assignment_done;

-- A student may read the assignments set for their own batch.
create policy assignments_select on assignments for select to authenticated
  using (
    is_instructor() or exists (
      select 1 from students s
      where s.batch_id = assignments.batch_id and can_view_student(s.id)
    )
  );
create policy assignments_write on assignments for all to authenticated
  using (is_instructor()) with check (is_instructor());

create policy assignment_done_select on assignment_done for select to authenticated
  using (can_view_student(student_id));
create policy assignment_done_write on assignment_done for all to authenticated
  using (is_instructor()) with check (is_instructor());

drop trigger if exists assignment_done_touch on assignment_done;
create trigger assignment_done_touch
  before update on assignment_done
  for each row execute function touch_updated_at();

-- ----------------------------------------------------------------
-- How many has each student done? Replaces the practice count on
-- their page.
-- ----------------------------------------------------------------
create or replace view assignment_tally
  with (security_invoker = true) as
select
  s.id                                        as student_id,
  count(a.id)                                 as assignments_set,
  count(*) filter (where ad.done)             as assignments_done
from students s
left join assignments a      on a.batch_id = s.batch_id
left join assignment_done ad on ad.assignment_id = a.id and ad.student_id = s.id
group by s.id;

select 'ready' as status;
-- The practice heading is now the weekly assignment.
update portal_labels
   set value = 'This week''s assignment', default_value = 'This week''s assignment',
       description = 'Heading on the tracker tab'
 where key = 'h_practice' and value = 'Practice log';

update portal_labels
   set value = 'Assignments', default_value = 'Assignments',
       description = 'Under the third number'
 where key = 'stat_practices' and value = 'Practices';

select key, value from portal_labels where key in ('h_practice','stat_practices');
