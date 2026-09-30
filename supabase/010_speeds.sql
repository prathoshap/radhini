-- =============================================================
--  Three speeds per adavu.
--
--  An adavu is learnt speed by speed — solid in the first, shaky in
--  the third. One status per step could not say that.
--
--  Not every milestone works this way: Hasta and Abhinaya have no
--  speeds. So it is a property of the milestone, and Radhini turns it
--  on where it belongs.
--
--  progress.status stays the single source of truth for everything
--  that reports — the views, the student's page. Speeds feed it
--  through a trigger, so nothing downstream needs to know they exist.
-- =============================================================

alter table milestones add column if not exists tracks_speed boolean not null default false;

create table if not exists step_speed (
  student_id  uuid not null references students (id) on delete cascade,
  step_id     uuid not null references steps (id)    on delete cascade,
  speed       smallint not null check (speed between 1 and 3),
  status      progress_status not null default 'not_started',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles (id),
  primary key (student_id, step_id, speed)
);

create index if not exists step_speed_student on step_speed (student_id);

alter table step_speed enable row level security;

drop policy if exists step_speed_select on step_speed;
drop policy if exists step_speed_write  on step_speed;

create policy step_speed_select on step_speed for select to authenticated
  using (can_view_student(student_id));
create policy step_speed_write on step_speed for all to authenticated
  using (is_instructor()) with check (is_instructor());

drop trigger if exists step_speed_touch on step_speed;
create trigger step_speed_touch
  before update on step_speed
  for each row execute function touch_updated_at();

-- ----------------------------------------------------------------
-- A step is Learnt when all three speeds are, Progressing once any
-- of them has moved, otherwise Not started. Writing it back into
-- progress keeps the views, percentages and the student's page
-- working exactly as they did.
-- ----------------------------------------------------------------
create or replace function sync_step_from_speeds()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_student uuid := coalesce(new.student_id, old.student_id);
  v_step    uuid := coalesce(new.step_id,    old.step_id);
  n_learnt  int;
  n_moved   int;
  derived   progress_status;
begin
  select count(*) filter (where status = 'complete'),
         count(*) filter (where status <> 'not_started')
    into n_learnt, n_moved
  from step_speed where student_id = v_student and step_id = v_step;

  derived := case when n_learnt >= 3 then 'complete'
                  when n_moved  > 0  then 'practising'
                  else 'not_started' end;

  insert into progress (student_id, step_id, status, updated_by)
  values (v_student, v_step, derived, coalesce(new.updated_by, old.updated_by))
  on conflict (student_id, step_id)
    do update set status = excluded.status, updated_at = now(),
                  updated_by = excluded.updated_by;

  return null;
end;
$$;

drop trigger if exists step_speed_sync on step_speed;
create trigger step_speed_sync
  after insert or update or delete on step_speed
  for each row execute function sync_step_from_speeds();

select 'ready' as status,
       (select count(*) from milestones where tracks_speed) as speed_milestones;
