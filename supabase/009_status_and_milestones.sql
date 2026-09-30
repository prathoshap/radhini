-- =============================================================
--  Radhini's wording, and a status for milestones without steps.
--
--  Three states, not four: Not started, Progressing, Learnt.
--  "Awaiting assessment" never earned its place — anything sitting
--  there becomes Progressing.
--
--  Milestones like "Hasta" or "Abhinaya" have no steps to tick, so
--  they were invisible in a student's progress. They now carry a
--  status of their own.
-- =============================================================

-- Anything waiting on assessment is simply in progress.
update progress set status = 'practising' where status = 'awaiting_assessment';

-- ----------------------------------------------------------------
-- A status for a milestone in its own right.
-- ----------------------------------------------------------------
create table if not exists milestone_status (
  student_id    uuid not null references students (id)   on delete cascade,
  milestone_id  uuid not null references milestones (id) on delete cascade,
  status        progress_status not null default 'not_started',
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles (id),
  primary key (student_id, milestone_id)
);

create index if not exists milestone_status_student on milestone_status (student_id);

alter table milestone_status enable row level security;

drop policy if exists milestone_status_select on milestone_status;
drop policy if exists milestone_status_write  on milestone_status;

create policy milestone_status_select on milestone_status for select to authenticated
  using (can_view_student(student_id));
create policy milestone_status_write on milestone_status for all to authenticated
  using (is_instructor()) with check (is_instructor());

drop trigger if exists milestone_status_touch on milestone_status;
create trigger milestone_status_touch
  before update on milestone_status
  for each row execute function touch_updated_at();

-- ----------------------------------------------------------------
-- The view has to stop hiding step-less milestones.
--
-- It inner-joined steps, so a milestone with nothing to tick simply
-- vanished from a student's path. Left join, and fall back to the
-- milestone's own status when there are no steps.
-- ----------------------------------------------------------------
drop view if exists student_summary;
drop view if exists milestone_progress;

create view milestone_progress
  with (security_invoker = true) as
select
  s.id                                                  as student_id,
  m.id                                                  as milestone_id,
  m.batch_id,
  m.name,
  m.sort_order,
  count(st.id)                                          as total_steps,
  count(p.step_id) filter (where p.status = 'complete') as completed_steps,
  coalesce(ms.status, 'not_started')                    as milestone_status,
  case
    when count(st.id) > 0 then
      round(100.0 * count(p.step_id) filter (where p.status = 'complete') / count(st.id))
    else
      case coalesce(ms.status, 'not_started')
        when 'complete'   then 100
        when 'practising' then 50
        else 0
      end
  end                                                   as percent_complete
from students s
join milestones m       on m.batch_id = s.batch_id and not m.archived
left join steps st      on st.milestone_id = m.id  and not st.archived
left join progress p    on p.step_id = st.id and p.student_id = s.id
left join milestone_status ms on ms.milestone_id = m.id and ms.student_id = s.id
group by s.id, m.id, ms.status;

-- Overall progress is now the average across milestones, so one with
-- no steps still counts for something.
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
  coalesce(round(avg(mp.percent_complete)), 0)        as percent_complete
from students s
left join batches b             on b.id = s.batch_id
left join milestone_progress mp on mp.student_id = s.id
group by s.id, b.name;

select 'milestones now visible without steps' as check,
       count(*) from milestone_progress where total_steps = 0;
