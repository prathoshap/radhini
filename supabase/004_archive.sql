-- =============================================================
--  Make removal recoverable.
--
--  Deleting a milestone cascades to its steps and to every student's
--  progress against them — a term of history gone on one stray click,
--  with no undo. Archiving hides it from students and from the teacher
--  console while leaving every record intact.
--
--  Real deletion still exists, for genuine mistakes, but the editor
--  only offers it on something already archived.
--
--  Run after 003. Safe to run on a database with data in it.
-- =============================================================

alter table milestones add column if not exists archived boolean not null default false;
alter table steps      add column if not exists archived boolean not null default false;

create index if not exists milestones_live on milestones (batch_id, sort_order) where not archived;
create index if not exists steps_live      on steps      (milestone_id, sort_order) where not archived;

-- Views must ignore archived rows, or a student's percentage would
-- still count steps nobody teaches any more.
create or replace view milestone_progress
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
join milestones m on m.batch_id = s.batch_id and not m.archived
join steps st     on st.milestone_id = m.id  and not st.archived
left join progress p on p.step_id = st.id and p.student_id = s.id
group by s.id, m.id;

-- student_summary reads milestone_progress, so it inherits the filter.
